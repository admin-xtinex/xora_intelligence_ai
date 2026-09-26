import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { featureValues, type RawSetup } from "./features.ts";
import {
  dot,
  intelligenceScore,
  l2normalize,
  neighborhoodStats,
  round4,
  sigmoid,
  standardize,
  topSimilar,
} from "./stats.ts";

type Store = {
  version: string;
  featureVersion: string;
  indexVersion: string;
  modelVersion: string;
  datasetVersion: string;
  source: string;
  window: { start: string; end: string };
  featureNames: string[];
  scaler: { mean: number[]; std: number[] };
  model: {
    weights: number[];
    bias: number;
    trainRatio: number;
    trainCount: number;
    trainLogLoss: number;
  };
  baseline: {
    sampleSize: number;
    successRate: number;
    meanOutcome: number;
    medianOutcome: number;
  };
  calibration: { similarityP10: number; similarityP90: number };
  evaluation: {
    name: string;
    indexCount: number;
    testCount: number;
    baseRate: number;
    topQuartileRate: number;
    bottomQuartileRate: number;
    lift: number;
    modelBrier: number;
    meanSimilarity: number;
  }[];
  presets: {
    id: string;
    label: string;
    note: string;
    recordId: string;
    data: RawSetup;
    realized: { roiPct: number; exitType: string; success: boolean };
  }[];
  records: {
    id: string[];
    t: number[];
    symbol: string[];
    strategy: string[];
    direction: string[];
    exitType: string[];
    outcome: number[];
    success: number[];
    vector: number[][];
  };
};

const store = JSON.parse(
  readFileSync(fileURLToPath(new URL("./store.json", import.meta.url)), "utf8"),
) as Store;

export type AnalyzeOptions = {
  k?: number;
  includeNeighbors?: boolean;
  excludeRecordId?: string;
};

export function serviceMeta() {
  return {
    version: store.version,
    versions: {
      featureVersion: store.featureVersion,
      indexVersion: store.indexVersion,
      modelVersion: store.modelVersion,
      datasetVersion: store.datasetVersion,
    },
    source: store.source,
    window: store.window,
    recordCount: store.records.id.length,
    featureCount: store.featureNames.length,
    baseline: store.baseline,
    calibration: store.calibration,
    evaluation: store.evaluation,
    model: {
      version: store.modelVersion,
      trainCount: store.model.trainCount,
      trainRatio: store.model.trainRatio,
      trainLogLoss: store.model.trainLogLoss,
    },
    presets: store.presets,
    index: store.records.id.length > 0 ? "ready" : "empty",
    modelStatus: store.model.weights.length === store.featureNames.length ? "ready" : "missing",
  };
}

export function healthBody() {
  const meta = serviceMeta();
  return {
    status: meta.index === "ready" && meta.modelStatus === "ready" ? "ok" : "degraded",
    index: meta.index,
    model: meta.modelStatus,
  };
}

export function analyzeSetup(raw: RawSetup, options: AnalyzeOptions = {}) {
  const k = options.k ?? 100;
  const values = featureValues(raw);
  if (values.length !== store.featureNames.length) {
    throw new Error("feature width does not match the index");
  }
  const scaled = standardize(values, store.scaler.mean, store.scaler.std);
  const query = l2normalize(scaled);
  const prediction = sigmoid(dot(scaled, store.model.weights) + store.model.bias);
  const exclude = options.excludeRecordId;
  const hits = topSimilar(query, store.records.vector, k, (index) => store.records.id[index] === exclude);
  const rows = hits.map((hit) => ({
    similarity: hit.similarity,
    outcome: store.records.outcome[hit.index],
    success: store.records.success[hit.index],
    index: hit.index,
  }));
  const stats = neighborhoodStats(rows);
  const { score, reliability } = intelligenceScore({
    weightedSuccessRate: stats.weightedSuccessRate,
    modelPrediction: prediction,
    sampleSize: stats.sampleSize,
    similarity: stats.similarity,
    outcomeStd: stats.outcomeStd,
    similarityP10: store.calibration.similarityP10,
    similarityP90: store.calibration.similarityP90,
  });

  const body: Record<string, unknown> = {
    score,
    reliability,
    sampleSize: stats.sampleSize,
    similarity: round4(stats.similarity),
    statistics: {
      weightedSuccessRate: round4(stats.weightedSuccessRate),
      meanOutcome: round4(stats.meanOutcome),
      medianOutcome: round4(stats.medianOutcome),
      expectancy: round4(stats.expectancy),
    },
    model: { prediction: round4(prediction) },
    version: store.version,
  };

  if (options.includeNeighbors) {
    body.versions = {
      featureVersion: store.featureVersion,
      indexVersion: store.indexVersion,
      modelVersion: store.modelVersion,
      datasetVersion: store.datasetVersion,
    };
    body.baseline = store.baseline;
    body.neighbors = rows.slice(0, 12).map((row) => ({
      id: store.records.id[row.index],
      symbol: store.records.symbol[row.index],
      strategy: store.records.strategy[row.index],
      direction: store.records.direction[row.index],
      exitType: store.records.exitType[row.index],
      similarity: round4(row.similarity),
      outcome: round4(row.outcome),
      success: row.success === 1,
      timestamp: new Date(store.records.t[row.index]).toISOString(),
    }));
    body.distribution = rows.map((row) => row.outcome);
  }

  return body;
}

/**
 * Offline index build. Reads the Xora trade export and writes the serving store.
 * Run: node --experimental-strip-types scripts/build-intelligence.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { featureNames, featureValues, type RawSetup } from "../src/features.ts";
import {
  dot,
  l2normalize,
  neighborhoodStats,
  round4,
  sigmoid,
  standardize,
  topSimilar,
} from "../src/stats.ts";

type ClosedTrade = {
  id: string;
  t: number;
  symbol: string;
  strategy: string;
  direction: string;
  exitType: string;
  outcome: number;
  success: number;
  raw: RawSetup;
  values: number[];
};

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((cells) => cells.length >= header.length && cells.some(Boolean)).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = cells[index] ?? "";
    });
    return record;
  });
}

function num(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fitScaler(rows: number[][]): { mean: number[]; std: number[] } {
  const d = rows[0].length;
  const mean = new Array<number>(d).fill(0);
  for (const row of rows) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= rows.length;
  const std = new Array<number>(d).fill(0);
  for (const row of rows) {
    for (let j = 0; j < d; j++) {
      const dlt = row[j] - mean[j];
      std[j] += dlt * dlt;
    }
  }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / rows.length) || 1;
  return { mean, std };
}

function fitLogReg(x: number[][], y: number[], l2 = 1.5, steps = 240, lr = 0.35): { weights: number[]; bias: number; logLoss: number } {
  const n = x.length;
  const d = x[0].length;
  const weights = new Array<number>(d).fill(0);
  let bias = 0;
  for (let step = 0; step < steps; step++) {
    const grad = new Array<number>(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) z += x[i][j] * weights[j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) grad[j] += err * x[i][j];
      gradB += err;
    }
    for (let j = 0; j < d; j++) weights[j] -= lr * (grad[j] / n + (l2 * weights[j]) / n);
    bias -= lr * (gradB / n);
  }
  let loss = 0;
  for (let i = 0; i < n; i++) {
    let z = bias;
    for (let j = 0; j < d; j++) z += x[i][j] * weights[j];
    const p = clamp01(sigmoid(z));
    loss += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
  }
  return { weights, bias, logLoss: loss / n };
}

function clamp01(p: number): number {
  return Math.min(1 - 1e-9, Math.max(1e-9, p));
}

function scaleAll(rows: number[][], mean: number[], std: number[]): number[][] {
  return rows.map((row) => standardize(row, mean, std));
}

function predict(row: number[], weights: number[], bias: number): number {
  return sigmoid(dot(row, weights) + bias);
}

type EvalWindow = {
  name: string;
  indexCount: number;
  testCount: number;
  baseRate: number;
  topQuartileRate: number;
  bottomQuartileRate: number;
  lift: number;
  modelBrier: number;
  meanSimilarity: number;
};

function evaluateWindow(trades: ClosedTrade[], indexEnd: number, testEnd: number, name: string): EvalWindow {
  const index = trades.slice(0, indexEnd);
  const test = trades.slice(indexEnd, testEnd);
  const scaler = fitScaler(index.map((trade) => trade.values));
  const indexScaled = scaleAll(
    index.map((trade) => trade.values),
    scaler.mean,
    scaler.std,
  );
  const model = fitLogReg(
    indexScaled,
    index.map((trade) => trade.success),
    2,
    160,
    0.4,
  );
  const matrix = indexScaled.map((row) => l2normalize(row));
  const scored: { score: number; success: number; similarity: number; brier: number }[] = [];
  for (const trade of test) {
    const z = standardize(trade.values, scaler.mean, scaler.std);
    const query = l2normalize(z);
    const hits = topSimilar(query, matrix, 100, () => false);
    const stats = neighborhoodStats(
      hits.map((hit) => ({
        similarity: hit.similarity,
        outcome: index[hit.index].outcome,
        success: index[hit.index].success,
      })),
    );
    const modelP = predict(z, model.weights, model.bias);
    const blended = 0.6 * stats.weightedSuccessRate + 0.4 * modelP;
    const diff = modelP - trade.success;
    scored.push({
      score: blended,
      success: trade.success,
      similarity: stats.similarity,
      brier: diff * diff,
    });
  }
  const base = scored.reduce((sum, row) => sum + row.success, 0) / scored.length;
  const ordered = [...scored].sort((a, b) => b.score - a.score);
  const q = Math.max(1, Math.floor(ordered.length / 4));
  const top = ordered.slice(0, q);
  const bottom = ordered.slice(-q);
  const rate = (rows: typeof scored) => rows.reduce((sum, row) => sum + row.success, 0) / rows.length;
  const topRate = rate(top);
  return {
    name,
    indexCount: index.length,
    testCount: test.length,
    baseRate: round4(base),
    topQuartileRate: round4(topRate),
    bottomQuartileRate: round4(rate(bottom)),
    lift: round4(base === 0 ? 0 : topRate / base),
    modelBrier: round4(scored.reduce((sum, row) => sum + row.brier, 0) / scored.length),
    meanSimilarity: round4(scored.reduce((sum, row) => sum + row.similarity, 0) / scored.length),
  };
}

function toSetup(row: Record<string, string>): RawSetup | null {
  const roi = num(row.roiPct);
  const entry = num(row.entryPrice);
  const ema7 = num(row.ema7);
  const ema25 = num(row.ema25);
  if (roi == null || entry == null || ema7 == null || ema25 == null) return null;
  const stamp = row.timestampUtc ? Date.parse(row.timestampUtc) : Number.NaN;
  if (!Number.isFinite(stamp)) return null;
  const hour = new Date(stamp).getUTCHours();
  return {
    confidence: num(row.confidence) ?? 0,
    opportunityScore: num(row.opportunityScore) ?? 0,
    breakoutScore: num(row.breakoutScore) ?? 0,
    rsi14: num(row.rsi14) ?? 50,
    buyerPressure: num(row.buyerPressure) ?? 50,
    volumeAccelPct: num(row.volumeAccelPct) ?? 0,
    atrPctOfPrice: num(row.atrPctOfPrice) ?? 0,
    expectedRR: num(row.expectedRR) ?? 0,
    riskROIPct: num(row.riskROIPct) ?? 0,
    rewardROIPct: num(row.rewardROIPct) ?? 0,
    liquidity: num(row.liquidity) ?? 0,
    leverage: num(row.leverage) ?? 1,
    btcVolatilityPct: num(row.btcVolatilityPct) ?? 0,
    feeRoiPct: num(row.feeRoiPct) ?? 0,
    volume: num(row.volume) ?? 0,
    entryPrice: entry,
    ema7,
    ema25,
    entryZoneLow: num(row.entryZoneLow) ?? entry,
    entryZoneHigh: num(row.entryZoneHigh) ?? entry,
    hourUtc: hour,
    strategy: row.strategy || "OTHER",
    direction: row.direction || "OTHER",
    trend: row.trend || "OTHER",
    btcTrend: row.btcTrend || "OTHER",
    microState: row.microState || "OTHER",
  };
}

function pickPreset(
  trades: ClosedTrade[],
  id: string,
  label: string,
  note: string,
  match: (trade: ClosedTrade) => boolean,
): { id: string; label: string; note: string; recordId: string; data: RawSetup; realized: { roiPct: number; exitType: string; success: boolean } } | null {
  const found = trades.find(match);
  if (!found) return null;
  return {
    id,
    label,
    note,
    recordId: found.id,
    data: found.raw,
    realized: {
      roiPct: round4(found.outcome * 100),
      exitType: found.exitType,
      success: found.success === 1,
    },
  };
}

const csvPath = process.argv[2] ?? "/tmp/trades.csv";
const csv = readFileSync(csvPath, "utf8");
const table = parseCsv(csv);
const trades: ClosedTrade[] = [];
for (const row of table) {
  const raw = toSetup(row);
  if (!raw) continue;
  const success = String(row.tradeSuccessful).toLowerCase() === "true" ? 1 : 0;
  const stamp = Date.parse(row.timestampUtc);
  trades.push({
    id: row.tradeId || row.sessionId,
    t: stamp,
    symbol: row.symbol,
    strategy: raw.strategy,
    direction: raw.direction,
    exitType: row.exitType || "UNKNOWN",
    outcome: (num(row.roiPct) ?? 0) / 100,
    success,
    raw,
    values: featureValues(raw),
  });
}
trades.sort((a, b) => a.t - b.t);

const names = featureNames();
if (trades.some((trade) => trade.values.length !== names.length)) {
  throw new Error("feature width mismatch");
}

const trainEnd = Math.floor(trades.length * 0.7);
const scaler = fitScaler(trades.slice(0, trainEnd).map((trade) => trade.values));
const trainScaled = scaleAll(
  trades.slice(0, trainEnd).map((trade) => trade.values),
  scaler.mean,
  scaler.std,
);
const model = fitLogReg(
  trainScaled,
  trades.slice(0, trainEnd).map((trade) => trade.success),
);
const allScaled = scaleAll(
  trades.map((trade) => trade.values),
  scaler.mean,
  scaler.std,
);
const vectors = allScaled.map((row) => l2normalize(row).map((value) => round4(value)));

const n = trades.length;
const evaluation = [
  evaluateWindow(trades, Math.floor(n * 0.4), Math.floor(n * 0.55), "Window 1 · early book"),
  evaluateWindow(trades, Math.floor(n * 0.6), Math.floor(n * 0.75), "Window 2 · mid book"),
  evaluateWindow(trades, Math.floor(n * 0.8), n, "Window 3 · late book"),
];

const probe: number[] = [];
for (let i = 0; i < n; i += 12) {
  const hits = topSimilar(vectors[i], vectors, 100, (index) => index === i);
  if (hits.length === 0) continue;
  probe.push(hits.reduce((sum, hit) => sum + hit.similarity, 0) / hits.length);
}
probe.sort((a, b) => a - b);
const p10 = probe[Math.floor(probe.length * 0.1)] ?? 0;
const p90 = probe[Math.floor(probe.length * 0.9)] ?? 1;

const outcomes = trades.map((trade) => trade.outcome);
const successes = trades.reduce((sum, trade) => sum + trade.success, 0);

const presets = [
  pickPreset(
    trades,
    "protected",
    "Profit protection",
    "A reversal the engine later protected. Neighbors exclude this trade.",
    (trade) => trade.exitType === "PROFIT_PROTECTION" && trade.success === 1 && trade.raw.confidence >= 70 && trade.raw.confidence <= 90,
  ),
  pickPreset(
    trades,
    "stopped",
    "Stopped out",
    "Stop-loss reversal near the middle of the confidence range.",
    (trade) => trade.exitType === "STOP_LOSS" && trade.success === 0 && trade.raw.confidence >= 70 && trade.raw.confidence <= 85,
  ),
  pickPreset(
    trades,
    "breakout",
    "Breakout",
    "Breakout strategy, bullish local trend.",
    (trade) => trade.strategy === "BREAKOUT" && trade.raw.trend === "BULLISH" && trade.exitType === "TIME_STOP",
  ),
  pickPreset(
    trades,
    "exhaustion",
    "TP exhaustion",
    "Take-profit exhaustion — the rare full target.",
    (trade) => trade.exitType === "TP_EXHAUSTION",
  ),
  pickPreset(
    trades,
    "structure",
    "Structure break",
    "The most common exit in this book. Usually a loss.",
    (trade) => trade.exitType === "STRUCTURE_BREAK" && trade.direction === "SHORT" && trade.raw.microState === "Fake Breakout Risk",
  ),
  pickPreset(
    trades,
    "long",
    "Executed long",
    "One of the minority long executions.",
    (trade) => trade.direction === "LONG" && trade.strategy === "REVERSAL" && trade.exitType === "TIME_STOP",
  ),
].filter((preset) => preset != null);

const store = {
  version: "1.0.0",
  featureVersion: "features-1.0",
  indexVersion: "flat-cosine-2026-09-26",
  modelVersion: "logreg-1.0",
  datasetVersion: `xora-5day-${trades.length}`,
  source: "admin-xtinex/xora_intelligence_ai · xora_5day_export/trades.csv",
  window: {
    start: new Date(trades[0].t).toISOString(),
    end: new Date(trades[trades.length - 1].t).toISOString(),
  },
  featureNames: names,
  scaler: {
    mean: scaler.mean.map((value) => round4(value)),
    std: scaler.std.map((value) => round4(value)),
  },
  model: {
    weights: model.weights.map((value) => round4(value)),
    bias: round4(model.bias),
    trainRatio: 0.7,
    trainCount: trainEnd,
    trainLogLoss: round4(model.logLoss),
  },
  baseline: {
    sampleSize: trades.length,
    successRate: round4(successes / trades.length),
    meanOutcome: round4(outcomes.reduce((sum, value) => sum + value, 0) / outcomes.length),
    medianOutcome: round4(median(outcomes)),
  },
  calibration: {
    similarityP10: round4(p10),
    similarityP90: round4(p90),
  },
  evaluation,
  presets,
  records: {
    id: trades.map((trade) => trade.id),
    t: trades.map((trade) => trade.t),
    symbol: trades.map((trade) => trade.symbol),
    strategy: trades.map((trade) => trade.strategy),
    direction: trades.map((trade) => trade.direction),
    exitType: trades.map((trade) => trade.exitType),
    outcome: trades.map((trade) => round4(trade.outcome)),
    success: trades.map((trade) => trade.success),
    vector: vectors,
  },
};

const out = "src/lib/intelligence/store.json";
writeFileSync(out, JSON.stringify(store));
console.log(
  JSON.stringify(
    {
      records: trades.length,
      features: names.length,
      trainLogLoss: store.model.trainLogLoss,
      baseline: store.baseline,
      calibration: store.calibration,
      evaluation,
      presets: presets.map((preset) => preset.id),
      bytes: Buffer.byteLength(JSON.stringify(store)),
    },
    null,
    2,
  ),
);

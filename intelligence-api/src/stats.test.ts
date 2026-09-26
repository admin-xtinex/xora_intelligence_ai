import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_SETUP, featureNames, featureValues } from "./features.ts";
import { intelligenceScore, l2normalize, neighborhoodStats, topSimilar } from "./stats.ts";

test("feature fingerprint is stable and finite", () => {
  const names = featureNames();
  const values = featureValues(EMPTY_SETUP);
  assert.equal(values.length, names.length);
  assert.equal(new Set(names).size, names.length);
  assert.ok(values.every((value) => Number.isFinite(value)));
});

test("similarity weights pull expectancy toward the closer outcome", () => {
  const stats = neighborhoodStats([
    { similarity: 0.9, outcome: 0.2, success: 1 },
    { similarity: 0.1, outcome: -0.2, success: 0 },
  ]);
  assert.equal(stats.sampleSize, 2);
  assert.ok(stats.expectancy > stats.meanOutcome);
  assert.ok(stats.weightedSuccessRate > 0.5);
  assert.equal(stats.medianOutcome, 0);
});

test("score stays inside 0-100 and rises with the win rate", () => {
  const low = intelligenceScore({
    weightedSuccessRate: 0.2,
    modelPrediction: 0.2,
    sampleSize: 100,
    similarity: 0.7,
    outcomeStd: 0.05,
    similarityP10: 0.5,
    similarityP90: 0.8,
  });
  const high = intelligenceScore({
    weightedSuccessRate: 0.8,
    modelPrediction: 0.8,
    sampleSize: 100,
    similarity: 0.7,
    outcomeStd: 0.05,
    similarityP10: 0.5,
    similarityP90: 0.8,
  });
  assert.ok(high.score > low.score);
  assert.ok(low.score >= 0 && high.score <= 100);
  assert.ok(high.reliability >= 0 && high.reliability <= 100);
});

test("search prefers the nearer row and drops a perfect duplicate", () => {
  const matrix = [l2normalize([1, 0.15]), [0, 1], [1, 0]];
  const hits = topSimilar([1, 0], matrix, 5, () => false);
  assert.equal(hits[0].index, 0);
  assert.ok(hits[0].similarity > 0.9);
  assert.ok(hits[0].similarity < 0.999);
});

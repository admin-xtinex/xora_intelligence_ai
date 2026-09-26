/** Pure retrieval statistics. Independent of how neighbors were found. */

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function sigmoid(z: number): number {
  const x = clamp(z, -30, 30);
  return 1 / (1 + Math.exp(-x));
}

export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function standardize(values: number[], mean: number[], std: number[]): number[] {
  return values.map((value, i) => {
    const scale = std[i] || 1;
    return (value - mean[i]) / scale;
  });
}

export function l2normalize(values: number[]): number[] {
  let sum = 0;
  for (const value of values) sum += value * value;
  const norm = Math.sqrt(sum) || 1;
  return values.map((value) => value / norm);
}

export type NeighborStat = {
  similarity: number;
  outcome: number;
  success: number;
};

export type NeighborhoodStats = {
  sampleSize: number;
  similarity: number;
  weightedSuccessRate: number;
  meanOutcome: number;
  medianOutcome: number;
  expectancy: number;
  outcomeStd: number;
};

export function neighborhoodStats(rows: NeighborStat[]): NeighborhoodStats {
  const n = rows.length;
  if (n === 0) {
    return {
      sampleSize: 0,
      similarity: 0,
      weightedSuccessRate: 0,
      meanOutcome: 0,
      medianOutcome: 0,
      expectancy: 0,
      outcomeStd: 0,
    };
  }
  let weightSum = 0;
  let weightedSuccess = 0;
  let weightedOutcome = 0;
  let outcomeSum = 0;
  let similaritySum = 0;
  const outcomes: number[] = [];
  for (const row of rows) {
    const weight = Math.max(row.similarity, 1e-6);
    weightSum += weight;
    weightedSuccess += weight * (row.success ? 1 : 0);
    weightedOutcome += weight * row.outcome;
    outcomeSum += row.outcome;
    similaritySum += row.similarity;
    outcomes.push(row.outcome);
  }
  outcomes.sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? outcomes[mid] : (outcomes[mid - 1] + outcomes[mid]) / 2;
  const mean = outcomeSum / n;
  let varSum = 0;
  for (const outcome of outcomes) {
    const d = outcome - mean;
    varSum += d * d;
  }
  return {
    sampleSize: n,
    similarity: similaritySum / n,
    weightedSuccessRate: weightedSuccess / weightSum,
    meanOutcome: mean,
    medianOutcome: median,
    expectancy: weightedOutcome / weightSum,
    outcomeStd: Math.sqrt(varSum / n),
  };
}

export function intelligenceScore(input: {
  weightedSuccessRate: number;
  modelPrediction: number;
  sampleSize: number;
  similarity: number;
  outcomeStd: number;
  similarityP10: number;
  similarityP90: number;
}): { score: number; reliability: number } {
  const blended = 0.6 * input.weightedSuccessRate + 0.4 * input.modelPrediction;
  const score = Math.round(clamp(blended, 0, 1) * 100);
  const nFactor = 1 - Math.exp(-input.sampleSize / 50);
  const span = input.similarityP90 - input.similarityP10 || 1;
  const simFactor = clamp((input.similarity - input.similarityP10) / span, 0, 1);
  const stability = 1 - clamp(input.outcomeStd / 0.25, 0, 1);
  const reliability = Math.round(clamp(0.5 * nFactor + 0.35 * simFactor + 0.15 * stability, 0, 1) * 100);
  return { score, reliability };
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Top-k cosine hits. `matrix` rows are L2-normalized. Near-duplicates (cosine ≥ 0.999) are dropped. */
export function topSimilar(
  query: number[],
  matrix: number[][],
  k: number,
  skip: (index: number) => boolean,
): { index: number; similarity: number }[] {
  const best: { index: number; similarity: number }[] = [];
  let minAt = 0;
  for (let i = 0; i < matrix.length; i++) {
    if (skip(i)) continue;
    const similarity = dot(query, matrix[i]);
    if (similarity >= 0.999) continue;
    if (best.length < k) {
      best.push({ index: i, similarity });
      if (best.length === k) {
        minAt = 0;
        for (let j = 1; j < best.length; j++) {
          if (best[j].similarity < best[minAt].similarity) minAt = j;
        }
      }
      continue;
    }
    if (similarity <= best[minAt].similarity) continue;
    best[minAt] = { index: i, similarity };
    minAt = 0;
    for (let j = 1; j < best.length; j++) {
      if (best[j].similarity < best[minAt].similarity) minAt = j;
    }
  }
  best.sort((a, b) => b.similarity - a.similarity);
  const positive = best.filter((row) => row.similarity > 0);
  if (positive.length >= 20) return positive;
  return best;
}

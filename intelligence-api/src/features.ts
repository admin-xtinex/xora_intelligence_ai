/** Decision-time fingerprint. The same function builds the historical index and live queries. */

export const STRATEGIES = ["REVERSAL", "BREAKOUT"] as const;
export const DIRECTIONS = ["LONG", "SHORT"] as const;
export const TRENDS = ["BULLISH", "BEARISH", "RANGING"] as const;
export const MICRO_STATES = [
  "Fake Breakout Risk",
  "Volatile Expansion",
  "Momentum Building",
  "Ranging",
  "Weak Trend",
  "Strong Continuation",
  "Compression",
] as const;

export type RawSetup = {
  confidence: number;
  opportunityScore: number;
  breakoutScore: number;
  rsi14: number;
  buyerPressure: number;
  volumeAccelPct: number;
  atrPctOfPrice: number;
  expectedRR: number;
  riskROIPct: number;
  rewardROIPct: number;
  liquidity: number;
  leverage: number;
  btcVolatilityPct: number;
  feeRoiPct: number;
  volume: number;
  entryPrice: number;
  ema7: number;
  ema25: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  hourUtc: number;
  strategy: string;
  direction: string;
  trend: string;
  btcTrend: string;
  microState: string;
};

export const EMPTY_SETUP: RawSetup = {
  confidence: 77,
  opportunityScore: 70,
  breakoutScore: 72,
  rsi14: 60,
  buyerPressure: 70,
  volumeAccelPct: 24,
  atrPctOfPrice: 0.43,
  expectedRR: 1.8,
  riskROIPct: 14,
  rewardROIPct: 40,
  liquidity: 29,
  leverage: 20,
  btcVolatilityPct: 0.04,
  feeRoiPct: 2,
  volume: 1_000_000,
  entryPrice: 1,
  ema7: 1,
  ema25: 1,
  entryZoneLow: 0.998,
  entryZoneHigh: 1.002,
  hourUtc: 12,
  strategy: "REVERSAL",
  direction: "SHORT",
  trend: "RANGING",
  btcTrend: "RANGING",
  microState: "Momentum Building",
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function oneHot(names: readonly string[], value: string, prefix: string): [string, number][] {
  const known = names.includes(value);
  const slots: [string, number][] = names.map((name) => [
    `${prefix}:${name}`,
    value === name ? 1 : 0,
  ]);
  slots.push([`${prefix}:OTHER`, known ? 0 : 1]);
  return slots;
}

/** Ordered numerical fingerprint. Categorical levels are fixed; unknown values land in OTHER. */
export function featurePairs(raw: RawSetup): [string, number][] {
  const price = raw.entryPrice !== 0 ? raw.entryPrice : 1;
  const span = raw.entryZoneHigh - raw.entryZoneLow;
  const zonePos =
    Number.isFinite(span) && span !== 0
      ? clamp((raw.entryPrice - raw.entryZoneLow) / span, 0, 1)
      : 0.5;
  const hour = ((raw.hourUtc % 24) + 24) % 24;
  const angle = (2 * Math.PI * hour) / 24;
  const continuous: [string, number][] = [
    ["confidence", raw.confidence / 100],
    ["opportunity", raw.opportunityScore / 100],
    ["breakout", raw.breakoutScore / 100],
    ["rsi", raw.rsi14 / 100],
    ["buyerPressure", raw.buyerPressure / 100],
    ["volumeAccel", clamp(raw.volumeAccelPct, -100, 200) / 100],
    ["atrPct", raw.atrPctOfPrice],
    ["logExpectedRR", Math.log1p(Math.max(0, raw.expectedRR))],
    ["riskRoi", raw.riskROIPct / 100],
    ["rewardRoi", raw.rewardROIPct / 100],
    ["liquidity", raw.liquidity / 100],
    ["leverage", raw.leverage / 20],
    ["btcVol", raw.btcVolatilityPct],
    ["feeRoi", raw.feeRoiPct / 100],
    ["logVolume", Math.log1p(Math.max(0, raw.volume))],
    ["priceVsEma7", ((raw.entryPrice - raw.ema7) / price) * 100],
    ["emaSpread", ((raw.ema7 - raw.ema25) / price) * 100],
    ["zonePos", zonePos],
    ["hourSin", Math.sin(angle)],
    ["hourCos", Math.cos(angle)],
  ];
  return [
    ...continuous,
    ...oneHot(STRATEGIES, raw.strategy, "strategy"),
    ...oneHot(DIRECTIONS, raw.direction, "direction"),
    ...oneHot(TRENDS, raw.trend, "trend"),
    ...oneHot(TRENDS, raw.btcTrend, "btc"),
    ...oneHot(MICRO_STATES, raw.microState, "micro"),
  ];
}

export function featureNames(): string[] {
  return featurePairs(EMPTY_SETUP).map(([name]) => name);
}

export function featureValues(raw: RawSetup): number[] {
  return featurePairs(raw).map(([, value]) => value);
}

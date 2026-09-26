import type { RawSetup } from "./features.ts";

const NAMES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  ether: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  dogecoin: "DOGE",
  doge: "DOGE",
  ripple: "XRP",
  xrp: "XRP",
  cardano: "ADA",
  ada: "ADA",
  avalanche: "AVAX",
  avax: "AVAX",
  chainlink: "LINK",
  link: "LINK",
  polkadot: "DOT",
  dot: "DOT",
  litecoin: "LTC",
  ltc: "LTC",
  "bitcoin cash": "BCH",
  bch: "BCH",
  shiba: "SHIB",
  shib: "SHIB",
  pepe: "PEPE",
  sui: "SUI",
  aptos: "APT",
  apt: "APT",
  near: "NEAR",
  ton: "TON",
  toncoin: "TON",
  tron: "TRX",
  trx: "TRX",
  bnb: "BNB",
  binance: "BNB",
  uniswap: "UNI",
  uni: "UNI",
  aave: "AAVE",
  maker: "MKR",
  mkr: "MKR",
  arbitrum: "ARB",
  arb: "ARB",
  optimism: "OP",
  op: "OP",
  polygon: "POL",
  matic: "POL",
  pol: "POL",
  render: "RENDER",
  fet: "FET",
  injective: "INJ",
  inj: "INJ",
  sei: "SEI",
  wif: "WIF",
  bonk: "BONK",
  pengu: "PENGU",
};

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export type MarketSnapshot = {
  symbol: string;
  product: string;
  price: number;
  asOf: string;
  change15mPct: number;
  rsi14: number;
  atrPct: number;
  trend: string;
  direction: string;
  btcTrend: string;
  strategy: string;
  microState: string;
  volumeUsd: number;
  data: RawSetup;
  assumptions: string[];
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function resolveSymbol(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (!cleaned) return null;
  if (NAMES[cleaned]) return NAMES[cleaned];
  const compact = cleaned.replace(/\s+/g, "");
  if (NAMES[compact]) return NAMES[compact];
  let ticker = compact.toUpperCase();
  if (ticker.endsWith("USDT")) ticker = ticker.slice(0, -4);
  if (ticker.endsWith("USD")) ticker = ticker.slice(0, -3);
  if (!/^[A-Z0-9]{2,12}$/.test(ticker)) return null;
  return ticker;
}

async function candles(product: string): Promise<Bar[] | null> {
  const response = await fetch(
    `https://api.exchange.coinbase.com/products/${product}/candles?granularity=60`,
    { headers: { accept: "application/json", "user-agent": "xora-intelligence" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`market feed ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length < 40) return null;
  const nowSec = Date.now() / 1000;
  const bars: Bar[] = payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) return null;
      const [t, low, high, open, close, volume] = row.map(Number);
      if (![t, low, high, open, close, volume].every(Number.isFinite)) return null;
      return { t, o: open, h: high, l: low, c: close, v: volume };
    })
    .filter((bar): bar is Bar => bar != null && bar.t < nowSec - 55)
    .sort((a, b) => a.t - b.t);
  return bars.length >= 40 ? bars : null;
}

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}

function rsi(closes: number[], period = 14): number {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(bars: Bar[], period = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].c;
    trs.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev)));
  }
  let value = trs.slice(0, period).reduce((sum, item) => sum + item, 0) / period;
  for (let i = period; i < trs.length; i++) value = (value * (period - 1) + trs[i]) / period;
  return value;
}

function trendOf(price: number, fast: number, slow: number): "BULLISH" | "BEARISH" | "RANGING" {
  if (fast > slow * 1.0008 && price >= fast) return "BULLISH";
  if (fast < slow * 0.9992 && price <= fast) return "BEARISH";
  return "RANGING";
}

function round(value: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

export async function loadMarket(input: string): Promise<MarketSnapshot> {
  const symbol = resolveSymbol(input);
  if (!symbol) throw new MarketError("Enter a coin name or ticker, such as bitcoin or SOL.");
  const product = `${symbol}-USD`;
  const [bars, btcBars] = await Promise.all([
    candles(product),
    symbol === "BTC" ? Promise.resolve(null) : candles("BTC-USD"),
  ]);
  if (!bars) throw new MarketError(`No live USD market for ${symbol}.`);
  const btc = symbol === "BTC" ? bars : btcBars;
  if (!btc) throw new MarketError("Bitcoin context did not load.");

  const closes = bars.map((bar) => bar.c);
  const price = closes[closes.length - 1];
  const fast = ema(closes, 7);
  const slow = ema(closes, 25);
  const rsi14 = rsi(closes);
  const atrValue = atr(bars);
  const atrPct = (atrValue / price) * 100;
  const back = closes[Math.max(0, closes.length - 16)];
  const change15mPct = ((price - back) / back) * 100;

  const recent = bars.slice(-21);
  const last = recent[recent.length - 1];
  const priorVol = recent.slice(0, -1).reduce((sum, bar) => sum + bar.v, 0) / 20;
  const volumeAccelPct = priorVol > 0 ? clamp(((last.v / priorVol) - 1) * 100, -99, 200) : 0;
  const notional = last.v * last.c;
  const volumeUsd = notional >= 1000 ? notional : bars.slice(-15).reduce((sum, bar) => sum + bar.v * bar.c, 0);

  const window = bars.slice(-30);
  const swingLow = Math.min(...window.map((bar) => bar.l));
  const swingHigh = Math.max(...window.map((bar) => bar.h));
  const span = swingHigh - swingLow || atrValue || price * 0.001;
  const location = clamp((price - swingLow) / span, 0, 1);
  const buyerPressure = clamp(
    window.reduce((sum, bar) => sum + (bar.h === bar.l ? 0.5 : (bar.c - bar.l) / (bar.h - bar.l)), 0) /
      window.length *
      100,
    12,
    100,
  );

  const btcCloses = btc.map((bar) => bar.c);
  const btcPrice = btcCloses[btcCloses.length - 1];
  const btcTrend = trendOf(btcPrice, ema(btcCloses, 7), ema(btcCloses, 25));
  const btcReturns: number[] = [];
  for (let i = btc.length - 30; i < btc.length; i++) {
    btcReturns.push((btc[i].c - btc[i - 1].c) / btc[i - 1].c);
  }
  const btcMean = btcReturns.reduce((sum, item) => sum + item, 0) / btcReturns.length;
  const btcVolatilityPct = Math.sqrt(
    btcReturns.reduce((sum, item) => sum + (item - btcMean) ** 2, 0) / btcReturns.length,
  ) * 100;

  const trend = trendOf(price, fast, slow);
  const direction = trend === "BULLISH" ? "LONG" : trend === "BEARISH" ? "SHORT" : change15mPct >= 0 ? "LONG" : "SHORT";
  const breaking = (direction === "LONG" ? location : 1 - location) > 0.82 && volumeAccelPct > 15;
  const strategy = breaking ? "BREAKOUT" : "REVERSAL";

  let microState = "Ranging";
  if (atrPct > 0.55 && volumeAccelPct > 40) microState = "Volatile Expansion";
  else if (atrPct < 0.12) microState = "Compression";
  else if ((rsi14 > 72 || rsi14 < 28) && !breaking) microState = "Fake Breakout Risk";
  else if (trend !== "RANGING" && Math.abs(change15mPct) > 0.35) microState = "Strong Continuation";
  else if (trend !== "RANGING") microState = "Momentum Building";
  else if (Math.abs(change15mPct) < 0.08) microState = "Weak Trend";

  const breakoutScore = clamp(breaking ? 70 + location * 25 : 25 + location * 40, 10, 95);
  const aligned = (direction === "LONG" && btcTrend !== "BEARISH") || (direction === "SHORT" && btcTrend !== "BULLISH");
  const confidence = clamp(62 + (aligned ? 10 : 0) + Math.min(atrPct, 1) * 8 + (volumeAccelPct > 0 ? 4 : 0), 50, 96);
  const opportunityScore = clamp(48 + Math.abs(location - 0.5) * 40 + (trend === "RANGING" ? 0 : 8), 45, 92);
  const liquidity = clamp((last.v / (priorVol || last.v)) * 28, 0, 100);
  const leverage = 20;
  const feeRoiPct = 2;
  const riskROIPct = clamp(atrPct * leverage, 4, 40);
  const expectedRR = clamp(1.4 + (1 - Math.abs(location - 0.5)) * 0.8, 1.3, 3.2);
  const rewardROIPct = clamp(riskROIPct * expectedRR, 10, 120);
  const zonePad = Math.max(atrValue * 0.35, price * 0.0004);
  const entryZoneLow = Math.min(price, swingLow) > price ? price - zonePad : Math.min(swingLow, price);
  const entryZoneHigh = Math.max(swingHigh, price);

  const data: RawSetup = {
    confidence: round(confidence, 1),
    opportunityScore: round(opportunityScore, 1),
    breakoutScore: round(breakoutScore, 1),
    rsi14: round(rsi14, 2),
    buyerPressure: round(buyerPressure, 1),
    volumeAccelPct: round(volumeAccelPct, 1),
    atrPctOfPrice: round(atrPct, 4),
    expectedRR: round(expectedRR, 3),
    riskROIPct: round(riskROIPct, 2),
    rewardROIPct: round(rewardROIPct, 2),
    liquidity: round(liquidity, 1),
    leverage,
    btcVolatilityPct: round(btcVolatilityPct, 4),
    feeRoiPct,
    volume: round(volumeUsd, 2),
    entryPrice: price,
    ema7: fast,
    ema25: slow,
    entryZoneLow: Math.min(entryZoneLow, price),
    entryZoneHigh: Math.max(entryZoneHigh, price),
    hourUtc: new Date().getUTCHours(),
    strategy,
    direction,
    trend,
    btcTrend,
    microState,
  };

  return {
    symbol,
    product,
    price,
    asOf: new Date(last.t * 1000).toISOString(),
    change15mPct: round(change15mPct, 3),
    rsi14: data.rsi14,
    atrPct: data.atrPctOfPrice,
    trend,
    direction,
    btcTrend,
    strategy,
    microState,
    volumeUsd: round(volumeUsd, 2),
    data,
    assumptions: [
      "RSI, EMAs, ATR, and volume come from the latest closed 1-minute USD candles.",
      "Leverage is held at 20× and the fee at 2% ROI, matching the historical book.",
      "Confidence, opportunity, and breakout are read off the tape. They are not the live Xora engine.",
    ],
  };
}

export class MarketError extends Error {}

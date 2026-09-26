# XORA — 5-Day Trading Data Export

**Generated:** 2026-08-07 22:46 UTC · **Window:** 2026-08-02 22:29 → 2026-08-07 22:28 UTC (5.00 days)
**Source:** CloudWatch `/ecs/xtinex-trading` (read-only) + real Binance 1m klines re-fetched for replay.
**Nothing was modified.** No code, no trading logic, no database write. Read-only throughout.

---

## 1. Contents

| file | size | rows / content |
|---|---:|---|
| `trades.csv` | 4.08 MB | 5,247 filled trades, flat schema (63 columns) |
| `trades.json` | 19.17 MB | same 5,247 trades, full nested records incl. events + timing |
| `trade_summary.json` | 2 KB | headline aggregates |
| `trade_statistics.json` | 60 KB | breakdowns: direction, strategy, exit type, hour, day, symbol, trend, confidence band |
| `market_context.json` | 4.44 MB | per-trade market snapshot + derived indicators |
| `decision_log.json` | 31.69 MB | 5,248 approved decisions, 117,888 rejections, 1,792 expired watchers |
| `replay_dataset.json` | 76.46 MB | ±20 real 1m candles per trade + full 5s monitor tick path |

Total ≈ 136 MB.

---

## 2. Headline numbers

```
Trades filled            5,247        Win rate            38.31 %
Trades closed            5,242        Profit factor        0.711
Still open at export         5        Gross profit    $ 47,559.45
                                      Gross loss      $-66,865.62
Average win           $ 23.69         NET PROFIT      $-19,306.17
Average loss          $-20.68         Total fees      $ 20,350.89
Avg hold time         8.76 min        Max drawdown    $-19,673.20
Median hold time      6.42 min        Max consec wins         19
                                      Max consec losses       31
Rejected signals       117,888        Expired watchers     1,792
```

**Gross ROI per trade: +0.046 %.** Net is −1.85 %. Fees are 1.92 % per trade at the median 20× leverage — **the entire loss is the fee line**, consistent with the earlier 5-day edge measurement.

**Accounts:** xaviertisan95 (1,746), elizebethsaritha97 (1,618), muhasin.ps (1,442), sincyrejin (424), unmatched (17).

**Every trade in this window was direction-inverted** (`TEST_OPPOSITE_TRADE`): AI LONG → executed SHORT (4,092), AI SHORT → executed LONG (1,138). `prediction` holds the AI's own call; `direction` holds what was executed. **`predictionCorrect` is scored against the AI's direction**, so the inversion cannot corrupt the prediction scoreboard. AI directional accuracy: **57.47 %** (n=5,185).

Exit-type performance (the dominant structure):

| exit type | n | win rate | net $ | PF | avg ROI |
|---|---:|---:|---:|---:|---:|
| STRUCTURE_BREAK | 2,082 | 8.79 % | −31,832.81 | 0.026 | −7.79 % |
| PROFIT_PROTECTION | 1,088 | 99.72 % | +26,374.92 | 2156 | +12.76 % |
| STOP_LOSS | 1,016 | 0.00 % | −30,445.56 | 0.000 | −15.23 % |
| TIME_STOP | 708 | 56.07 % | +1,346.23 | 1.370 | +0.79 % |
| TP_EXHAUSTION | 256 | 100 % | +9,529.08 | ∞ | +18.42 % |

---

## 3. Data quality — 21 checks

```
PASS  duplicate trade IDs                                  0 / 5247
PASS  missing entry timestamp                              0 / 5247
PASS  missing/invalid entry, SL or TP price                0 / 5247
PASS  closed but missing exit price                        0 / 5247
PASS  negative duration (exit before entry)                0 / 5247
PASS  logged ROI vs price arithmetic, fee-adjusted         0 / 5247
PASS  realised ROI above observed MFE (impossible)         0 / 5247
PASS  replay: zero preceding candles                       0 / 5247
PASS  replay: partial pre-entry window                     0 / 5247
PASS  replay: zero post-exit candles                       0 / 5247
PASS  CSV row count matches trades.json                    ✓
PASS  CSV ragged rows                                      0 / 5247
```

Six anomaly classes remain; all are explained in §5. None is data corruption.

**A correction worth recording:** my first validation pass flagged 4,961/5,247 (94.5 %) as "logged ROI disagrees with price arithmetic." That was **my check being wrong, not the data** — I compared a gross price-derived ROI against the logged *net* ROI. Fee-adjusted, the residual is **median 0.0002 ROI-points** across 5,242 trades. The dataset is internally consistent to within rounding.

---

## 4. Field availability — what is real, derived, or absent

Requested fields fall into three classes. **Nothing is synthesised or estimated.**

**Logged by production (authoritative):** entry/fill/exit price, SL, TP, position size, leverage, margin, quantity, expected profit/loss, expected R:R, confidence, strategy, trend, buyer %, seller %, volume acceleration, breakout score, liquidity, micro-state, opportunity score, rank, passed gates, exit reason/type, ROI, all lifecycle timestamps, account, AI direction, executed direction.

**Derived here from real 1m klines** (server's own formulas — `calcATR`/`calcEMA`/`calcRSI`, `server.js:2199/2381/2390`), clearly labelled: `atr`, `ema7`, `ema25`, `ema99`, `rsi14`, `volume`, `btc.*`, MFE/MAE, TP-progress, gross ROI, fees.

**Absent — not computed anywhere in this platform:**

| field | why |
|---|---|
| VWAP, ADX | never implemented; no code path computes them |
| Funding rate, Open Interest | not fetched or stored by the engine |
| Order book, Spread, Bid/Ask volume | fetched live per tick, never persisted to logs |
| Index price | futures mark price is used; index is never read |
| BTC dominance | no data source wired |
| **Support / Resistance** | ⚠ see below |
| Trade ID, Git commit, AI version, Deployment version | see below |
| Consistency verdict | see below |
| Funding fee | not recorded per trade |

Three of these need explicit warnings:

1. **Support / Resistance are NOT in this export.** The `[decision]` log prints fields *labelled* `Support:` and `Resistance:`, but the emitting code (`server.js:6315`) writes `ds.entryZoneLow` and `ds.entryZoneHigh` — **entry-zone bounds, not S/R levels**. They are exported honestly as `entryZoneLow` / `entryZoneHigh`. Do not read them as support/resistance.

2. **Trade ID / Git commit / AI version / Deployment version are null.** The Trade Recorder that emits these (`analysis/trade_recorder.js`, commit `fe302f4`) is flag-gated **OFF** (`TRADE_RECORD_ENABLED=false`) and was not running in this window. `tradeId` here is the production **session ID**, which is unique and stable — it is a valid join key, just not the recorder's UUID. Enabling the recorder makes all four available going forward.

3. **Consistency verdict is null.** The rollback to unconditional inversion (`d46490c`) removed `consistencyVerdict` from the watcher, and it was never logged independently. Not recoverable for this window.

---

## 5. Anomalies (6 classes, all explained)

| id | anomaly | count | assessment |
|---|---|---:|---|
| A1 | No close record — still open at export | 5 | **Expected.** Trades open when the snapshot was taken. |
| A2 | SL/TP on wrong side of entry | 81 | **Real.** Median \|entry−SL\| = **0.065 %** of price vs 0.654 % typical — the stop sits essentially *at* entry, so R:R explodes (up to 1353) and side inference degenerates. 75/81 exited STOP_LOSS. Net impact +$28.83. All REVERSAL. Worth a follow-up on SL placement, but harmless to the dataset. |
| A3 | No authoritative direction/account match | 17 | 0.3 %. `[xora-approve]` line outside the ±15 s join window. `direction` falls back to SL-vs-entry inference (`directionInferredFallback` column preserves it). |
| A4 | No matching `[decision]` record | 2 | 0.04 %. Strategy/confidence null for these two. |
| A5 | No monitor tick path | 85 | 1.6 %. Trades shorter than one 5 s monitor tick. MFE/MAE null; entry/exit/PnL intact. |
| A6 | Close with no matching fill | 10 | 0.2 %. `[trade-audit]` line lost to log sampling; the close exists but there is no fill to attach it to. Excluded from the 5,247. |

**Informational, not an anomaly:** 2,092 trades (39.9 %) realised an ROI *below* their observed MAE, median gap 1.49 ROI-points. This is the expected signature of 5-second monitor sampling — the final adverse move happens between ticks. It is strictly one-sided (**zero** trades exceed their MFE, which would be impossible), which is what confirms it is sampling granularity and not corruption.

---

## 6. Replay completeness

- **414 symbols, 152,357 real 1m candles** re-fetched from Binance for this export, plus 7,488 BTCUSDT candles for market context.
- 2,435 range-requests, **0 failures**, total API weight 2,531 — paced under the rate limit with 418/429 backoff. No production system touched.
- **Every one of the 5,247 trades has a full 20-candle pre-entry and 20-candle post-exit window.** Zero gaps.
- Each replay record also carries the **production 5 s monitor tick path** (ROI + trade score per tick) — the actual in-flight series the engine saw, not a reconstruction.

Each trade can therefore be independently replayed: entry/exit/SL/TP, the candles before and after, and the tick-by-tick path the engine observed — with no further database access.

---

## 7. Reproduction

Rebuilt from CloudWatch with these filter patterns over the 5-day window:
`[trade-audit]`, `auto-closed`, `[trade-guardian]`, `[trail]`, `PROFIT_PROTECT`, `[decision]`, `[REJECTED]`, `Entry triggered`, `EXPIRED`, `[xora-approve]`, `TEST_OPPOSITE_TRADE`.

Join keys: session ID (`SYMBOL-xora-<ms>`) links fill → close → ticks → trail events. Watcher ID timestamp links to `[xora-approve]` (±15 s) for direction/account; entry-trigger time links to `[TEST_OPPOSITE_TRADE]` (±10 s) for the AI-vs-executed split. Match rate **99.7 %**.

**Caveat on completeness:** this is reconstructed from application logs, not from the database. CloudWatch retains what the app chose to print. The 10 orphan closes (A6) show log lines do occasionally go missing. For guaranteed completeness going forward, enable `TRADE_RECORD_ENABLED=true` — the recorder writes one self-contained document per trade with all of §4's missing fields.

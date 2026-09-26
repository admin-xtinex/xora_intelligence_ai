# Retrieval intelligence API

Independent service that fingerprints a decision-time setup, retrieves the closest historical Xora trades, and returns similarity-weighted statistics plus a logistic win probability.

The index is an exact cosine search over L2-normalized feature vectors (the flat inner-product index: 5,242 closed trades do not need an approximate index). The feature function in `src/features.ts` is the only transformer — historical rows and live requests share it.

Outcomes (ROI, exit type, MFE/MAE) are never part of the fingerprint.

## Endpoints

`GET /health`

```json
{ "status": "ok", "index": "ready", "model": "ready" }
```

`POST /v1/analyze`

```json
{
  "data": {
    "confidence": 80,
    "opportunityScore": 72,
    "breakoutScore": 70,
    "rsi14": 58,
    "buyerPressure": 75,
    "volumeAccelPct": 20,
    "atrPctOfPrice": 0.4,
    "expectedRR": 1.6,
    "riskROIPct": 12,
    "rewardROIPct": 28,
    "liquidity": 30,
    "leverage": 20,
    "btcVolatilityPct": 0.04,
    "feeRoiPct": 2,
    "volume": 1000000,
    "entryPrice": 1,
    "ema7": 1,
    "ema25": 0.999,
    "entryZoneLow": 0.998,
    "entryZoneHigh": 1.002,
    "hourUtc": 14,
    "strategy": "REVERSAL",
    "direction": "SHORT",
    "trend": "RANGING",
    "btcTrend": "BEARISH",
    "microState": "Momentum Building"
  }
}
```

`options.includeNeighbors` adds the closest trades. `options.excludeRecordId` drops one archived row so a replay does not retrieve itself.

## Run

```bash
cd intelligence-api
npm install
npm test
npm start
```

Listens on `0.0.0.0:8787` unless `PORT` is set.

Rebuild the store from the export (writes `src/store.json`):

```bash
npm run build:index -- ../xora_5day_export/trades.csv
```

## Validation

The model is an L2 logistic regression fit on the earliest 70% of trades. Walk-forward windows in the store index only the past, then score the next slice. On this five-day book the top quartile wins about 1.08×–1.18× the base rate. Mean net ROI stays negative after fees. That is the measured signal, not a promise of profit.

Dataset: `xora_5day_export/trades.csv` (5,242 closed trades, 2026-08-02 → 2026-08-07).

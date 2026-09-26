import { z } from "zod";
import { analyzeSetup, healthBody, serviceMeta } from "./engine.ts";

const setupSchema = z.object({
  confidence: z.number().min(0).max(100),
  opportunityScore: z.number().min(0).max(100),
  breakoutScore: z.number().min(0).max(100),
  rsi14: z.number().min(0).max(100),
  buyerPressure: z.number().min(0).max(100),
  volumeAccelPct: z.number().min(-100).max(500),
  atrPctOfPrice: z.number().min(0).max(50),
  expectedRR: z.number().min(0).max(50),
  riskROIPct: z.number().min(0).max(500),
  rewardROIPct: z.number().min(0).max(500),
  liquidity: z.number().min(0).max(100),
  leverage: z.number().min(1).max(125),
  btcVolatilityPct: z.number().min(0).max(20),
  feeRoiPct: z.number().min(0).max(20),
  volume: z.number().min(0),
  entryPrice: z.number().positive(),
  ema7: z.number().positive(),
  ema25: z.number().positive(),
  entryZoneLow: z.number().positive(),
  entryZoneHigh: z.number().positive(),
  hourUtc: z.number().int().min(0).max(23),
  strategy: z.string().min(1).max(64),
  direction: z.string().min(1).max(32),
  trend: z.string().min(1).max(32),
  btcTrend: z.string().min(1).max(32),
  microState: z.string().min(1).max(64),
});

const requestSchema = z.object({
  data: setupSchema,
  options: z
    .object({
      k: z.number().int().min(10).max(400).optional(),
      includeNeighbors: z.boolean().optional(),
      excludeRecordId: z.string().max(160).optional(),
    })
    .optional(),
});

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function handleHealth(): Response {
  const body = healthBody();
  return json(body, body.status === "ok" ? 200 : 503);
}

export function handleMeta(): Response {
  return json(serviceMeta());
}

export async function handleAnalyze(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: "invalid request", issues: parsed.error.issues }, 400);
  }
  return json(analyzeSetup(parsed.data.data, parsed.data.options));
}

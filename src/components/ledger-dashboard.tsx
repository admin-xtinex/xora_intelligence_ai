import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Minus, X } from "lucide-react";
import {
  SAMPLE_TRADES,
  bookSummary,
  calibrationBands,
  echoes,
  horizonAccuracy,
  type Actual,
  type Mode,
  type SampleTrade,
  type Verdict,
} from "@/data/sample-ledger";

type ResultFilter = "ALL" | Verdict;
type StateFilter = "ALL" | "OPEN" | "CLOSED";
type OutcomeFilter = "ALL" | "WIN" | "LOSS";
type ModeFilter = "ALL" | Mode;

function percentLabel(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function money(value: number | null) {
  if (value == null) return "—";
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return "0.00";
}

function price(value: number | null) {
  if (value == null) return "—";
  if (value >= 100) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function predictionLabel(prediction: SampleTrade["prediction"]) {
  if (prediction === "LIKELY_SUCCESS") return "Likely success";
  if (prediction === "LIKELY_FAIL") return "Likely fail";
  return "Not enough history";
}

function HorizonMark({ value }: { value: boolean | null }) {
  if (value == null) {
    return <Minus className="mx-auto size-4 text-muted" aria-label="Not yet" />;
  }
  if (value) {
    return <Check className="mx-auto size-4 text-positive" aria-label="Direction held" />;
  }
  return <X className="mx-auto size-4 text-negative" aria-label="Direction failed" />;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-3 text-sm transition-colors ${
        active
          ? "chip-on border-accent text-fg"
          : "border-line bg-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function CalibrationChart({
  bands,
}: {
  bands: { label: string; count: number; predicted: number | null; actual: number | null }[];
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const rows = bands
    .filter((band) => band.count > 0 && band.predicted != null && band.actual != null)
    .map((band) => ({
      label: `${band.label} · ${band.count}`,
      claimed: Math.round((band.predicted ?? 0) * 100),
      won: Math.round((band.actual ?? 0) * 100),
    }));

  if (!ready) return <div className="h-56" aria-hidden="true" />;

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={6} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(value: number) => `${value}%`}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--color-raised)" }}
            contentStyle={{
              background: "var(--color-raised)",
              border: "1px solid var(--color-line)",
              borderRadius: 12,
              color: "var(--color-fg)",
            }}
            formatter={(value, name) => [
              typeof value === "number" ? `${value}%` : "—",
              name === "claimed" ? "Engine claimed" : "Actually won",
            ]}
          />
          <Bar dataKey="claimed" name="claimed" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="won" name="won" fill="var(--color-positive)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-4xl leading-none text-fg">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function resultTone(result: Verdict) {
  if (result === "CORRECT") return "text-positive";
  if (result === "WRONG") return "text-negative";
  return "text-violet";
}

function actualTone(actual: Actual) {
  if (actual === "WIN") return "text-positive";
  if (actual === "LOSS") return "text-negative";
  return "text-muted";
}

export function LedgerDashboard() {
  const [mode, setMode] = useState<ModeFilter>("ALL");
  const [state, setState] = useState<StateFilter>("ALL");
  const [outcome, setOutcome] = useState<OutcomeFilter>("ALL");
  const [result, setResult] = useState<ResultFilter>("ALL");
  const [symbol, setSymbol] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const summary = useMemo(() => bookSummary(SAMPLE_TRADES), []);
  const bands = useMemo(() => calibrationBands(SAMPLE_TRADES), []);
  const horizons = useMemo(() => horizonAccuracy(SAMPLE_TRADES), []);
  const symbols = useMemo(
    () => ["ALL", ...Array.from(new Set(SAMPLE_TRADES.map((trade) => trade.symbol)))],
    [],
  );

  const visible = SAMPLE_TRADES.filter((trade) => {
    if (mode !== "ALL" && trade.mode !== mode) return false;
    if (state === "OPEN" && trade.actual !== "OPEN") return false;
    if (state === "CLOSED" && trade.actual === "OPEN") return false;
    if (outcome !== "ALL" && trade.actual !== outcome) return false;
    if (result !== "ALL" && trade.result !== result) return false;
    if (symbol !== "ALL" && trade.symbol !== symbol) return false;
    return true;
  });

  const selected = SAMPLE_TRADES.find((trade) => trade.id === selectedId) ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex size-11 items-center justify-center rounded-card border border-line bg-surface">
            <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true">
              <path
                d="M7 7.5h4.4L16 14.1l4.6-6.6H25L18.4 16 25 24.5h-4.4L16 17.9l-4.6 6.6H7L13.6 16 7 7.5z"
                fill="url(#xtinex-x)"
              />
              <defs>
                <linearGradient id="xtinex-x" x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3ecbff" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <div>
            <h1 className="font-display text-4xl leading-none sm:text-5xl">
              <span className="grad-text">Xora Intelligence</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Historical second opinion only. This screen cannot place, block, or change a trade.
            </p>
          </div>
        </div>
        <p className="rounded-full border border-line px-3 py-2 text-xs text-muted">Sample book · read only</p>
      </header>

      <p className="mt-4 text-sm text-muted">
        Sixteen simulated decisions so you can walk the board. Nothing here is a live Xora fill.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Summary">
        <Stat label="Predictions" value={String(summary.total)} />
        <Stat label="Correct" value={String(summary.correct)} />
        <Stat label="Wrong" value={String(summary.wrong)} />
        <Stat label="Pending" value={String(summary.pending)} hint="Still inside the window" />
        <Stat
          label="Accuracy"
          value={percentLabel(summary.accuracy)}
          hint="Scored calls only. Insufficient evidence is left out."
        />
      </section>

      <section className="mt-4 rounded-card border border-line bg-surface p-4">
        <h2 className="font-display text-2xl">Calibration</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          If the engine says 70%, about 70 of 100 similar closed calls should win. Cyan is the claim.
          Green is how often those trades actually won. The number under each pair is how many closed
          calls sit in that band.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <i className="size-2.5 rounded-sm bg-accent" aria-hidden="true" />
            Engine claimed
          </span>
          <span className="inline-flex items-center gap-2">
            <i className="size-2.5 rounded-sm bg-positive" aria-hidden="true" />
            Actually won
          </span>
        </div>
        <div className="mt-3">
          <CalibrationChart bands={bands} />
        </div>
        <p className="mt-4 text-xs tracking-widest text-muted uppercase">Reading each bar</p>
        <ul className="mt-4 divide-y divide-line">
          {bands
            .filter((band) => band.count > 0)
            .map((band) => {
              const gap =
                band.predicted == null || band.actual == null ? null : band.actual - band.predicted;
              const read =
                gap == null
                  ? "No closed calls"
                  : Math.abs(gap) <= 0.08
                    ? "Close"
                    : gap > 0
                      ? "Won more often than claimed"
                      : "Won less often than claimed";
              return (
                <li key={band.label} className="grid gap-2 py-3 sm:grid-cols-4 sm:items-baseline">
                  <p className="font-medium">Said {band.label}</p>
                  <p className="text-sm text-muted">
                    {band.count} closed {band.count === 1 ? "call" : "calls"}
                  </p>
                  <p className="text-sm">
                    Claimed {percentLabel(band.predicted)}
                    <span className="text-muted"> · won </span>
                    <span className={gap != null && gap < -0.08 ? "text-negative" : "text-positive"}>
                      {percentLabel(band.actual)}
                    </span>
                  </p>
                  <p className="text-sm text-muted">{read}</p>
                </li>
              );
            })}
        </ul>
      </section>

      <section className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="Later checkpoints">
        {horizons.map((horizon) => (
          <div key={horizon.label} className="rounded-card border border-line bg-surface px-4 py-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm text-muted">Still right at {horizon.label}</h2>
              <p className="font-display text-3xl leading-none">{percentLabel(horizon.accuracy)}</p>
            </div>
            <p className="mt-1 text-xs text-muted">
              Price still pointed the trade’s way. {horizon.known} checks in.
            </p>
          </div>
        ))}
      </section>

      <section className="mt-6" aria-label="Filters">
        <div className="flex flex-wrap gap-2">
          {(["ALL", "LIVE", "DEMO"] as ModeFilter[]).map((item) => (
            <Chip key={item} active={mode === item} onClick={() => setMode(item)}>
              {item === "ALL" ? "All modes" : item}
            </Chip>
          ))}
          {(["ALL", "OPEN", "CLOSED"] as StateFilter[]).map((item) => (
            <Chip key={item} active={state === item} onClick={() => setState(item)}>
              {item === "ALL" ? "Open + closed" : item}
            </Chip>
          ))}
          {(["ALL", "WIN", "LOSS"] as OutcomeFilter[]).map((item) => (
            <Chip key={item} active={outcome === item} onClick={() => setOutcome(item)}>
              {item === "ALL" ? "Win + loss" : item}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["ALL", "CORRECT", "WRONG", "PENDING", "UNSCORED"] as ResultFilter[]).map((item) => (
            <Chip key={item} active={result === item} onClick={() => setResult(item)}>
              {item === "ALL" ? "All verdicts" : item}
            </Chip>
          ))}
          <label className="min-h-11">
            <span className="sr-only">Symbol</span>
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="min-h-11 rounded-full border border-line bg-surface px-3 text-sm text-fg"
            >
              {symbols.map((item) => (
                <option key={item} value={item}>
                  {item === "ALL" ? "All symbols" : item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="mt-4" aria-label="Trades">
        <p className="mb-2 text-sm text-muted">
          {visible.length} shown. Same symbol can appear more than once — each row is its own context.
        </p>
        {visible.length === 0 ? (
          <p className="rounded-card border border-line bg-surface px-4 py-8 text-center text-muted">
            Nothing in this slice. Clear a filter to see the book again.
          </p>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-card border border-line md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-raised text-xs tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-3 py-3 font-medium">Symbol</th>
                    <th className="px-3 py-3 font-medium">Side</th>
                    <th className="px-3 py-3 font-medium">Time</th>
                    <th className="px-3 py-3 font-medium">Prediction</th>
                    <th className="px-3 py-3 font-medium">Prob.</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 text-right font-medium">PnL</th>
                    <th className="px-2 py-3 text-center font-medium">+5</th>
                    <th className="px-2 py-3 text-center font-medium">+10</th>
                    <th className="px-2 py-3 text-center font-medium">+15</th>
                    <th className="px-3 py-3 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((trade) => (
                    <tr
                      key={trade.id}
                      onClick={() => setSelectedId(trade.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(trade.id);
                        }
                      }}
                      tabIndex={0}
                      className={`cursor-pointer border-t border-line transition-colors hover:bg-raised focus:bg-raised focus:outline-none ${
                        selectedId === trade.id ? "bg-raised" : "bg-surface"
                      }`}
                    >
                      <td className="px-3 py-3 font-medium">{trade.symbol}</td>
                      <td className="px-3 py-3">{trade.side}</td>
                      <td className="px-3 py-3 text-muted">{trade.time}</td>
                      <td className="px-3 py-3">{predictionLabel(trade.prediction)}</td>
                      <td className="px-3 py-3 tabular-nums">{percentLabel(trade.probability)}</td>
                      <td className={`px-3 py-3 ${actualTone(trade.actual)}`}>{trade.actual}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${actualTone(trade.actual)}`}>
                        {money(trade.pnl)}
                      </td>
                      <td className="px-2 py-3"><HorizonMark value={trade.h5} /></td>
                      <td className="px-2 py-3"><HorizonMark value={trade.h10} /></td>
                      <td className="px-2 py-3"><HorizonMark value={trade.h15} /></td>
                      <td className={`px-3 py-3 ${resultTone(trade.result)}`}>{trade.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-3 md:hidden">
              {visible.map((trade) => (
                <li key={trade.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(trade.id)}
                    className="w-full rounded-card border border-line bg-surface p-4 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium">
                        {trade.symbol} <span className="text-muted">{trade.side}</span>
                      </p>
                      <p className={`tabular-nums ${actualTone(trade.actual)}`}>{money(trade.pnl)}</p>
                    </div>
                    <p className="mt-1 text-sm text-muted">{trade.time} · {trade.mode}</p>
                    <p className="mt-3 text-sm">{predictionLabel(trade.prediction)} · {percentLabel(trade.probability)}</p>
                    <p className="mt-1 text-sm">
                      <span className={actualTone(trade.actual)}>{trade.actual}</span>
                      <span className="text-muted"> · </span>
                      <span className={resultTone(trade.result)}>{trade.result}</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {selected ? (
        <Detail trade={selected} onClose={() => setSelectedId(null)} />
      ) : null}
    </main>
  );
}

function Detail({ trade, onClose }: { trade: SampleTrade; onClose: () => void }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const matches = echoes(trade);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/70">
      <button type="button" aria-label="Close details" className="h-full flex-1" onClick={onClose} />
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-muted uppercase">{trade.mode} · {trade.strategy}</p>
            <h2 className="font-display text-4xl leading-none">
              {trade.symbol}
            </h2>
            <p className="mt-2 text-sm text-muted">{trade.side} · {trade.time}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full border border-line text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-fg">{trade.note}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Field label="Prediction" value={predictionLabel(trade.prediction)} />
          <Field label="Success probability" value={percentLabel(trade.probability)} />
          <Field label="Confidence" value={percentLabel(trade.confidence)} />
          <Field label="Verdict" value={trade.result} />
          <Field label="Entry" value={price(trade.entry)} />
          <Field label="Exit" value={price(trade.exit)} />
          <Field label="Stop" value={price(trade.stop)} />
          <Field label="Target" value={price(trade.target)} />
          <Field label="PnL" value={money(trade.pnl)} />
          <Field label="Actual" value={trade.actual} />
        </dl>

        <h3 className="mt-6 text-sm text-muted">Checkpoints</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Checkpoint label="+5m" value={trade.h5} />
          <Checkpoint label="+10m" value={trade.h10} />
          <Checkpoint label="+15m" value={trade.h15} />
        </div>

        <h3 className="mt-6 text-sm text-muted">Why this call</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {trade.reasons.map((reason) => (
            <li key={reason} className="rounded-full border border-line px-3 py-1 text-xs text-fg">
              {reason.replaceAll("_", " ")}
            </li>
          ))}
        </ul>

        {trade.categories.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm text-muted">Evaluation</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {trade.categories.map((category) => (
                <li key={category} className="rounded-full bg-raised px-3 py-1 text-xs text-accent">
                  {category.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">Final evaluation waits until the outcome and the +15 checkpoint are both in.</p>
        )}

        <button
          type="button"
          onClick={() => setEvidenceOpen((open) => !open)}
          className="mt-6 min-h-11 text-sm text-accent"
          aria-expanded={evidenceOpen}
        >
          {evidenceOpen ? "Hide evidence" : "View evidence"}
        </button>
        {evidenceOpen ? (
          <div className="mt-3 rounded-card border border-line bg-bg p-4 text-sm">
            <p className="text-muted">
              {trade.sample.candidates} candidates · {trade.sample.comparable} comparable · {trade.sample.used} used · avg similarity {trade.sample.average.toFixed(2)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Field label="RSI" value={String(trade.rsi)} />
              <Field label="Trend" value={trade.trend} />
              <Field label="BTC trend" value={trade.btcTrend} />
              <Field label="ATR %" value={trade.atrPct.toFixed(2)} />
              <Field label="Volume accel" value={String(trade.volumeAccel)} />
              <Field label="Context" value={trade.id} />
            </dl>
            <ul className="mt-3 divide-y divide-line">
              {matches.map((match) => (
                <li key={match.id} className="flex items-center justify-between py-2">
                  <span className="text-muted">{match.id}</span>
                  <span className="tabular-nums">{match.similarity.toFixed(2)}</span>
                  <span className={match.win ? "text-positive" : "text-negative"}>{match.win ? "WIN" : "LOSS"}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function Checkpoint({ label, value }: { label: string; value: boolean | null }) {
  const text = value == null ? "Waiting" : value ? "Held" : "Failed";
  const tone = value == null ? "text-muted" : value ? "text-positive" : "text-negative";
  return (
    <div className="rounded-card border border-line bg-bg px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-sm ${tone}`}>{text}</p>
    </div>
  );
}

import type { ScoreFactor } from "@/lib/types";

/** Circular 0-100 score gauge with the letter grade in the middle. */
export function ScoreDial({
  total,
  grade,
  previous,
  size = 132,
  caption,
}: {
  total: number;
  grade?: string;
  previous?: number;
  size?: number;
  caption?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(total)));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (value / 100) * circumference;
  const stroke = value >= 85 ? "var(--good)" : value >= 62 ? "var(--warn)" : "var(--bad)";
  const lift = previous !== undefined && previous > 0 ? Math.round((value - previous) * 10) / 10 : undefined;

  return (
    <div className="stack" style={{ alignItems: "center", gap: 6 }}>
      <div className="score-dial" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--bg-alt)" strokeWidth="11" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <span className="value">{value}</span>
        {grade ? <span className="grade">{grade}</span> : null}
      </div>
      {lift !== undefined ? (
        <span className="small" style={{ color: lift >= 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>
          {lift >= 0 ? "▲" : "▼"} {Math.abs(lift)} pts vs previous run
        </span>
      ) : null}
      {caption ? <span className="small muted">{caption}</span> : null}
    </div>
  );
}

/** Weighted factor breakdown — the on-page rubric, ranked by points lost. */
export function FactorBars({ factors, limit = 12, showFixes = true }: { factors: ScoreFactor[]; limit?: number; showFixes?: boolean }) {
  const sorted = [...factors].sort((a, b) => a.score / a.weight - b.score / b.weight).slice(0, limit);

  return (
    <div className="stack" style={{ gap: 12 }}>
      {sorted.map((factor) => {
        const ratio = factor.weight ? factor.score / factor.weight : 0;
        const tone = ratio >= 0.85 ? "good" : ratio >= 0.6 ? "warn" : "bad";
        return (
          <div key={factor.id}>
            <div className="row-between" style={{ gap: 12 }}>
              <strong style={{ fontSize: "0.85rem" }}>{factor.label}</strong>
              <span className="small mono muted">
                {Math.round(factor.score * 10) / 10}/{factor.weight}
              </span>
            </div>
            <div className={`bar ${tone}`} style={{ margin: "5px 0" }}>
              <span style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {factor.detail}
            </p>
            {showFixes && factor.fix && ratio < 0.95 ? (
              <p className="small" style={{ margin: "4px 0 0", color: "var(--accent-ink)" }}>
                → {factor.fix}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** 12-month seasonality / trend mini chart built from plain spans. */
export function Sparkline({ values, hotIndex, title }: { values: number[]; hotIndex?: number; title?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="spark" title={title} aria-label={title}>
      {values.map((value, index) => (
        <span
          key={index}
          className={index === hotIndex ? "hot" : undefined}
          style={{ height: `${Math.max(6, Math.round((value / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta ? <div className="delta">{delta}</div> : null}
      {hint ? <div className="small muted" style={{ marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

/** Impressions vs clicks over time, rendered without a chart library. */
export function TrendChart({ series }: { series: { date: string; impressions: number; clicks: number }[] }) {
  const maxImpressions = Math.max(...series.map((s) => s.impressions), 1);
  const step = Math.max(1, Math.ceil(series.length / 15));
  const points = series.filter((_, index) => index % step === 0);

  return (
    <div className="chart" role="img" aria-label="Impressions and clicks over time">
      {points.map((point) => (
        <div className="col" key={point.date} title={`${point.date}: ${point.impressions} impressions, ${point.clicks} clicks`}>
          <i style={{ height: `${Math.max(2, Math.round((point.impressions / maxImpressions) * 100))}%` }} />
          <i className="clicks" style={{ height: `${Math.max(2, Math.round((point.clicks / maxImpressions) * 100))}%` }} />
          <em>{point.date.slice(5)}</em>
        </div>
      ))}
    </div>
  );
}

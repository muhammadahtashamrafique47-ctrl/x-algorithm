"use client";

import { useEffect, useMemo, useState } from "react";
import { MARKETS } from "@/lib/i18n/markets";

type Keyword = {
  term: string;
  normalized: string;
  kind: string;
  intent: string;
  volume: number;
  difficulty: number;
  cpc: number;
  priority: number;
  relevance: number;
  trend: number;
  salience?: number;
  seasonality: { month: number; index: number }[];
  markets: string[];
  serpFeatures: string[];
  source: string;
};

type Summary = {
  seed: string;
  count: number;
  totalVolume: number;
  avgDifficulty: number;
  avgCpc: number;
  estimatedMonthlyClicksAtPosition5: number;
  intentBreakdown: { intent: string; count: number; volume: number }[];
  quickWins: Keyword[];
  serp: { term: string; difficultyBand: string; narrative: string; composition: { archetype: string; share: number }[]; winnablePositions: number[]; richResultOpportunities: string[] } | null;
  events: { name: string; month: number; weight: number; countries?: string[] }[];
  marketOpportunities: { country: string; name: string; score: number; season: string; reasons: string[] }[];
};

type Cluster = { cluster: string; keywords: Keyword[]; volume: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Keyword research workbench.
 *
 * Runs the same engine the optimizer uses, but exposed as an interactive tool:
 * seed term, target markets, month, intent and difficulty filters, plus live
 * typeahead. Volume, difficulty and CPC are modelled deterministically from the
 * lexicon, market economics and first-party signals — no third-party API key
 * required, and no data leaves the server.
 */
export function KeywordExplorer({ initialSeed, initialMarkets, productSlugs }: { initialSeed: string; initialMarkets: string[]; productSlugs: { slug: string; title: string }[] }) {
  const [seed, setSeed] = useState(initialSeed);
  const [markets, setMarkets] = useState<string[]>(initialMarkets.slice(0, 6));
  const [month, setMonth] = useState(new Date().getMonth());
  const [intent, setIntent] = useState("all");
  const [maxDifficulty, setMaxDifficulty] = useState("");
  const [minVolume, setMinVolume] = useState("");
  const [sort, setSort] = useState("priority");
  const [limit, setLimit] = useState(120);
  const [productSlug, setProductSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [typeahead, setTypeahead] = useState("");
  const [suggestions, setSuggestions] = useState<Keyword[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const query = useMemo(() => {
    const params = new URLSearchParams({ seed, month: String(month), intent, sort, limit: String(limit) });
    if (markets.length) params.set("markets", markets.join(","));
    if (maxDifficulty) params.set("maxDifficulty", maxDifficulty);
    if (minVolume) params.set("minVolume", minVolume);
    if (productSlug) params.set("productSlug", productSlug);
    return params;
  }, [seed, month, intent, sort, limit, markets, maxDifficulty, minVolume, productSlug]);

  async function research() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/keywords?${query.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Research failed (${response.status})`);
      setKeywords(data.keywords ?? []);
      setClusters(data.clusters ?? []);
      setSummary(data.summary ?? null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // First paint: run the default research once so the page is never empty.
  useEffect(() => {
    void research();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamic typeahead against the suggestion endpoint.
  useEffect(() => {
    const term = typeahead.trim();
    if (term.length < 3) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/keywords/suggest?q=${encodeURIComponent(term)}&limit=10&markets=${markets.join(",")}`);
        const data = await response.json();
        setSuggestions((data.suggestions ?? data.keywords ?? []) as Keyword[]);
      } catch {
        setSuggestions([]);
      }
    }, 260);
    return () => clearTimeout(handle);
  }, [typeahead, markets]);

  const toggleMarket = (country: string) =>
    setMarkets((previous) => (previous.includes(country) ? previous.filter((c) => c !== country) : [...previous, country]));

  const toggleSaved = (term: string) =>
    setSaved((previous) => {
      const next = new Set(previous);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="panel">
        <div className="card-header">
          <h3>Research a keyword</h3>
          <span className="small muted">global demand model · {MARKETS.length} markets · retail calendar aware</span>
        </div>
        <div className="card-pad stack" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="hoodie, oversized hoodie, merino hoodie…"
              style={{ flex: 1, minWidth: 220 }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void research();
              }}
            />
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void research()}>
              {busy ? "Modelling demand…" : "Research"}
            </button>
            <a className="btn btn-outline" href={`/api/keywords?${query.toString()}&format=csv`} download>
              Export CSV
            </a>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Month</span>
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {MONTHS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="help">Seasonality and the retail calendar shift volumes and market rankings.</span>
            </label>
            <label className="field">
              <span>Intent</span>
              <select value={intent} onChange={(event) => setIntent(event.target.value)}>
                {["all", "transactional", "commercial", "informational", "navigational"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Max difficulty</span>
              <input value={maxDifficulty} onChange={(event) => setMaxDifficulty(event.target.value)} inputMode="numeric" placeholder="e.g. 45" />
            </label>
            <label className="field">
              <span>Min volume</span>
              <input value={minVolume} onChange={(event) => setMinVolume(event.target.value)} inputMode="numeric" placeholder="e.g. 500" />
            </label>
            <label className="field">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {["priority", "volume", "difficulty", "trend", "cpc"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Rows</span>
              <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                {[60, 120, 250, 500].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ground in a listing (optional)</span>
              <select value={productSlug} onChange={(event) => setProductSlug(event.target.value)}>
                <option value="">No product — pure research</option>
                {productSlugs.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.title}
                  </option>
                ))}
              </select>
              <span className="help">Adds relevance, cannibalization and market-fit signals from that product.</span>
            </label>
          </div>

          <div>
            <span className="eyebrow">Target markets</span>
            <div className="pill-list" style={{ marginTop: 8 }}>
              {MARKETS.map((market) => (
                <button type="button" key={market.country} className={`pill ${markets.includes(market.country) ? "accent" : ""}`} onClick={() => toggleMarket(market.country)}>
                  {market.name} <span className="mono">{market.country}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="eyebrow">Dynamic suggestions</span>
            <div className="search-input-row" style={{ marginTop: 8 }}>
              <input value={typeahead} onChange={(event) => setTypeahead(event.target.value)} placeholder="Start typing to expand — e.g. “sherpa”, “hoodie under”, “winter”" />
            </div>
            {suggestions.length ? (
              <div className="pill-list" style={{ marginTop: 8 }}>
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.term}
                    className={`pill ${saved.has(suggestion.term) ? "accent" : ""}`}
                    title={`Volume ${suggestion.volume.toLocaleString()} · KD ${suggestion.difficulty} · priority ${suggestion.priority} — click to save, double-click to research`}
                    onClick={() => toggleSaved(suggestion.term)}
                    onDoubleClick={() => {
                      setSeed(suggestion.term);
                      void research();
                    }}
                  >
                    {suggestion.term} <span className="mono muted">{suggestion.volume.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {saved.size ? (
              <p className="small muted" style={{ marginTop: 8 }}>
                Shortlist ({saved.size}): {[...saved].join(", ")} — export the research CSV and filter for these terms, or
                add them to a listing&apos;s target set from the product editor.
              </p>
            ) : null}
          </div>

          {error ? <div className="issue critical"><h4>{error}</h4></div> : null}
        </div>
      </div>

      {summary ? (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="label">Keywords modelled</div>
              <div className="value">{summary.count}</div>
            </div>
            <div className="stat">
              <div className="label">Combined volume</div>
              <div className="value">{summary.totalVolume.toLocaleString()}</div>
              <div className="small muted">monthly, across selected markets</div>
            </div>
            <div className="stat">
              <div className="label">Avg difficulty</div>
              <div className="value">{summary.avgDifficulty}</div>
            </div>
            <div className="stat">
              <div className="label">Avg CPC</div>
              <div className="value">${summary.avgCpc}</div>
            </div>
            <div className="stat">
              <div className="label">Clicks at position 5</div>
              <div className="value">{summary.estimatedMonthlyClicksAtPosition5.toLocaleString()}</div>
              <div className="small muted">35% impression share × 6.3% CTR</div>
            </div>
          </div>

          <div className="admin-cols">
            <div className="panel">
              <div className="card-header">
                <h3>Quick wins</h3>
                <span className="small muted">KD ≤ 40, commercial intent, real volume</span>
              </div>
              <div className="card-pad">
                <div className="pill-list">
                  {summary.quickWins.map((keyword) => (
                    <span className="pill accent" key={keyword.term} title={`Volume ${keyword.volume.toLocaleString()} · KD ${keyword.difficulty} · CPC $${keyword.cpc}`}>
                      {keyword.term} <span className="mono">{keyword.volume.toLocaleString()}</span>
                    </span>
                  ))}
                  {!summary.quickWins.length ? <span className="small muted">No low-difficulty commercial terms for this seed — widen the markets or month.</span> : null}
                </div>
                <div className="divider" />
                <span className="eyebrow">Intent mix</span>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Intent</th>
                        <th className="center">Terms</th>
                        <th className="center">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.intentBreakdown.map((row) => (
                        <tr key={row.intent}>
                          <td>{row.intent}</td>
                          <td className="center mono">{row.count}</td>
                          <td className="center mono">{row.volume.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="card-header">
                <h3>SERP landscape — “{summary.serp?.term ?? summary.seed}”</h3>
                <span className="small muted">{summary.serp?.difficultyBand ?? "—"}</span>
              </div>
              <div className="card-pad stack" style={{ gap: 12 }}>
                <p className="small">{summary.serp?.narrative}</p>
                <div>
                  <span className="eyebrow">Who ranks now</span>
                  {(summary.serp?.composition ?? []).map((row) => (
                    <div key={row.archetype} style={{ marginBottom: 8 }}>
                      <div className="row-between">
                        <span className="small">{row.archetype}</span>
                        <span className="small mono muted">{Math.round(row.share * 100)}%</span>
                      </div>
                      <div className="progress">
                        <span style={{ width: `${Math.round(row.share * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <dl className="kv">
                  <dt>Winnable positions</dt>
                  <dd className="mono">{summary.serp?.winnablePositions.join(", ")}</dd>
                  <dt>Rich results to target</dt>
                  <dd>{summary.serp?.richResultOpportunities.join(", ")}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="admin-cols">
            <div className="panel">
              <div className="card-header">
                <h3>Market opportunities in {MONTHS[month]}</h3>
                <span className="small muted">where this demand converts best right now</span>
              </div>
              <div className="card-pad">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th className="center">Score</th>
                        <th>Season</th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.marketOpportunities.map((row) => (
                        <tr key={row.country}>
                          <td>
                            {row.name} <span className="mono small muted">{row.country}</span>
                          </td>
                          <td className="center mono">{Math.round(row.score)}</td>
                          <td className="small">{row.season || "—"}</td>
                          <td className="small muted">{row.reasons.join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="card-header">
                <h3>Topic clusters</h3>
                <span className="small muted">group by modifier for hub-and-spoke content</span>
              </div>
              <div className="card-pad">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Cluster</th>
                        <th className="center">Terms</th>
                        <th className="center">Volume</th>
                        <th>Strongest term</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clusters.map((cluster) => (
                        <tr key={cluster.cluster}>
                          <td className="mono">{cluster.cluster}</td>
                          <td className="center mono">{cluster.keywords.length}</td>
                          <td className="center mono">{cluster.volume.toLocaleString()}</td>
                          <td className="small">{cluster.keywords[0]?.term}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {summary.events?.length ? (
            <div className="panel">
              <div className="card-header">
                <h3>Retail calendar</h3>
                <span className="small muted">upcoming demand spikes to publish against</span>
              </div>
              <div className="card-pad">
                <div className="pill-list">
                  {summary.events.map((event) => (
                    <span className="pill" key={`${event.name}-${event.month}`} title={`Weight ${event.weight}/100`}>
                      {event.name} <span className="mono muted">{MONTH_SHORT[event.month]}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="card-header">
              <h3>Results ({keywords.length})</h3>
              <span className="small muted">volume, difficulty and CPC are modelled — treat them as relative signals</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th />
                      <th>Keyword</th>
                      <th className="center">Intent</th>
                      <th className="center">Volume</th>
                      <th className="center">KD</th>
                      <th className="center">CPC</th>
                      <th className="center">Priority</th>
                      <th className="center">Trend</th>
                      <th>Seasonality</th>
                      <th>SERP features</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((keyword) => {
                      const peak = keyword.seasonality.reduce((best, point) => (point.index > best.index ? point : best), keyword.seasonality[0]);
                      const max = Math.max(...keyword.seasonality.map((point) => point.index), 1);
                      return (
                        <tr key={keyword.normalized}>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title={saved.has(keyword.term) ? "Remove from shortlist" : "Add to shortlist"}
                              onClick={() => toggleSaved(keyword.term)}
                            >
                              {saved.has(keyword.term) ? "★" : "☆"}
                            </button>
                          </td>
                          <td>
                            <strong>{keyword.term}</strong>
                            <div className="small muted">
                              {keyword.kind} · {keyword.source}
                            </div>
                          </td>
                          <td className="center">
                            <span className={`badge ${keyword.intent === "transactional" ? "badge-good" : keyword.intent === "commercial" ? "badge-info" : "badge-grid"}`}>
                              {keyword.intent}
                            </span>
                          </td>
                          <td className="center mono">{keyword.volume.toLocaleString()}</td>
                          <td className="center">
                            <div className={`bar ${keyword.difficulty < 40 ? "good" : keyword.difficulty < 70 ? "warn" : "bad"}`}>
                              <span style={{ width: `${keyword.difficulty}%` }} />
                            </div>
                            <span className="small mono">{keyword.difficulty}</span>
                          </td>
                          <td className="center mono">${keyword.cpc}</td>
                          <td className="center mono">
                            <strong>{keyword.priority}</strong>
                          </td>
                          <td className="center mono" style={{ color: keyword.trend > 0 ? "var(--good)" : keyword.trend < 0 ? "var(--bad)" : "var(--ink-3)" }}>
                            {keyword.trend > 0 ? "+" : ""}
                            {keyword.trend}
                          </td>
                          <td style={{ minWidth: 120 }}>
                            <div className="spark">
                              {keyword.seasonality.map((point) => (
                                <span
                                  key={point.month}
                                  className={point.month === peak?.month ? "hot" : undefined}
                                  style={{ height: `${Math.max(8, Math.round((point.index / max) * 100))}%` }}
                                />
                              ))}
                            </div>
                            <span className="small muted">peak {MONTH_SHORT[peak?.month ?? 0]}</span>
                          </td>
                          <td className="small muted">{keyword.serpFeatures.slice(0, 3).join(", ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

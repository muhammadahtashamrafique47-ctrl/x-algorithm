"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MARKETS } from "@/lib/i18n/markets";
import type { ScoreFactor } from "@/lib/types";

export type MerchantFields = {
  id: string;
  slug: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  category: string;
  gender: string;
  sizes: string[];
  colors: { name: string; hex: string }[];
  material: string;
  weightGsm?: number;
  fit?: string;
  features: string[];
  description: string;
  careInstructions?: string;
  countryOfOrigin?: string;
  status: string;
  inventory: Record<string, number>;
  targetMarkets: string[];
};

type OptimizeResponse = {
  before: number;
  after: number;
  lift: number;
  grade: string;
  engine: string;
  passes: number;
  autoFixes: string[];
  product?: { seo?: { seoTitle?: string; metaDescription?: string; h1?: string; score?: { factors?: ScoreFactor[] } } };
  error?: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The listing workspace: run the optimizer against the live product, inspect
 * exactly what changed factor by factor, and edit the merchant-side data that
 * feeds it (price, stock, fabric, features).
 */
export function SeoWorkspace({
  fields,
  factors,
  score,
  previousScore,
  aiEnabled,
  aiNote,
}: {
  fields: MerchantFields;
  factors: ScoreFactor[];
  score: number;
  previousScore: number;
  aiEnabled: boolean;
  aiNote: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"optimize" | "data">("optimize");
  const [month, setMonth] = useState(new Date().getMonth());
  const [markets, setMarkets] = useState<string[]>(fields.targetMarkets.length ? fields.targetMarkets : ["US", "GB", "DE"]);
  const [passes, setPasses] = useState(3);
  const [useLlm, setUseLlm] = useState(false);
  const [publish, setPublish] = useState(fields.status === "published");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [report, setReport] = useState<{ response: OptimizeResponse; deltas: { label: string; before: number; after: number; weight: number }[] } | null>(null);
  const [draft, setDraft] = useState<MerchantFields>(fields);
  const [reoptimize, setReoptimize] = useState(true);

  const flash = (text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 6000);
  };

  async function optimize() {
    setBusy(true);
    setReport(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(fields.id)}/optimize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, targetMarkets: markets, passes, useLlm, publish, preserveSlug: true }),
      });
      const data = (await response.json()) as OptimizeResponse;
      if (!response.ok) throw new Error(data.error ?? `Optimization failed (${response.status})`);

      const nextFactors = data.product?.seo?.score?.factors ?? [];
      const deltas = nextFactors
        .map((after) => {
          const before = factors.find((f) => f.id === after.id);
          return {
            label: after.label,
            weight: after.weight,
            before: before ? Math.round(before.score * 10) / 10 : 0,
            after: Math.round(after.score * 10) / 10,
          };
        })
        .filter((row) => Math.abs(row.after - row.before) > 0.05)
        .sort((a, b) => b.after - b.before - (a.after - a.before));

      setReport({ response: data, deltas });
      flash(`Optimized: ${data.before} → ${data.after} (${data.grade}) · ${data.autoFixes.length} auto-fixes applied.`);
      router.refresh();
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveData() {
    setBusy(true);
    try {
      const payload = {
        title: draft.title,
        sku: draft.sku,
        price: Number(draft.price) || 0,
        compareAtPrice: draft.compareAtPrice ? Number(draft.compareAtPrice) : undefined,
        category: draft.category,
        gender: draft.gender,
        sizes: draft.sizes,
        colors: draft.colors,
        material: draft.material,
        weightGsm: draft.weightGsm ? Number(draft.weightGsm) : undefined,
        fit: draft.fit,
        features: draft.features,
        description: draft.description,
        careInstructions: draft.careInstructions,
        countryOfOrigin: draft.countryOfOrigin,
        status: draft.status,
        inventory: draft.inventory,
        reoptimize,
        preserveSlug: true,
      };
      const response = await fetch(`/api/products/${encodeURIComponent(fields.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Save failed (${response.status})`);
      flash(`Saved${data.optimized ? ` and re-optimized — score ${data.score} (${data.grade})` : " without re-optimizing"}.`);
      router.refresh();
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const toggleMarket = (country: string) =>
    setMarkets((previous) => (previous.includes(country) ? previous.filter((c) => c !== country) : [...previous, country]));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="tabs">
        <button className={`tab ${tab === "optimize" ? "active" : ""}`} type="button" onClick={() => setTab("optimize")}>
          AI optimizer
        </button>
        <button className={`tab ${tab === "data" ? "active" : ""}`} type="button" onClick={() => setTab("data")}>
          Merchant data
        </button>
      </div>

      {tab === "optimize" ? (
        <div className="panel">
          <div className="card-header">
            <h3>Run the optimization pipeline</h3>
            <span className="small muted">
              current score {score} · raw upload {previousScore}
            </span>
          </div>
          <div className="card-pad stack" style={{ gap: 16 }}>
            <div className="form-grid">
              <label className="field">
                <span>Optimize for month</span>
                <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                      {index === new Date().getMonth() ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <span className="help">Seasonality changes which markets and events the copy targets.</span>
              </label>
              <label className="field">
                <span>Passes</span>
                <select value={passes} onChange={(event) => setPasses(Number(event.target.value))}>
                  <option value={1}>1 — fastest</option>
                  <option value={2}>2 — balanced</option>
                  <option value={3}>3 — converge (default)</option>
                  <option value={4}>4 — maximum</option>
                </select>
                <span className="help">Each pass re-scores and auto-fixes until the listing stops improving.</span>
              </label>
            </div>

            <div>
              <span className="eyebrow">Target markets</span>
              <div className="pill-list" style={{ marginTop: 8 }}>
                {MARKETS.map((market) => (
                  <button type="button" key={market.country} className={`pill ${markets.includes(market.country) ? "accent" : ""}`} onClick={() => toggleMarket(market.country)}>
                    {market.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />
                <span className="small">Publish after optimizing</span>
              </label>
              <label className="row" style={{ gap: 6 }} title={aiNote}>
                <input type="checkbox" checked={useLlm} disabled={!aiEnabled} onChange={(event) => setUseLlm(event.target.checked)} />
                <span className="small">
                  Use cloud LLM refinement {aiEnabled ? "" : "(not configured — local engine is fully functional)"}
                </span>
              </label>
            </div>

            <button className="btn btn-primary btn-lg" type="button" disabled={busy} onClick={() => void optimize()}>
              {busy ? "Researching keywords, writing copy, scoring…" : "Run AI optimization"}
            </button>

            {report ? (
              <div className="stack" style={{ gap: 14 }}>
                <div className="callout">
                  <strong>
                    {report.response.before} → {report.response.after} ({report.response.grade})
                  </strong>{" "}
                  · lift {report.response.lift > 0 ? "+" : ""}
                  {report.response.lift} points · {report.response.engine} · {report.response.passes} passes
                  {report.response.product?.seo?.seoTitle ? (
                    <>
                      <div className="divider" />
                      <span className="eyebrow">New title</span>
                      <p style={{ margin: "4px 0 0" }}>{report.response.product.seo.seoTitle}</p>
                      <span className="eyebrow" style={{ marginTop: 8 }}>
                        New meta description
                      </span>
                      <p style={{ margin: "4px 0 0" }}>{report.response.product.seo.metaDescription}</p>
                    </>
                  ) : null}
                </div>

                {report.deltas.length ? (
                  <div>
                    <span className="eyebrow">What changed, factor by factor</span>
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Ranking factor</th>
                            <th className="center">Weight</th>
                            <th className="center">Before</th>
                            <th className="center">After</th>
                            <th className="center">Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.deltas.map((row) => {
                            const delta = Math.round((row.after - row.before) * 10) / 10;
                            return (
                              <tr key={row.label}>
                                <td>{row.label}</td>
                                <td className="center mono">{row.weight}</td>
                                <td className="center mono">{row.before}</td>
                                <td className="center mono">{row.after}</td>
                                <td className="center mono" style={{ color: delta > 0 ? "var(--good)" : "var(--bad)" }}>
                                  {delta > 0 ? "+" : ""}
                                  {delta}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {report.response.autoFixes.length ? (
                  <div>
                    <span className="eyebrow">Auto-fixes applied</span>
                    <ul className="bullet-list">
                      {report.response.autoFixes.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="card-header">
            <h3>Merchant data</h3>
            <span className="small muted">these fields feed keyword research, copy generation and structured data</span>
          </div>
          <div className="card-pad stack" style={{ gap: 16 }}>
            <div className="form-grid">
              <label className="field">
                <span>Title</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label className="field">
                <span>SKU</span>
                <input value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} />
              </label>
              <label className="field">
                <span>Price</span>
                <input value={draft.price} inputMode="decimal" onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} />
              </label>
              <label className="field">
                <span>Compare-at price</span>
                <input
                  value={draft.compareAtPrice ?? ""}
                  inputMode="decimal"
                  onChange={(event) => setDraft({ ...draft, compareAtPrice: event.target.value ? Number(event.target.value) : undefined })}
                />
              </label>
              <label className="field">
                <span>Category</span>
                <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
              </label>
              <label className="field">
                <span>Audience</span>
                <select value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })}>
                  {["unisex", "men", "women", "kids"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Material</span>
                <input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} />
              </label>
              <label className="field">
                <span>Weight (GSM)</span>
                <input
                  value={draft.weightGsm ?? ""}
                  inputMode="numeric"
                  onChange={(event) => setDraft({ ...draft, weightGsm: event.target.value ? Number(event.target.value) : undefined })}
                />
              </label>
              <label className="field">
                <span>Fit</span>
                <input value={draft.fit ?? ""} onChange={(event) => setDraft({ ...draft, fit: event.target.value })} />
              </label>
              <label className="field">
                <span>Country of origin</span>
                <input value={draft.countryOfOrigin ?? ""} onChange={(event) => setDraft({ ...draft, countryOfOrigin: event.target.value })} />
              </label>
              <label className="field">
                <span>Status</span>
                <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                  <option value="published">published</option>
                  <option value="draft">draft</option>
                  <option value="archived">archived</option>
                </select>
              </label>
            </div>

            <label className="field">
              <span>Sizes (comma separated)</span>
              <input
                value={draft.sizes.join(", ")}
                onChange={(event) => setDraft({ ...draft, sizes: event.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
            </label>

            <label className="field">
              <span>Features (one per line)</span>
              <textarea
                rows={5}
                value={draft.features.join("\n")}
                onChange={(event) => setDraft({ ...draft, features: event.target.value.split("\n") })}
              />
            </label>

            <label className="field">
              <span>Merchant description</span>
              <textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              <span className="help">The optimizer expands this; it never publishes it verbatim unless it already scores well.</span>
            </label>

            <div>
              <span className="eyebrow">Inventory by size</span>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                {draft.sizes.map((size) => (
                  <label className="field" key={size} style={{ width: 110 }}>
                    <span>{size}</span>
                    <input
                      inputMode="numeric"
                      value={draft.inventory[size] ?? 0}
                      onChange={(event) => setDraft({ ...draft, inventory: { ...draft.inventory, [size]: Number(event.target.value) } })}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={reoptimize} onChange={(event) => setReoptimize(event.target.checked)} />
                <span className="small">Re-run AI optimization after saving</span>
              </label>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void saveData()}>
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setDraft(fields)}>
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {toast ? (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MARKETS } from "@/lib/i18n/markets";

type UploadedImage = { src: string; alt: string; width: number; height: number };

type CreateResponse = {
  product?: { id: string; slug: string; title: string; score: number; grade: string; seoTitle: string; metaDescription: string; h1: string; primaryKeyword: string; keywordCount: number; wordCount: number };
  score?: number;
  grade?: string;
  previousScore?: number;
  primaryKeyword?: string;
  engine?: string;
  passes?: number;
  autoFixes?: string[];
  error?: string;
};

type ImportResponse = {
  received?: number;
  created?: number;
  failed?: number;
  averageScore?: number;
  format?: string;
  results?: { title: string; slug?: string; status: string; score?: number; grade?: string; primaryKeyword?: string; error?: string }[];
  error?: string;
};

type Suggestion = { term: string; volume: number; difficulty: number; priority: number; intent: string };

const EMPTY_FORM = {
  title: "",
  sku: "",
  price: "",
  compareAtPrice: "",
  category: "pullover",
  gender: "unisex",
  sizes: "XS,S,M,L,XL,2XL",
  colors: "Black:#111315,Sand:#d9c9ae",
  material: "100% combed cotton loopback",
  weightGsm: "380",
  fit: "regular",
  features: "Double-needle stitching\nLined hood with cotton drawcord\nBar-tacked kangaroo pocket\nPre-shrunk to under 3%",
  description: "",
  careInstructions: "Machine wash cold inside out, tumble dry low.",
  countryOfOrigin: "Portugal",
  tags: "",
  collections: "men,unisex",
  rating: "",
  reviewCount: "",
  status: "published",
};

/**
 * Product upload console.
 *
 * Three paths in, one pipeline out: a single-product form, a drag-and-drop
 * CSV/JSON bulk import, and pasted rows. Whatever arrives is normalized and
 * pushed through keyword research, copy generation, scoring and auto-fix before
 * it is written to the catalogue — the merchant never has to touch SEO fields.
 */
export function ProductUploader({ defaultMarkets }: { defaultMarkets: string[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"single" | "bulk" | "paste">("single");
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [markets, setMarkets] = useState<string[]>(defaultMarkets.slice(0, 6));
  const [passes, setPasses] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [pasted, setPasted] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bulkInput = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof EMPTY_FORM) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const flash = (text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 7000);
  };

  // Live keyword typeahead off the title + description as the merchant types.
  const seedText = useMemo(() => `${form.title} ${form.material} ${form.category} ${form.description}`.trim(), [form.title, form.material, form.category, form.description]);
  useEffect(() => {
    if (seedText.replace(/\s+/g, "").length < 8) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/keywords/suggest?q=${encodeURIComponent(seedText.slice(0, 60))}&limit=8&markets=${markets.join(",")}`);
        const data = await response.json();
        setSuggestions((data.suggestions ?? data.keywords ?? []) as Suggestion[]);
      } catch {
        /* typeahead is best-effort */
      }
    }, 320);
    return () => clearTimeout(handle);
  }, [seedText, markets]);

  async function uploadFiles(files: FileList | File[] | null | undefined) {
    const list = [...(files ?? [])].filter((file) => file.type.startsWith("image/"));
    if (!list.length) return;
    setUploadingImages(true);
    try {
      for (const file of list.slice(0, 8)) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Upload rejected");
        setImages((previous) => [...previous, { src: data.src, alt: data.alt ?? "", width: data.width, height: data.height }]);
      }
      flash(`${list.length} image(s) processed — resized to 1600px JPEG for fast LCP.`);
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setUploadingImages(false);
    }
  }

  async function submitSingle(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) {
      flash("A product title is required — everything else can be inferred.", "error");
      return;
    }
    setBusy("single");
    setResult(null);
    try {
      const payload = {
        title: form.title,
        sku: form.sku || undefined,
        price: Number(form.price || 0) || undefined,
        compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : undefined,
        category: form.category,
        gender: form.gender,
        sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
        colors: form.colors
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => {
            const [name, hex] = entry.split(":");
            return { name: name.trim(), hex: (hex ?? "#cccccc").trim() };
          }),
        material: form.material,
        weightGsm: form.weightGsm ? Number(form.weightGsm) : undefined,
        fit: form.fit,
        features: form.features.split("\n").map((line) => line.trim()).filter(Boolean),
        description: form.description,
        careInstructions: form.careInstructions,
        countryOfOrigin: form.countryOfOrigin,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        collections: form.collections.split(",").map((c) => c.trim()).filter(Boolean),
        rating: form.rating ? Number(form.rating) : undefined,
        reviewCount: form.reviewCount ? Number(form.reviewCount) : undefined,
        images: images.map((image) => ({ src: image.src, alt: image.alt, width: image.width, height: image.height, role: "product" })),
        status: form.status,
        optimize: true,
        publish: form.status === "published",
        passes,
        targetMarkets: markets,
      };

      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as CreateResponse;
      if (!response.ok) throw new Error(data.error ?? `Upload failed (${response.status})`);
      setResult(data);
      flash(`Listing created and optimized — score ${data.previousScore ?? 0} → ${data.score} (${data.grade}).`);
      router.refresh();
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function submitBulk(files: FileList | null | undefined) {
    const file = files?.[0];
    if (!file) return;
    setBusy("bulk");
    setImportResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/products/import?optimize=true&passes=${passes}`, { method: "POST", body });
      const data = (await response.json()) as ImportResponse;
      if (!response.ok) throw new Error(data.error ?? `Import failed (${response.status})`);
      setImportResult(data);
      flash(`${data.created} of ${data.received} rows imported · average SEO score ${data.averageScore}.`);
      router.refresh();
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function submitPasted() {
    if (!pasted.trim()) {
      flash("Paste CSV rows first (a header line helps, but aliases are detected automatically).", "error");
      return;
    }
    setBusy("paste");
    setImportResult(null);
    try {
      const response = await fetch(`/api/products/import?optimize=true&passes=${passes}`, {
        method: "POST",
        headers: { "content-type": "text/csv" },
        body: pasted,
      });
      const data = (await response.json()) as ImportResponse;
      if (!response.ok) throw new Error(data.error ?? `Import failed (${response.status})`);
      setImportResult(data);
      flash(`${data.created} listings created from pasted rows.`);
      router.refresh();
    } catch (error) {
      flash((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const toggleMarket = (country: string) =>
    setMarkets((previous) => (previous.includes(country) ? previous.filter((c) => c !== country) : [...previous, country]));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="tabs" role="tablist">
        <button className={`tab ${tab === "single" ? "active" : ""}`} onClick={() => setTab("single")} type="button">
          Single product
        </button>
        <button className={`tab ${tab === "bulk" ? "active" : ""}`} onClick={() => setTab("bulk")} type="button">
          Bulk CSV / JSON
        </button>
        <button className={`tab ${tab === "paste" ? "active" : ""}`} onClick={() => setTab("paste")} type="button">
          Paste rows
        </button>
      </div>

      {tab === "single" ? (
        <form className="panel" onSubmit={submitSingle}>
          <div className="card-header">
            <h3>Upload a listing</h3>
            <span className="small muted">SEO fields are generated for you — fill in what you know</span>
          </div>
          <div className="card-pad stack" style={{ gap: 18 }}>
            <div className="form-grid">
              <label className="field">
                <span>Product title *</span>
                <input value={form.title} onChange={set("title")} placeholder="Apex 420 Heavyweight Hoodie" required />
                <span className="help">The engine extracts fabric, weight and fit from this line first.</span>
              </label>
              <label className="field">
                <span>SKU</span>
                <input value={form.sku} onChange={set("sku")} placeholder="NL-APX-420" />
              </label>
              <label className="field">
                <span>Price (USD)</span>
                <input value={form.price} onChange={set("price")} inputMode="decimal" placeholder="112" />
              </label>
              <label className="field">
                <span>Compare-at price</span>
                <input value={form.compareAtPrice} onChange={set("compareAtPrice")} inputMode="decimal" placeholder="139" />
              </label>
              <label className="field">
                <span>Category</span>
                <select value={form.category} onChange={set("category")}>
                  {["pullover", "zip-up", "oversized", "heavyweight", "cropped", "graphic", "kids", "lightweight", "blank"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Audience</span>
                <select value={form.gender} onChange={set("gender")}>
                  {["unisex", "men", "women", "kids"].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Fabric / weight</span>
                <input value={form.weightGsm} onChange={set("weightGsm")} inputMode="numeric" placeholder="380" />
                <span className="help">GSM drives the “heavyweight / midweight / lightweight” targeting split.</span>
              </label>
              <label className="field">
                <span>Material</span>
                <input value={form.material} onChange={set("material")} placeholder="80% cotton / 20% recycled polyester" />
              </label>
              <label className="field">
                <span>Fit</span>
                <input value={form.fit} onChange={set("fit")} placeholder="regular | oversized | cropped | slim" />
              </label>
              <label className="field">
                <span>Sizes (comma separated)</span>
                <input value={form.sizes} onChange={set("sizes")} />
              </label>
              <label className="field">
                <span>Colourways (Name:#hex)</span>
                <input value={form.colors} onChange={set("colors")} />
              </label>
              <label className="field">
                <span>Collections (slugs)</span>
                <input value={form.collections} onChange={set("collections")} />
              </label>
            </div>

            <label className="field">
              <span>Features (one per line)</span>
              <textarea rows={4} value={form.features} onChange={set("features")} />
            </label>

            <label className="field">
              <span>Description (optional — the AI writes the listing copy if you leave it blank)</span>
              <textarea rows={4} value={form.description} onChange={set("description")} placeholder="A short merchant note is enough; the engine expands it into structured sections, FAQs and bullets." />
            </label>

            <div>
              <span className="eyebrow">Photography</span>
              <div
                className="dropzone"
                data-over={dragOver}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  void uploadFiles(event.dataTransfer.files);
                }}
              >
                <strong>{uploadingImages ? "Processing images…" : "Drop product photos here, or click to browse"}</strong>
                <p className="small muted" style={{ margin: "6px 0 0" }}>
                  JPEG/PNG/WebP. Each file is normalized to a 1600px progressive JPEG, and dimensions are returned so the
                  storefront can reserve space (zero CLS).
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    void uploadFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              {images.length ? (
                <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                  {images.map((image, index) => (
                    <div key={image.src} className="stack" style={{ gap: 6, width: 190 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.src} alt={image.alt || "uploaded product"} width={190} height={140} style={{ borderRadius: 8, objectFit: "cover", border: "1px solid var(--line)" }} />
                      <input
                        value={image.alt}
                        placeholder="Alt text (auto-generated if blank)"
                        onChange={(event) =>
                          setImages((previous) => previous.map((item, i) => (i === index ? { ...item, alt: event.target.value } : item)))
                        }
                        style={{ fontSize: "0.78rem" }}
                      />
                      <div className="row-between">
                        <span className="small muted mono">
                          {image.width}×{image.height}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImages((previous) => previous.filter((_, i) => i !== index))}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <span className="eyebrow">Target markets (drives hreflang, localized titles and seasonal timing)</span>
              <div className="pill-list" style={{ marginTop: 8 }}>
                {MARKETS.slice(0, 14).map((market) => (
                  <button
                    type="button"
                    key={market.country}
                    className={`pill ${markets.includes(market.country) ? "accent" : ""}`}
                    onClick={() => toggleMarket(market.country)}
                  >
                    {market.name} <span className="mono">{market.country}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Optimization passes</span>
                <select value={String(passes)} onChange={(event) => setPasses(Number(event.target.value))}>
                  <option value="1">1 — fastest</option>
                  <option value="2">2 — balanced</option>
                  <option value="3">3 — converge on the best score (default)</option>
                  <option value="4">4 — maximum</option>
                </select>
                <span className="help">Each pass re-scores the listing and auto-fixes whatever it diagnoses.</span>
              </label>
              <label className="field">
                <span>Status</span>
                <select value={form.status} onChange={set("status")}>
                  <option value="published">Publish immediately</option>
                  <option value="draft">Save as draft</option>
                </select>
              </label>
            </div>

            {suggestions.length ? (
              <div className="callout">
                <strong>Live keyword suggestions for this listing</strong>
                <div className="pill-list" style={{ marginTop: 8 }}>
                  {suggestions.map((suggestion) => (
                    <span className="pill" key={suggestion.term} title={`Priority ${suggestion.priority} · ${suggestion.intent}`}>
                      {suggestion.term} <span className="mono muted">{suggestion.volume.toLocaleString()}</span>
                    </span>
                  ))}
                </div>
                <p className="small muted" style={{ margin: "8px 0 0" }}>
                  Modelled from your inputs plus first-party search data — these are candidates; the optimizer picks the
                  primary target by salience, plausibility and cannibalization risk.
                </p>
              </div>
            ) : null}

            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-primary btn-lg" type="submit" disabled={!!busy}>
                {busy === "single" ? "Optimizing listing…" : "Upload & auto-optimize"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setForm(EMPTY_FORM)} disabled={!!busy}>
                Clear form
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {tab === "bulk" ? (
        <div className="panel">
          <div className="card-header">
            <h3>Bulk import</h3>
            <span className="small muted">CSV or JSON · up to 500 rows per request</span>
          </div>
          <div className="card-pad stack" style={{ gap: 14 }}>
            <div
              className="dropzone"
              onClick={() => bulkInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void submitBulk(event.dataTransfer.files);
              }}
            >
              <strong>{busy === "bulk" ? "Importing and optimizing…" : "Drop a .csv or .json export here"}</strong>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                Shopify, WooCommerce and generic headers are recognized automatically (title/name/product_name,
                price/price_usd, variants, tags…). Every row is optimized before it is saved.
              </p>
              <input
                ref={bulkInput}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                hidden
                onChange={(event) => {
                  void submitBulk(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <a className="btn btn-outline btn-sm" href="/api/products/import?template=csv" download>
                Download CSV template
              </a>
              <a className="btn btn-ghost btn-sm" href="/api/products/import">
                View accepted columns
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "paste" ? (
        <div className="panel">
          <div className="card-header">
            <h3>Paste rows</h3>
            <span className="small muted">Handy for a handful of styles from a spreadsheet</span>
          </div>
          <div className="card-pad stack" style={{ gap: 12 }}>
            <textarea
              rows={8}
              className="mono"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={`title,price,material,weight_gsm,description\nApex 420 Heavyweight Hoodie,112,100% combed cotton,420,"Cold-weather pullover"`}
              style={{ width: "100%" }}
            />
            <button className="btn btn-primary" type="button" onClick={() => void submitPasted()} disabled={!!busy}>
              {busy === "paste" ? "Importing…" : "Import pasted rows"}
            </button>
          </div>
        </div>
      ) : null}

      {result?.product ? (
        <div className="panel">
          <div className="card-header">
            <h3>AI optimization result</h3>
            <span className="small muted">
              {result.engine} engine · {result.passes} passes
            </span>
          </div>
          <div className="card-pad stack" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 22, flexWrap: "wrap", alignItems: "center" }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">Raw upload</span>
                <strong style={{ fontSize: "1.6rem", color: "var(--bad)" }}>{Math.round(result.previousScore ?? 0)}</strong>
              </div>
              <span style={{ fontSize: "1.4rem", color: "var(--ink-3)" }}>→</span>
              <div className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">After AI</span>
                <strong style={{ fontSize: "1.6rem", color: "var(--good)" }}>{result.score}</strong>
                <span className="badge badge-good">{result.grade}</span>
              </div>
              <dl className="kv" style={{ flex: 1, minWidth: 260 }}>
                <dt>Primary keyword</dt>
                <dd>{result.primaryKeyword}</dd>
                <dt>Keywords mapped</dt>
                <dd>{result.product.keywordCount}</dd>
                <dt>Body length</dt>
                <dd>{result.product.wordCount} words</dd>
                <dt>Slug</dt>
                <dd className="mono">/shop/{result.product.slug}</dd>
              </dl>
            </div>

            <div className="serp">
              <div className="url">
                <span className="favicon">NL</span>
                <span className="crumb">northloop.example › shop › {result.product.slug}</span>
              </div>
              <div className="title">{result.product.seoTitle}</div>
              <div className="desc">{result.product.metaDescription}</div>
              <div className="serp-meta">
                <span>
                  Title <b className={result.product.seoTitle.length <= 62 ? "ok" : ""}>{result.product.seoTitle.length} chars</b>
                </span>
                <span>
                  Meta <b className={result.product.metaDescription.length <= 160 ? "ok" : ""}>{result.product.metaDescription.length} chars</b>
                </span>
                <span>H1: {result.product.h1}</span>
              </div>
            </div>

            {result.autoFixes?.length ? (
              <div>
                <span className="eyebrow">Auto-fixes applied</span>
                <ul className="bullet-list">
                  {result.autoFixes.slice(0, 10).map((fix) => (
                    <li key={fix}>{fix}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="row" style={{ gap: 10 }}>
              <a className="btn btn-primary btn-sm" href={`/admin/products/${result.product.slug}`}>
                Open in SEO editor →
              </a>
              <a className="btn btn-outline btn-sm" href={`/shop/${result.product.slug}`} target="_blank" rel="noreferrer">
                View live page
              </a>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setResult(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importResult ? (
        <div className="panel">
          <div className="card-header">
            <h3>Import report</h3>
            <span className="small muted">
              {importResult.format} · {importResult.created} created · {importResult.failed} failed · avg score{" "}
              {importResult.averageScore}
            </span>
          </div>
          <div className="card-pad">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th className="center">Score</th>
                    <th>Primary keyword</th>
                  </tr>
                </thead>
                <tbody>
                  {(importResult.results ?? []).map((row, index) => (
                    <tr key={`${row.title}-${index}`}>
                      <td>
                        {row.slug ? <a href={`/admin/products/${row.slug}`}>{row.title}</a> : row.title}
                        {row.error ? <div className="small" style={{ color: "var(--bad)" }}>{row.error}</div> : null}
                      </td>
                      <td>
                        <span className={`badge ${row.status === "created" ? "badge-good" : "badge-bad"}`}>{row.status}</span>
                      </td>
                      <td className="center mono">{row.score ?? "—"}</td>
                      <td className="small">{row.primaryKeyword ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

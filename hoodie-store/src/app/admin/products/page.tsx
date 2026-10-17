import Link from "next/link";
import { ProductUploader } from "@/components/admin/ProductUploader";
import { ProductRowActions } from "@/components/admin/ProductRowActions";
import { ScoreDial } from "@/components/admin/Viz";
import { getAllProducts } from "@/lib/store/db";
import { summarizeProduct } from "@/lib/api/serialize";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { rankMarketsFor } from "@/lib/i18n/markets";
import { formatUsd, inventoryHealth } from "@/lib/commerce/product-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products · Admin", robots: { index: false, follow: false } };

type SearchParams = { q?: string; status?: string; sort?: string };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await ensureCatalogue();
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const status = params.status ?? "all";
  const sort = params.sort ?? "score";

  const rows = getAllProducts()
    .map(summarizeProduct)
    .filter((row) => (status === "all" ? true : row.status === status))
    .filter((row) => (query ? `${row.title} ${row.slug} ${row.primaryKeyword} ${row.category}`.toLowerCase().includes(query) : true))
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "revenue") return b.metrics.revenue - a.metrics.revenue;
      if (sort === "clicks") return b.metrics.clicks - a.metrics.clicks;
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      return a.score - b.score; // worst first: the queue of work
    });

  const products = getAllProducts();
  const average = products.length ? Math.round(products.reduce((sum, p) => sum + (p.seo?.score?.total ?? 0), 0) / products.length) : 0;
  const averageBefore = products.length
    ? Math.round(products.reduce((sum, p) => sum + (p.seo?.previousScore ?? 0), 0) / products.length)
    : 0;
  const unoptimized = products.filter((p) => !p.seo?.optimized).length;
  const lowStock = products.filter((p) => inventoryHealth(p).lowStock || inventoryHealth(p).outOfStock).length;
  const defaultMarkets = rankMarketsFor(new Date().getMonth())
    .slice(0, 8)
    .map((market) => market.country);

  const sortLink = (value: string, label: string) => {
    const next = new URLSearchParams({ ...(params as Record<string, string>) });
    next.set("sort", value);
    return (
      <Link href={`?${next.toString()}`} className={`pill ${sort === value ? "accent" : ""}`}>
        {label}
      </Link>
    );
  };

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>Products &amp; uploads</h1>
          <p className="muted" style={{ maxWidth: 68 }}>
            Upload one listing, a spreadsheet, or a pasted block of rows. Each item is normalized, researched against
            global demand, written, scored and auto-fixed before it goes live.
          </p>
        </div>
        <ScoreDial total={average} caption={`catalogue average (raw uploads score ${averageBefore})`} size={112} />
      </header>

      <section className="stack" style={{ gap: 20 }}>
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Listings</div>
            <div className="value">{products.length}</div>
            <div className="small muted">{products.filter((p) => p.status === "published").length} published</div>
          </div>
          <div className="stat">
            <div className="label">Not yet optimized</div>
            <div className="value">{unoptimized}</div>
            <div className="small muted">run “Optimize drafts &amp; unoptimized” on the dashboard</div>
          </div>
          <div className="stat">
            <div className="label">Stock alerts</div>
            <div className="value">{lowStock}</div>
            <div className="small muted">low or out of stock — inventory health is a ranking input</div>
          </div>
          <div className="stat">
            <div className="label">Keywords mapped</div>
            <div className="value">{products.reduce((sum, p) => sum + (p.seo?.keywords?.length ?? 0), 0).toLocaleString()}</div>
            <div className="small muted">primary + secondary + long-tail + localized</div>
          </div>
        </div>

        <ProductUploader defaultMarkets={defaultMarkets} />

        <div className="panel">
          <div className="card-header">
            <h3>All listings ({rows.length})</h3>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {sortLink("score", "Worst score first")}
              {sortLink("title", "A–Z")}
              {sortLink("clicks", "Most clicks")}
              {sortLink("revenue", "Most revenue")}
              {sortLink("updated", "Recently updated")}
            </div>
          </div>
          <div className="card-pad">
            <form className="row" style={{ gap: 8, marginBottom: 14 }} method="get">
              <input name="q" defaultValue={params.q ?? ""} placeholder="Filter by title, slug, keyword…" style={{ flex: 1 }} />
              <select name="status" defaultValue={status}>
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
              </select>
              <input type="hidden" name="sort" value={sort} />
              <button className="btn btn-outline btn-sm" type="submit">
                Apply
              </button>
            </form>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Listing</th>
                    <th>SEO title</th>
                    <th className="center">Score</th>
                    <th className="center">Lift</th>
                    <th>Primary keyword</th>
                    <th className="center">Words</th>
                    <th className="center">Impr.</th>
                    <th className="center">CTR</th>
                    <th className="center">Revenue</th>
                    <th className="center">Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const product = products.find((p) => p.id === row.id);
                    const stock = product ? inventoryHealth(product) : { total: 0, inStock: false, lowStock: false, outOfStock: true, coverage: 0, inStockSizes: [] as string[] };
                    const lift = Math.round((row.score - row.previousScore) * 10) / 10;
                    return (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/admin/products/${row.slug}`}>
                            <strong>{row.title}</strong>
                          </Link>
                          <div className="small muted mono">/{row.slug}</div>
                          <div className="row" style={{ gap: 6, marginTop: 4 }}>
                            <span className={`badge ${row.status === "published" ? "badge-good" : "badge-warn"}`}>{row.status}</span>
                            <span className="badge badge-grid">{row.engine}</span>
                            <span className="badge badge-info">v{row.version}</span>
                          </div>
                        </td>
                        <td className="small" style={{ maxWidth: 320 }}>
                          {row.seoTitle}
                          <div className="muted" style={{ marginTop: 3 }}>
                            {row.metaDescription.slice(0, 96)}…
                          </div>
                        </td>
                        <td className="center">
                          <strong>{row.score}</strong>
                          <div>
                            <span className={`badge ${row.grade.startsWith("A") ? "badge-good" : row.grade === "B" ? "badge-info" : "badge-warn"}`}>
                              {row.grade}
                            </span>
                          </div>
                        </td>
                        <td className="center mono" style={{ color: lift > 0 ? "var(--good)" : "var(--ink-3)" }}>
                          {lift > 0 ? `+${lift}` : lift}
                        </td>
                        <td className="small">
                          {row.primaryKeyword || <span className="muted">not targeted</span>}
                          <div className="muted">{row.keywordCount} mapped · {row.markets.length} markets</div>
                        </td>
                        <td className="center mono">{row.wordCount}</td>
                        <td className="center mono">{row.metrics.impressions.toLocaleString()}</td>
                        <td className="center mono">{row.metrics.ctr}%</td>
                        <td className="center mono">{formatUsd(row.metrics.revenue)}</td>
                        <td className="center">
                          <span className={`badge ${stock.outOfStock ? "badge-bad" : stock.lowStock ? "badge-warn" : "badge-good"}`}>
                            {stock.total}
                          </span>
                          <div className="small muted">{stock.coverage}% sizes</div>
                        </td>
                        <td>
                          <ProductRowActions id={row.id} slug={row.slug} status={row.status} optimized={row.optimized} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="small muted" style={{ marginTop: 12 }}>
              “Lift” compares the raw merchant upload against the optimized listing — the same rubric Google-facing
              factors are scored on. Inventory health, review depth and observed CTR are part of that rubric, which is
              why a stock-out can move a score.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

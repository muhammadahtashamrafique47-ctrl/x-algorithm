import Link from "next/link";
import { KeywordExplorer } from "@/components/admin/KeywordExplorer";
import { contentGaps, keywordOwnership, topKeywordsAcrossCatalogue } from "@/lib/seo/internal";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, getSearchLog } from "@/lib/store/db";
import { rankMarketsFor } from "@/lib/i18n/markets";
import { searchEverything } from "@/lib/commerce/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keyword research · Admin", robots: { index: false, follow: false } };

export default async function AdminKeywordsPage() {
  await ensureCatalogue();
  const products = getAllProducts();
  const month = new Date().getMonth();
  const markets = rankMarketsFor(month).slice(0, 8).map((market) => market.country);
  const gaps = contentGaps(24);
  const ownership = keywordOwnership(products);
  const contested = Object.entries(ownership)
    .filter(([, owners]) => owners.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 14);
  const owned = topKeywordsAcrossCatalogue(24);
  const searchLog = Object.entries(getSearchLog()).sort((a, b) => b[1] - a[1]);
  const zeroResult = searchLog
    .map(([term, count]) => ({ term, count, results: searchEverything(term).products.length }))
    .filter((row) => row.results === 0)
    .slice(0, 12);

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="eyebrow">Demand intelligence</p>
          <h1>Keyword research &amp; suggestions</h1>
          <p className="muted" style={{ maxWidth: 72 }}>
            Volume, difficulty, CPC, trend, seasonality and SERP composition are modelled from a curated head-term and
            modifier lexicon, market economics for {markets.length}+ territories, the retail calendar, and your own
            first-party signals — on-site searches and attributed conversions. No third-party API key, no data leaving
            the server, and the same numbers the optimizer uses when it picks a primary target.
          </p>
        </div>
        <div className="stack" style={{ gap: 6, minWidth: 220 }}>
          <span className="pill accent">{searchLog.length} first-party queries logged</span>
          <span className="pill">{gaps.length} content gaps detected</span>
          <span className="pill">{contested.length} contested terms</span>
          <span className="pill">{products.reduce((sum, p) => sum + (p.seo?.keywords?.length ?? 0), 0).toLocaleString()} keywords mapped</span>
        </div>
      </header>

      <section className="stack" style={{ gap: 20 }}>
        <KeywordExplorer
          initialSeed="hoodie"
          initialMarkets={markets}
          productSlugs={products.map((product) => ({ slug: product.slug, title: product.title }))}
        />

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Content gaps</h3>
              <span className="small muted">demand you are not serving</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th className="center">Demand</th>
                      <th>Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((gap) => (
                      <tr key={gap.term}>
                        <td>
                          <strong>{gap.term}</strong>
                        </td>
                        <td className="center mono">{gap.demand}</td>
                        <td className="small muted">{gap.reason}</td>
                      </tr>
                    ))}
                    {!gaps.length ? (
                      <tr>
                        <td colSpan={3} className="muted">
                          Every logged query is covered by at least one published listing.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {zeroResult.length ? (
                <>
                  <div className="divider" />
                  <span className="eyebrow">Searches returning zero products</span>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Query</th>
                          <th className="center">Searches</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zeroResult.map((row) => (
                          <tr key={row.term}>
                            <td className="mono">{row.term}</td>
                            <td className="center mono">{row.count}</td>
                            <td className="small">
                              <Link href={`/admin/products?seed=${encodeURIComponent(row.term)}`}>Create a listing →</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Keyword ownership map</h3>
              <span className="small muted">which listing owns which query</span>
            </div>
            <div className="card-pad stack" style={{ gap: 16 }}>
              <div>
                <span className="eyebrow">Highest-value owned terms</span>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th className="center">Volume</th>
                        <th className="center">KD</th>
                        <th>Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owned.map((keyword) => (
                        <tr key={`${keyword.normalized}-${keyword.product}`}>
                          <td>
                            {keyword.term}
                            <span className="badge badge-grid" style={{ marginLeft: 6 }}>
                              {keyword.kind}
                            </span>
                          </td>
                          <td className="center mono">{keyword.volume.toLocaleString()}</td>
                          <td className="center mono">{keyword.difficulty}</td>
                          <td className="small">{keyword.product}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <span className="eyebrow">Contested terms (cannibalization watchlist)</span>
                {contested.length ? (
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Term</th>
                          <th className="center">Listings</th>
                          <th>Owners</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contested.map(([term, owners]) => (
                          <tr key={term}>
                            <td className="mono">{term}</td>
                            <td className="center">
                              <span className={`badge ${owners.length > 2 ? "badge-bad" : "badge-warn"}`}>{owners.length}</span>
                            </td>
                            <td className="small">
                              {owners.map((owner) => (
                                <Link key={owner.slug} href={`/admin/products/${owner.slug}`} style={{ marginRight: 8 }}>
                                  {owner.title}
                                </Link>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small muted">
                    No two listings share a primary or secondary target — the optimizer enforces this when it selects
                    targets.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

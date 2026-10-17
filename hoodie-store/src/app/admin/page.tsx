import Link from "next/link";
import { AdminActions } from "@/components/admin/AdminActions";
import { FactorBars, ScoreDial, StatTile, TrendChart } from "@/components/admin/Viz";
import { analyticsSummary, rankTracker } from "@/lib/commerce/analytics";
import { topKeywordsAcrossCatalogue } from "@/lib/seo/internal";
import { runSiteAudit } from "@/lib/seo/audit";
import { aiStatus } from "@/lib/seo/ai/provider";
import { ALGORITHM_FACTORS } from "@/lib/seo/external";
import { formatUsd } from "@/lib/commerce/product-utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin dashboard", robots: { index: false, follow: false } };

export default function AdminDashboardPage() {
  const analytics = analyticsSummary(30);
  const audit = runSiteAudit();
  const ranks = rankTracker(12);
  const ai = aiStatus();
  const ownedKeywords = topKeywordsAcrossCatalogue(10);
  const systemName = (id: string) => ALGORITHM_FACTORS.find((f) => f.id === id)?.name ?? id;

  const critical = audit.issues.filter((issue) => issue.severity === "critical");
  const warnings = audit.issues.filter((issue) => issue.severity === "warning");

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="eyebrow">Merchant console</p>
          <h1>SEO &amp; revenue dashboard</h1>
          <p className="muted" style={{ maxWidth: 70 }}>
            Every listing is scored against Google&apos;s documented ranking systems on each save. This page shows the
            catalogue as the engine currently sees it — health, demand, and the money attached to it.
          </p>
        </div>
        <div className="stack" style={{ gap: 10, minWidth: 260 }}>
          <ScoreDial total={audit.score} grade={audit.grade} caption="Site-wide SEO health" size={112} />
          <span className="pill accent">{ai.engine}</span>
        </div>
      </header>

      <section className="stack" style={{ gap: 20 }}>
        <AdminActions />

        <div className="stat-grid">
          <StatTile label="Impressions (30d)" value={analytics.impressions.toLocaleString()} hint="Sample data until Search Console is connected" />
          <StatTile label="Clicks (30d)" value={analytics.clicks.toLocaleString()} delta={`${analytics.ctr}% CTR`} />
          <StatTile label="Purchases" value={analytics.purchases.toLocaleString()} delta={`${analytics.conversionRate}% CVR`} />
          <StatTile label="Revenue" value={formatUsd(analytics.revenue)} hint={`AOV ${formatUsd(analytics.averageOrderValue)}`} />
          <StatTile label="Keywords targeted" value={audit.counts.keywordsTargeted.toLocaleString()} hint={`${audit.counts.markets} markets · ${audit.counts.locales} locales`} />
          <StatTile
            label="Forecast clicks/mo"
            value={audit.performance.forecastMonthlyClicks.toLocaleString()}
            hint="At current tracked positions, using the organic CTR curve"
          />
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Organic demand vs clicks</h3>
              <span className="small muted">last {analytics.windowDays} days</span>
            </div>
            <div className="card-pad">
              <TrendChart series={analytics.series} />
              <div className="row" style={{ gap: 16, marginTop: 12 }}>
                <span className="small">
                  <i style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent)", borderRadius: 2 }} /> impressions
                </span>
                <span className="small">
                  <i style={{ display: "inline-block", width: 10, height: 10, background: "var(--highlight)", borderRadius: 2 }} /> clicks
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Ranking-system health</h3>
              <span className="small muted">catalogue average per factor</span>
            </div>
            <div className="card-pad">
              <FactorBars
                limit={10}
                showFixes={false}
                factors={audit.factorHealth.map((factor) => ({
                  id: factor.id,
                  group: "onpage" as const,
                  label: systemName(factor.id) || factor.name,
                  weight: factor.weight,
                  score: Math.round(factor.averageRatio * factor.weight * 10) / 10,
                  detail: `${Math.round(factor.averageRatio * 100)}% of available points · ${factor.status}`,
                }))}
              />
            </div>
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Rank tracker</h3>
              <span className="small muted">tracked positions &amp; click forecast</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Keyword</th>
                      <th className="center">Pos</th>
                      <th className="center">Volume</th>
                      <th className="center">KD</th>
                      <th className="center">Clicks</th>
                      <th className="center">Forecast/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranks.map((row) => (
                      <tr key={row.term}>
                        <td>
                          {row.slug ? (
                            <Link href={`/admin/products/${row.slug}`}>{row.term}</Link>
                          ) : (
                            row.term
                          )}
                          <div className="small muted">{row.product}</div>
                        </td>
                        <td className="center">
                          <span className={`badge ${row.position <= 3 ? "badge-good" : row.position <= 10 ? "badge-info" : "badge-warn"}`}>
                            {row.position}
                          </span>
                        </td>
                        <td className="center mono">{row.volume.toLocaleString()}</td>
                        <td className="center mono">{row.difficulty}</td>
                        <td className="center mono">{row.observedClicks}</td>
                        <td className="center mono">{row.forecastMonthlyClicks.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Keyword → revenue attribution</h3>
              <span className="small muted">first-party conversion log</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th className="center">Impr.</th>
                      <th className="center">CTR</th>
                      <th className="center">Orders</th>
                      <th className="center">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byKeyword
                      .slice()
                      .sort((a, b) => b.revenue - a.revenue || b.clicks - a.clicks)
                      .slice(0, 12)
                      .map((row) => (
                        <tr key={row.term}>
                          <td>
                            {row.term}
                            {row.product ? <div className="small muted">{row.product}</div> : null}
                          </td>
                          <td className="center mono">{row.impressions.toLocaleString()}</td>
                          <td className="center mono">{row.ctr}%</td>
                          <td className="center mono">{row.purchases}</td>
                          <td className="center mono">{formatUsd(row.revenue)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Markets performing</h3>
              <span className="small muted">purchases by destination</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th className="center">Orders</th>
                      <th className="center">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byMarket.map((market) => (
                      <tr key={market.country}>
                        <td>
                          {market.name} <span className="small muted mono">{market.country}</span>
                        </td>
                        <td className="center mono">{market.purchases}</td>
                        <td className="center mono">{formatUsd(market.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginTop: 12 }}>
                Currency display follows the shopper&apos;s market; revenue is booked in USD.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Highest-value owned keywords</h3>
              <span className="small muted">across the whole catalogue</span>
            </div>
            <div className="card-pad">
              <div className="pill-list">
                {ownedKeywords.map((keyword) => (
                  <span className="pill" key={keyword.term} title={`${keyword.volume.toLocaleString()}/mo · KD ${keyword.difficulty} · primary on ${keyword.product}`}>
                    {keyword.term} <span className="mono muted">{keyword.volume.toLocaleString()}</span>
                    <span className="small muted"> · {keyword.product}</span>
                  </span>
                ))}
              </div>
              <div className="divider" />
              <h4 className="eyebrow">Content gaps the engine found</h4>
              <ul className="bullet-list">
                {audit.performance.searchesWithNoResult.slice(0, 6).map((gap) => (
                  <li key={gap.term}>
                    <strong>{gap.term}</strong> — {gap.count} on-site searches with no matching product
                  </li>
                ))}
              </ul>
              <Link className="btn btn-outline btn-sm" href="/admin/keywords">
                Open keyword research →
              </Link>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="card-header">
            <h3>Priority actions</h3>
            <span className="small muted">
              {critical.length} critical · {warnings.length} warnings · {audit.opportunities.length} opportunities
            </span>
          </div>
          <div className="card-pad">
            {audit.issues.slice(0, 8).map((issue) => (
              <div className={`issue ${issue.severity}`} key={issue.id}>
                <h4>
                  {issue.title}{" "}
                  <span className="badge badge-grid">
                    {issue.impact} impact · {issue.area}
                  </span>
                </h4>
                <p>{issue.detail}</p>
                <div className="fix">
                  {issue.action}
                  {issue.automated ? " — the optimizer applies this automatically on the next run." : ""}
                </div>
                {issue.affected.length ? (
                  <p className="small muted" style={{ marginTop: 6 }}>
                    Affected: {issue.affected.slice(0, 6).join(", ")}
                    {issue.affected.length > 6 ? ` +${issue.affected.length - 6} more` : ""}
                  </p>
                ) : null}
              </div>
            ))}
            <Link className="btn btn-outline btn-sm" href="/admin/seo">
              Full technical audit →
            </Link>
          </div>
        </div>

        <div className="panel">
          <div className="card-header">
            <h3>Grade distribution</h3>
            <span className="small muted">{audit.counts.published} published listings</span>
          </div>
          <div className="card-pad">
            <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
              {audit.distribution.map((bucket) => (
                <div key={bucket.grade} className="stack" style={{ gap: 4, minWidth: 92 }}>
                  <strong style={{ fontSize: "1.3rem" }}>{bucket.grade}</strong>
                  <div className="progress" style={{ width: 92 }}>
                    <span style={{ width: `${Math.min(100, (bucket.count / Math.max(1, audit.counts.published)) * 100)}%` }} />
                  </div>
                  <span className="small muted">{bucket.count} listings</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

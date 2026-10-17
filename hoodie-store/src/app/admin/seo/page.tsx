import Link from "next/link";
import { FactorBars, ScoreDial } from "@/components/admin/Viz";
import { runSiteAudit } from "@/lib/seo/audit";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { ALGORITHM_FACTORS, ALGORITHM_WEIGHT_TOTAL, CTR_BY_POSITION } from "@/lib/seo/external";
import { formatUsd } from "@/lib/commerce/product-utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "SEO audit · Admin", robots: { index: false, follow: false } };

export default async function AdminSeoPage() {
  await ensureCatalogue();
  const audit = runSiteAudit();
  const bySeverity = {
    critical: audit.issues.filter((issue) => issue.severity === "critical"),
    warning: audit.issues.filter((issue) => issue.severity === "warning"),
    notice: audit.issues.filter((issue) => issue.severity === "notice"),
  };

  return (
    <>
      <header className="admin-header">
        <div>
          <p className="eyebrow">Technical report</p>
          <h1>Site-wide SEO audit</h1>
          <p className="muted" style={{ maxWidth: 72 }}>
            Generated live from the current catalogue: {audit.counts.products} products ({audit.counts.published} published,{" "}
            {audit.counts.drafts} drafts), {audit.counts.collections} collections, {audit.counts.articles} guides,{" "}
            {audit.counts.keywordsTargeted.toLocaleString()} keyword targets across {audit.counts.markets} markets and{" "}
            {audit.counts.locales} locales.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <a className="btn btn-outline btn-sm" href="/api/seo/audit" target="_blank" rel="noreferrer">
              Raw audit JSON
            </a>
            <a className="btn btn-ghost btn-sm" href="/sitemap.xml" target="_blank" rel="noreferrer">
              sitemap.xml
            </a>
            <a className="btn btn-ghost btn-sm" href="/robots.txt" target="_blank" rel="noreferrer">
              robots.txt
            </a>
            <a className="btn btn-ghost btn-sm" href="/feeds/products.xml" target="_blank" rel="noreferrer">
              Merchant feed
            </a>
          </div>
        </div>
        <ScoreDial total={audit.score} grade={audit.grade} caption={`audited ${new Date(audit.generatedAt).toISOString().slice(0, 16).replace("T", " ")}`} />
      </header>

      <section className="stack" style={{ gap: 20 }}>
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Impressions</div>
            <div className="value">{audit.performance.impressions.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="label">Clicks</div>
            <div className="value">{audit.performance.clicks.toLocaleString()}</div>
            <div className="delta">{audit.performance.ctr}% CTR</div>
          </div>
          <div className="stat">
            <div className="label">Orders</div>
            <div className="value">{audit.performance.orders}</div>
            <div className="delta">{audit.performance.conversionRate}% CVR</div>
          </div>
          <div className="stat">
            <div className="label">Revenue</div>
            <div className="value">{formatUsd(audit.performance.revenue)}</div>
          </div>
          <div className="stat">
            <div className="label">Forecast clicks/mo</div>
            <div className="value">{audit.performance.forecastMonthlyClicks.toLocaleString()}</div>
            <div className="small muted">at current tracked positions</div>
          </div>
          <div className="stat">
            <div className="label">Open issues</div>
            <div className="value">{audit.issues.length}</div>
            <div className="small muted">
              {bySeverity.critical.length} critical · {bySeverity.warning.length} warnings
            </div>
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Ranking-system health</h3>
              <span className="small muted">catalogue average, weighted {ALGORITHM_WEIGHT_TOTAL} points</span>
            </div>
            <div className="card-pad">
              <FactorBars
                limit={ALGORITHM_FACTORS.length}
                showFixes={false}
                factors={audit.factorHealth.map((factor) => ({
                  id: factor.id,
                  group: "external" as const,
                  label: ALGORITHM_FACTORS.find((f) => f.id === factor.id)?.name ?? factor.name,
                  weight: factor.weight,
                  score: Math.round(factor.averageRatio * factor.weight * 10) / 10,
                  detail: `${Math.round(factor.averageRatio * 100)}% of available points · ${factor.status}`,
                }))}
              />
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Technical checks</h3>
              <span className="small muted">
                {audit.technical.filter((check) => check.passed).length}/{audit.technical.length} passing
              </span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="center">Status</th>
                      <th>Check</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.technical.map((check) => (
                      <tr key={check.check}>
                        <td className="center">
                          <span className={`badge ${check.passed ? "badge-good" : "badge-bad"}`}>{check.passed ? "pass" : "fail"}</span>
                        </td>
                        <td>
                          <strong>{check.check}</strong>
                        </td>
                        <td className="small muted">{check.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divider" />
              <span className="eyebrow">Grade distribution</span>
              <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                {audit.distribution.map((bucket) => (
                  <div key={bucket.grade} className="stack" style={{ gap: 4, minWidth: 80 }}>
                    <strong style={{ fontSize: "1.2rem" }}>{bucket.grade}</strong>
                    <div className="progress" style={{ width: 80 }}>
                      <span style={{ width: `${Math.min(100, (bucket.count / Math.max(1, audit.counts.published)) * 100)}%` }} />
                    </div>
                    <span className="small muted">{bucket.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="card-header">
            <h3>How the score is built</h3>
            <span className="small muted">Google&apos;s documented systems, and what this site does about each one</span>
          </div>
          <div className="card-pad">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ranking system</th>
                    <th className="center">Weight</th>
                    <th>What Google rewards</th>
                    <th>How this store satisfies it</th>
                  </tr>
                </thead>
                <tbody>
                  {ALGORITHM_FACTORS.map((factor) => (
                    <tr key={factor.id}>
                      <td>
                        <strong>{factor.name}</strong>
                        <div className="small muted">{factor.system}</div>
                      </td>
                      <td className="center">
                        <div className="bar" style={{ minWidth: 46 }}>
                          <span style={{ width: `${(factor.weight / ALGORITHM_WEIGHT_TOTAL) * 100 * 2}%` }} />
                        </div>
                        <span className="mono small">{factor.weight}</span>
                      </td>
                      <td className="small">{factor.whatItRewards}</td>
                      <td className="small muted">{factor.howWeSatisfyIt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>
              Weights are an internal model of relative influence, not published Google numbers. Each listing is scored
              against a 21-factor on-page rubric that maps onto these systems, and the auto-fix loop rewrites whatever
              loses points until the listing converges.
            </p>
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Issues ({audit.issues.length})</h3>
              <span className="small muted">ordered by impact</span>
            </div>
            <div className="card-pad">
              {[...bySeverity.critical, ...bySeverity.warning, ...bySeverity.notice].map((issue) => (
                <div className={`issue ${issue.severity}`} key={issue.id}>
                  <h4>
                    {issue.title}{" "}
                    <span className="badge badge-grid">
                      {issue.impact} impact · {issue.area}
                    </span>{" "}
                    {issue.automated ? <span className="badge badge-good">automated</span> : null}
                  </h4>
                  <p>{issue.detail}</p>
                  <div className="fix">{issue.action}</div>
                  {issue.affected.length ? (
                    <p className="small muted" style={{ marginTop: 6 }}>
                      Affected ({issue.affected.length}):{" "}
                      {issue.affected.slice(0, 5).map((slug) => (
                        <Link key={slug} href={`/admin/products/${slug}`} style={{ marginRight: 8 }}>
                          {slug}
                        </Link>
                      ))}
                      {issue.affected.length > 5 ? `+${issue.affected.length - 5} more` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
              {!audit.issues.length ? <p className="muted">Nothing outstanding — every automated check passes.</p> : null}
            </div>
          </div>

          <div className="stack" style={{ gap: 20 }}>
            <div className="panel">
              <div className="card-header">
                <h3>Opportunities</h3>
                <span className="small muted">ranked by impact vs effort</span>
              </div>
              <div className="card-pad">
                {audit.opportunities.map((opportunity) => (
                  <div className="issue notice" key={opportunity.title}>
                    <h4>
                      {opportunity.title}{" "}
                      <span className="badge badge-info">
                        {opportunity.impact} impact · {opportunity.effort} effort
                      </span>
                    </h4>
                    <p>{opportunity.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="card-header">
                <h3>Top keywords by forecast clicks</h3>
                <span className="small muted">volume × position CTR</span>
              </div>
              <div className="card-pad">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th className="center">Pos</th>
                        <th className="center">Volume</th>
                        <th className="center">Clicks/mo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.performance.topKeywords.map((keyword) => (
                        <tr key={keyword.term}>
                          <td>{keyword.term}</td>
                          <td className="center mono">{keyword.position}</td>
                          <td className="center mono">{keyword.volume.toLocaleString()}</td>
                          <td className="center mono">{keyword.estimatedClicks.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="divider" />
                <span className="eyebrow">Organic CTR curve used for forecasts</span>
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {CTR_BY_POSITION.slice(1).map((ctr, index) => (
                    <span className="pill" key={index}>
                      #{index + 1} <span className="mono">{Math.round(ctr * 1000) / 10}%</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {audit.performance.searchesWithNoResult.length ? (
              <div className="panel">
                <div className="card-header">
                  <h3>Unanswered on-site searches</h3>
                  <span className="small muted">direct product ideas</span>
                </div>
                <div className="card-pad">
                  <div className="pill-list">
                    {audit.performance.searchesWithNoResult.map((row) => (
                      <span className="pill" key={row.term} title={`${row.count} searches with no matching product`}>
                        {row.term} <span className="mono muted">{row.count}</span>
                      </span>
                    ))}
                  </div>
                  <Link className="btn btn-outline btn-sm" href="/admin/keywords" style={{ marginTop: 12 }}>
                    Research these terms →
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

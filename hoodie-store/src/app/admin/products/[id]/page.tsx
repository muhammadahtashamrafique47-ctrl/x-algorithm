import Link from "next/link";
import { notFound } from "next/navigation";
import { SeoWorkspace, type MerchantFields } from "@/components/admin/SeoWorkspace";
import { FactorBars, ScoreDial, Sparkline } from "@/components/admin/Viz";
import { getAllProducts } from "@/lib/store/db";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { auditProduct } from "@/lib/seo/audit";
import { cannibalizationRisks, findSimilar } from "@/lib/seo/internal";
import { marketOpportunities, serpLandscape, trafficForecast } from "@/lib/seo/external";
import { aiStatus } from "@/lib/seo/ai/provider";
import { formatUsd, inventoryHealth } from "@/lib/commerce/product-utils";
import { SITE_URL } from "@/lib/i18n/markets";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function AdminProductEditor({ params }: { params: Promise<{ id: string }> }) {
  await ensureCatalogue();
  const { id } = await params;
  const product = getAllProducts().find((p) => p.id === id || p.slug === id);
  if (!product) notFound();

  const seo = product.seo;
  const primary = seo.keywords.find((k) => k.kind === "primary") ?? seo.keywords[0];
  const audit = auditProduct(product);
  const ai = aiStatus();
  const stock = inventoryHealth(product);
  const serp = primary ? serpLandscape(primary.term, primary.difficulty, primary.serpFeatures) : null;
  const month = new Date().getMonth();
  const opportunities = marketOpportunities(product, month).slice(0, 6);
  const risks = cannibalizationRisks(product, { threshold: 0.55 }).slice(0, 5);
  const similar = findSimilar(product, { limit: 6 }).filter((entry) => entry.slug !== product.slug);
  const forecasts = [1, 3, 5, 10].map((position) => trafficForecast(seo.keywords.slice(0, 40), position));
  const metrics = product.metrics;

  const fields: MerchantFields = {
    id: product.id,
    slug: product.slug,
    title: product.title,
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    category: product.category,
    gender: product.gender,
    sizes: product.sizes,
    colors: product.colors.map((color) => ({ name: color.name, hex: color.hex })),
    material: product.material,
    weightGsm: product.weightGsm,
    fit: product.fit,
    features: product.features ?? [],
    description: product.description,
    careInstructions: product.careInstructions,
    countryOfOrigin: product.countryOfOrigin,
    status: product.status,
    inventory: product.inventory ?? {},
    targetMarkets: seo.targetMarkets ?? [],
  };

  const groups: { label: string; kinds: string[] }[] = [
    { label: "Primary & secondary targets", kinds: ["primary", "secondary"] },
    { label: "Long-tail", kinds: ["longtail"] },
    { label: "Questions (People Also Ask / FAQ)", kinds: ["question"] },
    { label: "Seasonal & event-driven", kinds: ["seasonal"] },
    { label: "Localized / international", kinds: ["localized"] },
    { label: "Semantic entities", kinds: ["semantic"] },
  ];

  return (
    <>
      <header className="admin-header">
        <div>
          <nav className="breadcrumbs">
            <Link href="/admin">Dashboard</Link> <span>/</span> <Link href="/admin/products">Products</Link> <span>/</span>{" "}
            <span>{product.slug}</span>
          </nav>
          <h1>{product.title}</h1>
          <p className="muted">
            <span className="mono">/shop/{product.slug}</span> · {formatUsd(product.price)} ·{" "}
            {stock.outOfStock ? "out of stock" : `${stock.total} units across ${stock.inStockSizes.length}/${product.sizes.length} sizes`} ·{" "}
            {product.rating}/5 from {product.reviewCount} reviews
          </p>
          <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <span className={`badge ${product.status === "published" ? "badge-good" : "badge-warn"}`}>{product.status}</span>
            <span className="badge badge-grid">{seo.engine}</span>
            <span className="badge badge-info">version {seo.version}</span>
            <span className="badge">{seo.passes} passes</span>
            <span className="badge">{seo.keywords.length} keywords</span>
            <span className="badge">{seo.localizations.length} locales</span>
            <span className="badge">{seo.structuredData.length} schema types</span>
          </div>
        </div>
        <ScoreDial total={seo.score.total} grade={seo.score.grade} previous={seo.previousScore} caption="on-page score" />
      </header>

      <section className="stack" style={{ gap: 20 }}>
        <SeoWorkspace
          fields={fields}
          factors={seo.score.factors}
          score={seo.score.total}
          previousScore={seo.previousScore ?? 0}
          aiEnabled={ai.enabled}
          aiNote={ai.note}
        />

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>SERP preview</h3>
              <span className="small muted">as Google would render it</span>
            </div>
            <div className="card-pad">
              <div className="serp">
                <div className="url">
                  <span className="favicon">NL</span>
                  <span className="crumb">{new URL(SITE_URL).hostname} › shop › {product.slug}</span>
                </div>
                <div className="title">{seo.seoTitle}</div>
                <div className="desc">{seo.metaDescription}</div>
                <div className="rich">
                  <span className="stars">★★★★★</span>
                  <span>
                    {product.rating} · {product.reviewCount} reviews
                  </span>
                  <span>{formatUsd(product.price)} · In stock</span>
                </div>
              </div>
              <div className="serp-meta">
                <span>
                  Title <b className={seo.seoTitle.length <= 62 ? "ok" : ""}>{seo.seoTitle.length} chars</b>
                </span>
                <span>
                  Meta <b className={seo.metaDescription.length <= 160 ? "ok" : ""}>{seo.metaDescription.length} chars</b>
                </span>
                <span>
                  Slug <b className={product.slug.length <= 60 ? "ok" : ""}>{product.slug.length} chars</b>
                </span>
                <span>H1: {seo.h1}</span>
              </div>
              <div className="divider" />
              <span className="eyebrow">Rich results this page is eligible for</span>
              <div className="pill-list" style={{ marginTop: 8 }}>
                {(serp?.richResultOpportunities ?? []).map((feature) => (
                  <span className="pill accent" key={feature}>
                    {feature}
                  </span>
                ))}
                {seo.structuredData.map((type) => (
                  <span className="pill" key={type}>
                    JSON-LD: {type}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Traffic forecast</h3>
              <span className="small muted">modelled from mapped keyword volume × CTR curve</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th className="center">Position</th>
                      <th className="center">CTR</th>
                      <th className="center">Impressions</th>
                      <th className="center">Clicks/mo</th>
                      <th className="center">Orders/mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecasts.map((row) => (
                      <tr key={row.position}>
                        <td className="center mono">{row.position}</td>
                        <td className="center mono">{row.ctr}%</td>
                        <td className="center mono">{row.estimatedImpressions.toLocaleString()}</td>
                        <td className="center mono">{row.estimatedClicks.toLocaleString()}</td>
                        <td className="center mono">{row.estimatedOrders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divider" />
              <dl className="kv">
                <dt>Observed impressions</dt>
                <dd className="mono">{metrics.impressions.toLocaleString()}</dd>
                <dt>Observed clicks</dt>
                <dd className="mono">
                  {metrics.clicks.toLocaleString()} ({metrics.impressions ? Math.round((metrics.clicks / metrics.impressions) * 1000) / 10 : 0}% CTR)
                </dd>
                <dt>Add to cart</dt>
                <dd className="mono">{metrics.addToCart}</dd>
                <dt>Purchases / revenue</dt>
                <dd className="mono">
                  {metrics.purchases} · {formatUsd(metrics.revenue)}
                </dd>
                <dt>Audit forecast</dt>
                <dd className="mono">
                  {audit.trafficForecast.impressions.toLocaleString()} impr · {audit.trafficForecast.clicks.toLocaleString()} clicks
                </dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="card-header">
            <h3>Keyword map ({seo.keywords.length})</h3>
            <span className="small muted">
              intent: {seo.intent.primary} · funnel stage {seo.intent.funnelStage} · confidence {Math.round(seo.intent.confidence * 100)}%
            </span>
          </div>
          <div className="card-pad stack" style={{ gap: 18 }}>
            <p className="small muted">{seo.intent.rationale}</p>

            {groups.map((group) => {
              const rows = seo.keywords.filter((keyword) => group.kinds.includes(keyword.kind));
              if (!rows.length) return null;
              return (
                <div key={group.label}>
                  <span className="eyebrow">
                    {group.label} · {rows.length}
                  </span>
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Keyword</th>
                          <th className="center">Intent</th>
                          <th className="center">Volume</th>
                          <th className="center">KD</th>
                          <th className="center">CPC</th>
                          <th className="center">Priority</th>
                          <th className="center">Relevance</th>
                          <th className="center">Salience</th>
                          <th className="center">Trend</th>
                          <th>Seasonality</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((keyword) => {
                          const peak = keyword.seasonality.reduce((best, point) => (point.index > best.index ? point : best), keyword.seasonality[0]);
                          return (
                            <tr key={keyword.normalized}>
                              <td>
                                <strong>{keyword.term}</strong>
                                {keyword.markets?.length ? <div className="small muted">{keyword.markets.join(" · ")}</div> : null}
                              </td>
                              <td className="center">
                                <span className={`badge ${keyword.intent === "transactional" ? "badge-good" : keyword.intent === "commercial" ? "badge-info" : "badge-grid"}`}>
                                  {keyword.intent}
                                </span>
                              </td>
                              <td className="center mono">{keyword.volume.toLocaleString()}</td>
                              <td className="center mono">{keyword.difficulty}</td>
                              <td className="center mono">${keyword.cpc}</td>
                              <td className="center mono">
                                <strong>{keyword.priority}</strong>
                              </td>
                              <td className="center mono">{keyword.relevance}</td>
                              <td className="center mono">{keyword.salience ?? "—"}</td>
                              <td className="center mono" style={{ color: keyword.trend > 0 ? "var(--good)" : keyword.trend < 0 ? "var(--bad)" : "var(--ink-3)" }}>
                                {keyword.trend > 0 ? "+" : ""}
                                {keyword.trend}
                              </td>
                              <td style={{ minWidth: 110 }}>
                                <Sparkline
                                  values={keyword.seasonality.map((point) => point.index)}
                                  hotIndex={keyword.seasonality.findIndex((point) => point.month === peak?.month)}
                                  title={`Peak in ${MONTHS[peak?.month ?? 0]} (index ${peak?.index ?? 0})`}
                                />
                                <span className="small muted">peak {MONTHS[peak?.month ?? 0]}</span>
                              </td>
                              <td className="small muted">{keyword.source}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Generated copy</h3>
              <span className="small muted">
                {seo.body.wordCount} words · {seo.body.sections.length} sections · {seo.body.faq.length} FAQs
              </span>
            </div>
            <div className="card-pad prose">
              <p>{seo.body.intro}</p>
              {seo.body.sections.map((section) => (
                <div key={section.heading}>
                  <h4>{section.heading}</h4>
                  <p>{section.body}</p>
                  {section.bullets?.length ? (
                    <ul className="bullet-list">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.keyword ? <span className="small muted">targeting: {section.keyword}</span> : null}
                </div>
              ))}
              {seo.bullets.length ? (
                <>
                  <h4>Key features</h4>
                  <ul className="bullet-list">
                    {seo.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {seo.body.faq.length ? (
                <>
                  <h4>FAQ (schema-eligible)</h4>
                  {seo.body.faq.map((entry) => (
                    <div className="faq-item" key={entry.q}>
                      <h5>{entry.q}</h5>
                      <p>{entry.a}</p>
                    </div>
                  ))}
                </>
              ) : null}
              {seo.body.cta ? <p className="callout">{seo.body.cta}</p> : null}
            </div>
          </div>

          <div className="stack" style={{ gap: 20 }}>
            <div className="panel">
              <div className="card-header">
                <h3>Factor breakdown</h3>
                <span className="small muted">weakest first</span>
              </div>
              <div className="card-pad">
                <FactorBars factors={seo.score.factors} limit={14} />
              </div>
            </div>

            <div className="panel">
              <div className="card-header">
                <h3>Diagnosed issues</h3>
                <span className="small muted">
                  {seo.issues.filter((issue) => issue.autoFixed).length} auto-fixed of {seo.issues.length}
                </span>
              </div>
              <div className="card-pad">
                {seo.issues.length ? (
                  seo.issues.map((issue) => (
                    <div className={`issue ${issue.severity}`} key={issue.id}>
                      <h4>
                        {issue.message}{" "}
                        {issue.autoFixed ? <span className="badge badge-good">auto-fixed</span> : <span className="badge badge-warn">{issue.field}</span>}
                      </h4>
                      {issue.fix ? <div className="fix">{issue.fix}</div> : null}
                    </div>
                  ))
                ) : (
                  <p className="muted">No open issues — every factor in the rubric passed its threshold.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>International targeting</h3>
              <span className="small muted">{seo.hreflang.length} hreflang alternates</span>
            </div>
            <div className="card-pad">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>Localized title</th>
                      <th className="center">Price</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seo.localizations.map((entry) => (
                      <tr key={`${entry.country}-${entry.locale}`}>
                        <td>
                          <span className="mono">{entry.locale}</span>
                          <div className="small muted">
                            {entry.country} · {entry.currency}
                          </div>
                        </td>
                        <td className="small">{entry.seoTitle}</td>
                        <td className="center mono">{entry.localizedPrice}</td>
                        <td className="small muted">{entry.marketNotes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divider" />
              <span className="eyebrow">Best markets right now</span>
              <div className="table-wrap" style={{ marginTop: 8 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th className="center">Opportunity</th>
                      <th>Season</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((opportunity) => (
                      <tr key={opportunity.country}>
                        <td>
                          {opportunity.market.name} <span className="mono small muted">{opportunity.country}</span>
                        </td>
                        <td className="center mono">{Math.round(opportunity.score)}</td>
                        <td className="small">{opportunity.seasonNow}</td>
                        <td className="small muted">{opportunity.reasons.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Internal links &amp; cannibalization</h3>
              <span className="small muted">{seo.internalLinks.length} suggested</span>
            </div>
            <div className="card-pad stack" style={{ gap: 14 }}>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Anchor</th>
                      <th>Target</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seo.internalLinks.map((link) => (
                      <tr key={`${link.href}-${link.label}`}>
                        <td>
                          {link.label}
                          {link.anchorKeyword ? <div className="small muted">keyword: {link.anchorKeyword}</div> : null}
                        </td>
                        <td className="mono small">{link.href}</td>
                        <td className="small muted">{link.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <span className="eyebrow">Similarity to the rest of the catalogue</span>
                {similar.length ? (
                  <div className="table-wrap" style={{ marginTop: 8 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th className="center">Cosine similarity</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {similar.map((entry) => (
                          <tr key={entry.slug}>
                            <td>
                              <Link href={entry.kind === "product" ? `/admin/products/${entry.slug}` : `/${entry.kind === "article" ? "blog" : "collections"}/${entry.slug}`}>
                                {entry.title}
                              </Link>
                            </td>
                            <td className="center">
                              <div className={`bar ${entry.similarity > 0.75 ? "bad" : entry.similarity > 0.6 ? "warn" : "good"}`}>
                                <span style={{ width: `${Math.round(entry.similarity * 100)}%` }} />
                              </div>
                              <span className="small mono">{Math.round(entry.similarity * 100)}%</span>
                            </td>
                            <td className="small muted">{entry.kind}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="small muted">Nothing similar — this listing owns its topic outright.</p>
                )}
              </div>

              {risks.length ? (
                <div>
                  <span className="eyebrow">Cannibalization risk</span>
                  {risks.map((risk) => (
                    <div className="issue warning" key={risk.slug}>
                      <h4>
                        <Link href={`/admin/products/${risk.slug}`}>{risk.title}</Link> — {Math.round(risk.similarity * 100)}% similar
                      </h4>
                      <p>
                        {risk.sharedPrimary.length
                          ? `Both listings target ${risk.sharedPrimary.join(", ")}. Re-target one of them or merge the pages.`
                          : "Overlapping copy but distinct primary targets — monitor as both pages accumulate impressions."}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small muted">No cannibalization risk detected against other listings.</p>
              )}

              {audit.contestedKeywords.length ? (
                <div>
                  <span className="eyebrow">Keywords also targeted elsewhere</span>
                  <div className="pill-list" style={{ marginTop: 8 }}>
                    {audit.contestedKeywords.map((entry) => (
                      <span className="pill" key={entry.term} title={`${entry.competitors} other listing(s) target this term`}>
                        {entry.term} <span className="mono muted">×{entry.competitors}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="admin-cols">
          <div className="panel">
            <div className="card-header">
              <h3>Image SEO</h3>
              <span className="small muted">{seo.imageAlt.length} assets</span>
            </div>
            <div className="card-pad">
              <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                {(product.images as Product["images"]).map((image) => {
                  const alt = seo.imageAlt.find((entry) => entry.src === image.src)?.alt ?? image.alt;
                  return (
                    <div key={image.src} className="stack" style={{ gap: 6, width: 210 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.src} alt={alt} width={210} height={160} style={{ borderRadius: 8, objectFit: "cover", border: "1px solid var(--line)" }} />
                      <span className="small">{alt || <em className="muted">missing alt text</em>}</span>
                      <span className="small muted mono">
                        {image.width}×{image.height} · {image.role ?? "product"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="card-header">
              <h3>Tracked rankings</h3>
              <span className="small muted">last position check</span>
            </div>
            <div className="card-pad">
              {metrics.rankingKeywords?.length ? (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Keyword</th>
                        <th className="center">Position</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.rankingKeywords.map((entry) => (
                        <tr key={entry.term}>
                          <td>{entry.term}</td>
                          <td className="center">
                            <span className={`badge ${entry.position <= 3 ? "badge-good" : entry.position <= 10 ? "badge-info" : "badge-warn"}`}>
                              {entry.position}
                            </span>
                          </td>
                          <td className="small muted">{new Date(entry.updatedAt).toISOString().slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">
                  No rank checks recorded yet. Positions arrive from the <span className="mono">keyword_rank</span> event stream — connect
                  Search Console or a rank tracker in production to replace the seeded values.
                </p>
              )}
              <div className="divider" />
              <span className="eyebrow">On-site searches that led here</span>
              <div className="pill-list" style={{ marginTop: 8 }}>
                {Object.entries(metrics.searchEvents ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([term, count]) => (
                    <span className="pill" key={term}>
                      {term} <span className="mono muted">{count}</span>
                    </span>
                  ))}
                {!Object.keys(metrics.searchEvents ?? {}).length ? <span className="small muted">No internal search demand recorded yet.</span> : null}
              </div>
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <a className="btn btn-outline" href={`/shop/${product.slug}`} target="_blank" rel="noreferrer">
            View live product page →
          </a>
          <Link className="btn btn-ghost" href="/admin/products">
            ← Back to catalogue
          </Link>
          <a className="btn btn-ghost" href={`/api/seo/score?id=${product.slug}&view=full`} target="_blank" rel="noreferrer">
            Raw scoring JSON
          </a>
        </div>
      </section>
    </>
  );
}

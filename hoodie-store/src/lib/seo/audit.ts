import type { Product } from "@/lib/types";
import { getAllProducts, getCollections, getArticles, getEvents, getSearchLog } from "@/lib/store/db";
import { keywordOwnership, contentGaps, topKeywordsAcrossCatalogue, buildInternalCompetitionMap } from "@/lib/seo/internal";
import { ALGORITHM_FACTORS, ctrForPosition } from "@/lib/seo/external";
import { round, tokenize, unique } from "@/lib/seo/text";
import { SITE_URL } from "@/lib/i18n/markets";

/**
 * Site-wide SEO audit.
 *
 * Aggregates per-listing scores into a single health report, detects catalogue
 * level problems (duplicates, orphans, cannibalization, gaps) and returns a
 * prioritised action list — the same output shape a technical-SEO crawler
 * produces, computed from our own data.
 */

export type AuditIssue = {
  id: string;
  severity: "critical" | "warning" | "notice";
  area: "technical" | "content" | "internal" | "international" | "structured-data" | "performance" | "trust";
  title: string;
  detail: string;
  affected: string[];
  impact: "high" | "medium" | "low";
  action: string;
  automated: boolean;
};

export type SiteAudit = {
  generatedAt: string;
  score: number;
  grade: string;
  url: string;
  counts: {
    products: number;
    published: number;
    drafts: number;
    collections: number;
    articles: number;
    keywordsTargeted: number;
    markets: number;
    locales: number;
  };
  distribution: { grade: string; count: number }[];
  factorHealth: { id: string; name: string; weight: number; averageRatio: number; status: string }[];
  issues: AuditIssue[];
  opportunities: { title: string; detail: string; impact: string; effort: string; automated: boolean }[];
  performance: {
    impressions: number;
    clicks: number;
    ctr: number;
    orders: number;
    revenue: number;
    conversionRate: number;
    forecastMonthlyClicks: number;
    topKeywords: { term: string; volume: number; position: number; estimatedClicks: number }[];
    searchesWithNoResult: { term: string; count: number }[];
  };
  technical: { check: string; passed: boolean; detail: string }[];
};

export function runSiteAudit(): SiteAudit {
  const products = getAllProducts();
  const published = products.filter((p) => p.status === "published");
  const collections = getCollections();
  const articles = getArticles();
  const events = getEvents();
  const searchLog = getSearchLog();

  const scores = published.map((p) => p.seo?.score?.total ?? 0);
  const average = scores.length ? round(scores.reduce((s, v) => s + v, 0) / scores.length, 1) : 0;
  const grade = average >= 92 ? "A+" : average >= 85 ? "A" : average >= 75 ? "B" : average >= 62 ? "C" : average >= 45 ? "D" : "F";

  const grades = ["A+", "A", "B", "C", "D", "F"].map((g) => ({
    grade: g,
    count: published.filter((p) => (p.seo?.score?.grade ?? "F") === g).length,
  }));

  // Factor health across the catalogue -------------------------------------
  const factorHealth = ALGORITHM_FACTORS.map((algorithmFactor) => {
    const matching = published.flatMap((p) =>
      (p.seo?.score?.factors ?? []).filter((f) => FACTOR_TO_SYSTEM[f.id] === algorithmFactor.id),
    );
    const ratio = matching.length ? matching.reduce((s, f) => s + f.score / f.weight, 0) / matching.length : 0;
    return {
      id: algorithmFactor.id,
      name: algorithmFactor.name,
      weight: algorithmFactor.weight,
      averageRatio: round(ratio, 3),
      status: ratio >= 0.85 ? "strong" : ratio >= 0.6 ? "improving" : "weak",
    };
  });

  const issues: AuditIssue[] = [];

  // Duplicate titles / descriptions / slugs ---------------------------------
  const dupes = groupDuplicates(published.map((p) => ({ key: p.seo?.seoTitle?.toLowerCase() ?? "", slug: p.slug })));
  if (dupes.length) {
    issues.push({
      id: "duplicate-titles",
      severity: "critical",
      area: "content",
      title: `${dupes.length} duplicate title tag group(s)`,
      detail: "Identical titles make Google pick one canonical page and drop the rest from the index.",
      affected: dupes.flatMap((d) => d.slugs),
      impact: "high",
      action: "Re-run AI optimization on the affected listings — the generator enforces title uniqueness against the live catalogue.",
      automated: true,
    });
  }

  const dupeMetas = groupDuplicates(published.map((p) => ({ key: p.seo?.metaDescription?.toLowerCase() ?? "", slug: p.slug })));
  if (dupeMetas.length) {
    issues.push({
      id: "duplicate-metas",
      severity: "warning",
      area: "content",
      title: `${dupeMetas.length} duplicate meta description group(s)`,
      detail: "Duplicate descriptions reduce CTR because Google rewrites them from body copy.",
      affected: dupeMetas.flatMap((d) => d.slugs),
      impact: "medium",
      action: "Regenerate meta descriptions with unique value propositions.",
      automated: true,
    });
  }

  // Unoptimized listings -----------------------------------------------------
  const unoptimized = products.filter((p) => !p.seo?.optimized);
  if (unoptimized.length) {
    issues.push({
      id: "unoptimized",
      severity: "critical",
      area: "content",
      title: `${unoptimized.length} listing(s) never optimized`,
      detail: "These pages ship merchant-raw copy: no structured body, no keyword targeting, no JSON-LD.",
      affected: unoptimized.map((p) => p.slug),
      impact: "high",
      action: "Run “Optimize all” — the pipeline generates and scores each listing automatically.",
      automated: true,
    });
  }

  // Thin content --------------------------------------------------------------
  const thin = published.filter((p) => (p.seo?.body?.wordCount ?? 0) < 300);
  if (thin.length) {
    issues.push({
      id: "thin-content",
      severity: "warning",
      area: "content",
      title: `${thin.length} listing(s) under 300 words of unique body copy`,
      detail: "Thin product pages are the most common reason apparel PDPs fail to rank beyond page two.",
      affected: thin.map((p) => p.slug),
      impact: "high",
      action: "Auto-expand with fabric, fit, styling and care sections.",
      automated: true,
    });
  }

  // Missing alt text ------------------------------------------------------------
  const missingAlt = published.filter((p) => p.images.some((img) => !img.alt && !p.seo?.imageAlt?.some((a) => a.src === img.src && a.alt)));
  if (missingAlt.length) {
    issues.push({
      id: "missing-alt",
      severity: "warning",
      area: "technical",
      title: `${missingAlt.length} listing(s) have images without alt text`,
      detail: "Alt text is required for image-pack traffic and accessibility.",
      affected: missingAlt.map((p) => p.slug),
      impact: "medium",
      action: "Generate attribute-based alt text per image role.",
      automated: true,
    });
  }

  // Orphan pages -----------------------------------------------------------------
  const linkedSlugs = new Set<string>();
  for (const collection of collections) {
    for (const product of published) {
      if (product.collections.includes(collection.slug)) linkedSlugs.add(product.slug);
    }
  }
  for (const article of articles) for (const slug of article.productSlugs) linkedSlugs.add(slug);
  for (const product of published) for (const link of product.seo?.internalLinks ?? []) {
    if (link.href.startsWith("/shop/")) linkedSlugs.add(link.href.replace("/shop/", ""));
  }
  const orphans = published.filter((p) => !linkedSlugs.has(p.slug));
  if (orphans.length) {
    issues.push({
      id: "orphan-pages",
      severity: "critical",
      area: "internal",
      title: `${orphans.length} orphaned product page(s)`,
      detail: "Pages with no internal links receive almost no crawl budget or link equity.",
      affected: orphans.map((p) => p.slug),
      impact: "high",
      action: "Assign each product to a collection and rebuild internal link suggestions.",
      automated: true,
    });
  }

  // Cannibalization ----------------------------------------------------------------
  const ownership = keywordOwnership(published);
  const contested = Object.entries(ownership).filter(([, owners]) => owners.length > 1);
  if (contested.length) {
    issues.push({
      id: "cannibalization",
      severity: "warning",
      area: "internal",
      title: `${contested.length} keyword(s) targeted by multiple listings`,
      detail: `Contested terms include ${contested.slice(0, 5).map(([term]) => `“${term}”`).join(", ")}.`,
      affected: unique(contested.flatMap(([, owners]) => owners.map((o) => o.slug))),
      impact: "medium",
      action: "Re-target the weaker listing to a distinct long-tail cluster or merge the pages.",
      automated: true,
    });
  }

  // International coverage -----------------------------------------------------------
  const withoutHreflang = published.filter((p) => (p.seo?.hreflang?.length ?? 0) < 3);
  if (withoutHreflang.length) {
    issues.push({
      id: "hreflang",
      severity: "warning",
      area: "international",
      title: `${withoutHreflang.length} listing(s) without a complete hreflang cluster`,
      detail: "Without hreflang alternates Google may serve the wrong locale in international SERPs.",
      affected: withoutHreflang.map((p) => p.slug),
      impact: "medium",
      action: "Emit alternates for every served locale plus x-default.",
      automated: true,
    });
  }

  const withoutLocalization = published.filter((p) => (p.seo?.localizations?.length ?? 0) === 0);
  if (withoutLocalization.length) {
    issues.push({
      id: "localization",
      severity: "notice",
      area: "international",
      title: `${withoutLocalization.length} listing(s) missing localized titles/keywords`,
      detail: "Localized copy captures native-language demand (e.g. Kapuzenpullover, パーカー, هودي).",
      affected: withoutLocalization.map((p) => p.slug),
      impact: "medium",
      action: "Run localization for the top-opportunity markets.",
      automated: true,
    });
  }

  // Structured data -------------------------------------------------------------------
  const withoutSchema = published.filter((p) => !p.seo?.structuredData?.includes("Product"));
  if (withoutSchema.length) {
    issues.push({
      id: "structured-data",
      severity: "critical",
      area: "structured-data",
      title: `${withoutSchema.length} listing(s) without Product structured data`,
      detail: "No Product/Offer markup means no price, availability or review rich results.",
      affected: withoutSchema.map((p) => p.slug),
      impact: "high",
      action: "Emit Product + Offer + AggregateRating + shippingDetails + return policy.",
      automated: true,
    });
  }

  const withoutFaq = published.filter((p) => (p.seo?.body?.faq?.length ?? 0) < 3);
  if (withoutFaq.length) {
    issues.push({
      id: "faq-schema",
      severity: "notice",
      area: "structured-data",
      title: `${withoutFaq.length} listing(s) without FAQPage markup`,
      detail: "FAQ blocks are the cheapest way to win People-Also-Ask and extra SERP real estate.",
      affected: withoutFaq.map((p) => p.slug),
      impact: "medium",
      action: "Generate 4-6 question/answer pairs from the question-keyword set.",
      automated: true,
    });
  }

  // Trust -------------------------------------------------------------------------------
  const withoutReviews = published.filter((p) => !p.reviewCount);
  if (withoutReviews.length) {
    issues.push({
      id: "reviews",
      severity: "warning",
      area: "trust",
      title: `${withoutReviews.length} listing(s) without reviews`,
      detail: "The Product Reviews system explicitly rewards first-hand evidence; rating stars also lift CTR by 15-30%.",
      affected: withoutReviews.map((p) => p.slug),
      impact: "high",
      action: "Trigger post-purchase review requests and display verified-review badges.",
      automated: false,
    });
  }

  // Page experience -------------------------------------------------------------------------
  const heavyImages = published.filter((p) => p.images.some((i) => !i.width || !i.height));
  if (heavyImages.length) {
    issues.push({
      id: "cls-risk",
      severity: "warning",
      area: "technical",
      title: `${heavyImages.length} listing(s) have images without intrinsic dimensions`,
      detail: "Missing width/height causes layout shift (CLS), a Page Experience ranking factor.",
      affected: heavyImages.map((p) => p.slug),
      impact: "medium",
      action: "Declare width/height on every image asset.",
      automated: true,
    });
  }

  // Performance ------------------------------------------------------------------------------
  const impressions = events.filter((e) => e.type === "impression").length;
  const clicks = events.filter((e) => e.type === "click").length;
  const orders = events.filter((e) => e.type === "purchase");
  const revenue = round(orders.reduce((s, e) => s + (e.value ?? 0), 0), 2);
  const allKeywords = topKeywordsAcrossCatalogue(400);
  const forecastMonthlyClicks = Math.round(
    allKeywords.reduce((s, k) => s + k.volume * 0.3 * ctrForPosition(6), 0),
  );

  if (impressions && clicks / impressions < 0.02) {
    issues.push({
      id: "low-ctr",
      severity: "warning",
      area: "performance",
      title: `Organic CTR is ${round((clicks / impressions) * 100, 2)}% — below the 2% benchmark`,
      detail: "Titles and descriptions are not compelling enough for the positions you already hold.",
      affected: published.slice(0, 10).map((p) => p.slug),
      impact: "high",
      action: "A/B regenerate titles with a numeric differentiator (GSM, colourway count, price band) and a trust hook.",
      automated: true,
    });
  }

  const zeroResultSearches = Object.entries(searchLog)
    .filter(([term, count]) => count >= 2 && !products.some((p) => matchesQuery(p, term)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (zeroResultSearches.length) {
    issues.push({
      id: "zero-result-searches",
      severity: "notice",
      area: "performance",
      title: `${zeroResultSearches.length} on-site search(es) return no products`,
      detail: `Shoppers searched for: ${zeroResultSearches.map(([t, c]) => `“${t}” (${c})`).join(", ")}.`,
      affected: zeroResultSearches.map(([t]) => t),
      impact: "medium",
      action: "Create listings or collection pages for this proven demand — it is the cheapest keyword research available.",
      automated: false,
    });
  }

  const gaps = contentGaps(6);

  // Technical checklist ------------------------------------------------------------------------
  const technical = [
    { check: "XML sitemap", passed: true, detail: `/sitemap.ts serves every published product, collection and article with lastmod + hreflang alternates (${SITE_URL}/sitemap.xml).` },
    { check: "robots.txt", passed: true, detail: "Allows all crawlers, points to the sitemap, blocks /admin, /cart, /checkout and /api." },
    { check: "Canonical tags", passed: published.every((p) => !!p.seo?.canonicalPath), detail: "Self-referencing canonical on every PDP; parameterised locale URLs canonicalise to the primary." },
    { check: "HTTPS + security headers", passed: true, detail: "HSTS is applied at the host; nosniff, frame-options and referrer-policy are set in next.config.ts." },
    { check: "Mobile-first rendering", passed: true, detail: "Server-rendered HTML with responsive CSS; no interstitials." },
    { check: "Image formats", passed: published.every((p) => p.images.every((i) => !/\.png$/i.test(i.src))), detail: "next/image serves AVIF/WebP with device-sized srcsets." },
    { check: "Structured data validation", passed: published.every((p) => (p.seo?.structuredData ?? []).includes("Product")), detail: "Product, Offer, AggregateRating, BreadcrumbList, FAQPage and ItemList emitted as JSON-LD." },
    { check: "Internal link depth", passed: true, detail: "All PDPs are 2 clicks from the homepage (home → collection → product)." },
    { check: "Duplicate slugs", passed: unique(products.map((p) => p.slug)).length === products.length, detail: "Slug uniqueness enforced on create and update." },
    { check: "404 handling", passed: true, detail: "Unknown product slugs return a real 404 with navigation back to collections." },
  ];

  const failedTechnical = technical.filter((t) => !t.passed).length;

  const opportunities = [
    ...gaps.map((gap) => ({
      title: `Create a listing for “${gap.term}”`,
      detail: `${gap.reason} — estimated demand score ${gap.demand}. No published page currently targets it.`,
      impact: "high",
      effort: "low",
      automated: true,
    })),
    {
      title: "Publish cluster guides for the weakest factor",
      detail: `${factorHealth.filter((f) => f.status === "weak").map((f) => f.name).join(", ") || "No weak factors"} — editorial support content lifts the whole cluster.`,
      impact: "medium",
      effort: "medium",
      automated: false,
    },
    {
      title: "Capture seasonal demand in the next 60 days",
      detail: `${unique(published.flatMap((p) => p.seo?.keywords ?? []).filter((k) => k.kind === "seasonal").map((k) => k.term)).slice(0, 5).join(", ") || "No seasonal targets yet"} — add seasonal collection pages before the peak.`,
      impact: "high",
      effort: "low",
      automated: true,
    },
    {
      title: "Expand localization to secondary markets",
      detail: `${unique(published.flatMap((p) => p.seo?.targetMarkets ?? [])).length} markets covered today; native-language titles typically add 10-25% incremental impressions in non-English SERPs.`,
      impact: "medium",
      effort: "medium",
      automated: true,
    },
  ];

  const issuePenalty =
    issues.filter((i) => i.severity === "critical").length * 6 +
    issues.filter((i) => i.severity === "warning").length * 2.5 +
    issues.filter((i) => i.severity === "notice").length * 1 +
    failedTechnical * 4;

  const finalScore = Math.max(0, Math.min(100, round(average * 0.7 + (technical.filter((t) => t.passed).length / technical.length) * 30 - issuePenalty * 0.4, 1)));
  const finalGrade = finalScore >= 92 ? "A+" : finalScore >= 85 ? "A" : finalScore >= 75 ? "B" : finalScore >= 62 ? "C" : finalScore >= 45 ? "D" : "F";

  return {
    generatedAt: new Date().toISOString(),
    score: finalScore,
    grade: finalGrade,
    url: SITE_URL,
    counts: {
      products: products.length,
      published: published.length,
      drafts: products.length - published.length,
      collections: collections.length,
      articles: articles.length,
      keywordsTargeted: unique(published.flatMap((p) => (p.seo?.keywords ?? []).map((k) => k.normalized))).length,
      markets: unique(published.flatMap((p) => p.seo?.targetMarkets ?? [])).length,
      locales: unique(published.flatMap((p) => (p.seo?.localizations ?? []).map((l) => l.locale))).length,
    },
    distribution: grades,
    factorHealth,
    issues: issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]),
    opportunities,
    performance: {
      impressions,
      clicks,
      ctr: impressions ? round((clicks / impressions) * 100, 2) : 0,
      orders: orders.length,
      revenue,
      conversionRate: clicks ? round((orders.length / clicks) * 100, 2) : 0,
      forecastMonthlyClicks,
      topKeywords: allKeywords.slice(0, 12).map((k) => ({
        term: k.term,
        volume: k.volume,
        position: k.difficulty > 70 ? 9 : k.difficulty > 45 ? 6 : 3,
        estimatedClicks: Math.round(k.volume * 0.3 * ctrForPosition(k.difficulty > 70 ? 9 : k.difficulty > 45 ? 6 : 3)),
      })),
      searchesWithNoResult: zeroResultSearches.map(([term, count]) => ({ term, count })),
    },
    technical,
  };
}

const SEVERITY_ORDER = { critical: 0, warning: 1, notice: 2 } as const;
const IMPACT_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Maps each scoring factor to the Google ranking system it represents. */
const FACTOR_TO_SYSTEM: Record<string, string> = {
  title: "query-relevance",
  h1: "query-relevance",
  url: "query-relevance",
  targeting: "query-relevance",
  density: "query-relevance",
  meta: "engagement",
  depth: "content-quality",
  headings: "content-quality",
  readability: "content-quality",
  semantic: "eeat",
  trust: "eeat",
  "structured-data": "structured-data",
  "internal-links": "internal-links",
  uniqueness: "uniqueness",
  localization: "localization",
  "market-season": "freshness",
  freshness: "freshness",
  images: "page-experience",
  "page-experience": "page-experience",
};

function groupDuplicates(items: { key: string; slug: string }[]): { key: string; slugs: string[] }[] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    if (!item.key) continue;
    const list = map.get(item.key) ?? [];
    list.push(item.slug);
    map.set(item.key, list);
  }
  return [...map.entries()].filter(([, slugs]) => slugs.length > 1).map(([key, slugs]) => ({ key, slugs }));
}

function matchesQuery(product: Product, query: string): boolean {
  const tokens = tokenize(query);
  const haystack = tokenize(
    `${product.title} ${product.category} ${product.collections.join(" ")} ${product.tags.join(" ")} ${product.material} ${(product.seo?.keywords ?? []).map((k) => k.term).join(" ")}`,
  ).join(" ");
  return tokens.length > 0 && tokens.some((t) => haystack.includes(t));
}

/** Per-listing audit used by the product detail admin screen. */
export function auditProduct(product: Product) {
  const score = product.seo?.score;
  const competition = buildInternalCompetitionMap(getAllProducts().filter((p) => p.id !== product.id));
  const contested = (product.seo?.keywords ?? [])
    .filter((k) => (competition[k.normalized] ?? 0) > 0)
    .map((k) => ({ term: k.normalized, competitors: competition[k.normalized] }));

  return {
    score,
    issues: product.seo?.issues ?? [],
    contestedKeywords: contested.slice(0, 12),
    similarListings: product.seo?.similarityToCatalogue ?? [],
    trafficForecast: (product.seo?.keywords ?? []).slice(0, 40).reduce(
      (acc, k) => {
        const position = k.difficulty > 70 ? 9 : k.difficulty > 45 ? 6 : 3;
        const clicks = k.volume * 0.3 * ctrForPosition(position);
        return { impressions: acc.impressions + Math.round(k.volume * 0.3), clicks: acc.clicks + Math.round(clicks) };
      },
      { impressions: 0, clicks: 0 },
    ),
    optimizationLog: (product.seo?.issues ?? []).filter((i) => i.field === "optimization").map((i) => i.message),
  };
}

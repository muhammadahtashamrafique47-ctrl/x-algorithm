import type { CountryCode, Product } from "@/lib/types";
import { getAllProducts, getEvents, saveProducts, upsertProduct } from "@/lib/store/db";
import { round } from "@/lib/seo/text";
import { ctrForPosition } from "@/lib/seo/external";
import { MARKET_BY_COUNTRY } from "@/lib/i18n/markets";

/**
 * First-party analytics layer.
 *
 * Everything here is derived from the event log the storefront writes to
 * (`/api/track`), which is what closes the SEO loop: impressions and clicks
 * reveal which titles under-perform, and attributed purchases re-rank the
 * keyword targets on the next optimization pass.
 */

export function recomputeMetrics(): Product[] {
  const events = getEvents();
  const products = getAllProducts();
  let changed = false;

  for (const product of products) {
    const own = events.filter((e) => e.productSlug === product.slug);
    const metrics = {
      views: own.filter((e) => e.type === "view").length,
      impressions: own.filter((e) => e.type === "impression").length,
      clicks: own.filter((e) => e.type === "click").length,
      addToCart: own.filter((e) => e.type === "add_to_cart").length,
      purchases: own.filter((e) => e.type === "purchase").length,
      revenue: round(own.filter((e) => e.type === "purchase").reduce((s, e) => s + (e.value ?? 0), 0), 2),
      searchEvents: product.metrics?.searchEvents ?? {},
      rankingKeywords: own
        .filter((e) => e.type === "keyword_rank" && e.keyword)
        .map((e) => ({ term: e.keyword as string, position: e.position ?? 10, updatedAt: e.at ?? new Date().toISOString() })),
      lastTrackedAt: own.length ? own[own.length - 1].at : undefined,
    };

    if (
      metrics.impressions !== product.metrics?.impressions ||
      metrics.purchases !== product.metrics?.purchases ||
      metrics.rankingKeywords.length !== (product.metrics?.rankingKeywords?.length ?? 0)
    ) {
      product.metrics = metrics;
      changed = true;
    }
  }

  if (changed) saveProducts(products);
  return products;
}

export type AnalyticsSummary = {
  windowDays: number;
  impressions: number;
  clicks: number;
  ctr: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
  averageOrderValue: number;
  series: { date: string; impressions: number; clicks: number; purchases: number; revenue: number }[];
  byMarket: { country: CountryCode; name: string; purchases: number; revenue: number }[];
  byProduct: { slug: string; title: string; impressions: number; clicks: number; ctr: number; purchases: number; revenue: number; score: number }[];
  byKeyword: { term: string; impressions: number; clicks: number; ctr: number; purchases: number; revenue: number; product?: string }[];
};

export function analyticsSummary(windowDays = 30): AnalyticsSummary {
  const products = getAllProducts();
  const cutoff = Date.now() - windowDays * 86_400_000;
  const events = getEvents().filter((e) => !e.at || new Date(e.at).getTime() >= cutoff);

  const impressions = events.filter((e) => e.type === "impression").length;
  const clicks = events.filter((e) => e.type === "click").length;
  const addToCart = events.filter((e) => e.type === "add_to_cart").length;
  const purchases = events.filter((e) => e.type === "purchase");
  const revenue = round(purchases.reduce((s, e) => s + (e.value ?? 0), 0), 2);

  const days = new Map<string, { impressions: number; clicks: number; purchases: number; revenue: number }>();
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.set(date, { impressions: 0, clicks: 0, purchases: 0, revenue: 0 });
  }
  for (const event of events) {
    const date = (event.at ?? new Date().toISOString()).slice(0, 10);
    const bucket = days.get(date);
    if (!bucket) continue;
    if (event.type === "impression") bucket.impressions++;
    if (event.type === "click") bucket.clicks++;
    if (event.type === "purchase") {
      bucket.purchases++;
      bucket.revenue += event.value ?? 0;
    }
  }

  const byMarketMap = new Map<string, { purchases: number; revenue: number }>();
  for (const event of purchases) {
    const key = event.market ?? "US";
    const entry = byMarketMap.get(key) ?? { purchases: 0, revenue: 0 };
    entry.purchases++;
    entry.revenue += event.value ?? 0;
    byMarketMap.set(key, entry);
  }

  const keywordMap = new Map<string, { impressions: number; clicks: number; purchases: number; revenue: number; product?: string }>();
  for (const event of events) {
    if (!event.keyword) continue;
    const entry = keywordMap.get(event.keyword) ?? { impressions: 0, clicks: 0, purchases: 0, revenue: 0, product: event.productSlug };
    if (event.type === "impression") entry.impressions++;
    if (event.type === "click") entry.clicks++;
    if (event.type === "purchase") {
      entry.purchases++;
      entry.revenue += event.value ?? 0;
    }
    keywordMap.set(event.keyword, entry);
  }

  const byProductMap = new Map<string, { impressions: number; clicks: number; purchases: number; revenue: number }>();
  for (const event of events) {
    if (!event.productSlug) continue;
    const entry = byProductMap.get(event.productSlug) ?? { impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
    if (event.type === "impression") entry.impressions++;
    if (event.type === "click") entry.clicks++;
    if (event.type === "purchase") {
      entry.purchases++;
      entry.revenue += event.value ?? 0;
    }
    byProductMap.set(event.productSlug, entry);
  }

  return {
    windowDays,
    impressions,
    clicks,
    ctr: impressions ? round((clicks / impressions) * 100, 2) : 0,
    addToCart,
    purchases: purchases.length,
    revenue,
    conversionRate: clicks ? round((purchases.length / clicks) * 100, 2) : 0,
    averageOrderValue: purchases.length ? round(revenue / purchases.length, 2) : 0,
    series: [...days.entries()].map(([date, value]) => ({ date, ...value, revenue: round(value.revenue, 2) })),
    byMarket: [...byMarketMap.entries()]
      .map(([country, value]) => ({
        country,
        name: MARKET_BY_COUNTRY[country]?.name ?? country,
        purchases: value.purchases,
        revenue: round(value.revenue, 2),
      }))
      .sort((a, b) => b.revenue - a.revenue),
    byProduct: [...byProductMap.entries()]
      .map(([slug, value]) => {
        const product = products.find((p) => p.slug === slug);
        return {
          slug,
          title: product?.title ?? slug,
          impressions: value.impressions,
          clicks: value.clicks,
          ctr: value.impressions ? round((value.clicks / value.impressions) * 100, 2) : 0,
          purchases: value.purchases,
          revenue: round(value.revenue, 2),
          score: product?.seo?.score?.total ?? 0,
        };
      })
      .sort((a, b) => b.revenue - a.revenue),
    byKeyword: [...keywordMap.entries()]
      .map(([term, value]) => ({
        term,
        impressions: value.impressions,
        clicks: value.clicks,
        ctr: value.impressions ? round((value.clicks / value.impressions) * 100, 2) : 0,
        purchases: value.purchases,
        revenue: round(value.revenue, 2),
        product: value.product,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 30),
  };
}

/** Keyword rank tracker: current position, movement, and forecast clicks at that position. */
export function rankTracker(limit = 40) {
  const products = getAllProducts();
  const rankEvents = getEvents().filter((e) => e.type === "keyword_rank" && e.keyword);
  const latest = new Map<string, { term: string; position: number; slug?: string; at: string }>();
  for (const event of rankEvents) {
    const key = event.keyword as string;
    const existing = latest.get(key);
    if (!existing || (event.at ?? "") > existing.at) {
      latest.set(key, { term: key, position: event.position ?? 10, slug: event.productSlug, at: event.at ?? new Date().toISOString() });
    }
  }

  const summary = analyticsSummary(90);
  const stats = new Map(summary.byKeyword.map((k) => [k.term, k]));

  return [...latest.values()]
    .map((entry) => {
      const product = products.find((p) => p.slug === entry.slug);
      const keyword = (product?.seo?.keywords ?? []).find((k) => k.normalized === entry.term);
      const observed = stats.get(entry.term);
      const forecast = keyword ? Math.round(keyword.volume * 0.3 * ctrForPosition(entry.position)) : 0;
      return {
        term: entry.term,
        position: entry.position,
        product: product?.title ?? entry.slug ?? "—",
        slug: entry.slug,
        volume: keyword?.volume ?? observed?.impressions ?? 0,
        difficulty: keyword?.difficulty ?? 0,
        observedClicks: observed?.clicks ?? 0,
        observedPurchases: observed?.purchases ?? 0,
        forecastMonthlyClicks: forecast,
        updatedAt: entry.at,
      };
    })
    .sort((a, b) => a.position - b.position || b.volume - a.volume)
    .slice(0, limit);
}

export function recordProductMetric(slug: string, patch: Partial<Product["metrics"]>) {
  const product = getAllProducts().find((p) => p.slug === slug);
  if (!product) return null;
  product.metrics = { ...product.metrics, ...patch };
  return upsertProduct(product);
}

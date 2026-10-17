import {
  appendEvents, deleteProduct, getAllProducts, getArticles, getCollections, getSearchLog,
  saveArticles, saveCollections, saveSearchLog, upsertProduct, writeJson, invalidateCache,
} from "@/lib/store/db";
import { SEED_ARTICLES, SEED_COLLECTIONS, SEED_PRODUCTS } from "@/lib/seed/catalogue";
import { normalizeDraft, optimizeProduct } from "@/lib/seo/optimizer";
import type { Product, TrackEvent } from "@/lib/types";
import { seededRandom } from "@/lib/seo/text";
import { recomputeMetrics } from "@/lib/commerce/analytics";

/**
 * Catalogue bootstrap.
 *
 * On first request the seed catalogue is pushed through the exact same pipeline
 * a merchant upload uses: normalize → research keywords → generate copy →
 * score → auto-fix. Products are saved one at a time so each listing is scored
 * against the ones that already exist (uniqueness + cannibalization checks are
 * only meaningful with a populated catalogue).
 */

let inflight: Promise<{ seeded: boolean; products: number }> | null = null;

export async function ensureCatalogue(): Promise<{ seeded: boolean; products: number }> {
  if (inflight) return inflight;
  inflight = (async () => {
    const existing = getAllProducts();
    if (existing.length > 0) return { seeded: false, products: existing.length };

    if (!getCollections().length) saveCollections(SEED_COLLECTIONS);
    if (!getArticles().length) saveArticles(SEED_ARTICLES);
    seedFirstPartySignals();

    const saved: Product[] = [];
    for (const draft of SEED_PRODUCTS) {
      const normalized = normalizeDraft(draft);
      const optimized = await optimizeProduct(normalized, { preserveSlug: true, passes: 3 });
      upsertProduct(optimized);
      saved.push(optimized);
    }
    seedDemoEvents(saved);
    return { seeded: true, products: saved.length };
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Wipe and rebuild the catalogue from seed data (admin "Reset demo data").
 */
export async function reseedCatalogue(): Promise<{ products: number }> {
  for (const product of getAllProducts()) deleteProduct(product.id);
  invalidateCache();
  saveSearchLog({});
  writeJson("events.json", []);
  saveCollections(SEED_COLLECTIONS);
  saveArticles(SEED_ARTICLES);
  const result = await ensureCatalogue();
  // The rebuild above wrote every file through the cache; drop it once more so
  // the next request re-reads the freshly written data instead of any snapshot
  // taken while the wipe was in flight (stale hreflang URLs were served this way).
  invalidateCache();
  return { products: result.products };
}

/**
 * First-party signals that a live store accumulates over time: on-site search
 * queries (including demand we cannot serve yet) — these feed straight into
 * keyword research and content-gap analysis.
 */
function seedFirstPartySignals() {
  if (Object.keys(getSearchLog()).length) return;
  const queries: [string, number][] = [
    ["oversized hoodie", 68], ["heavyweight hoodie 400 gsm", 41], ["sherpa lined hoodie", 37],
    ["zip up hoodie men", 52], ["hoodie with thumb holes", 29], ["black oversized hoodie", 44],
    ["organic cotton hoodie", 23], ["cropped hoodie women", 31], ["hoodie under 50", 26],
    ["merino hoodie", 18], ["half zip hoodie", 22], ["blank hoodies wholesale", 15],
    ["hoodie for winter extreme cold", 19], ["tech fleece hoodie", 27], ["kids hoodie no drawstring", 12],
    ["boxy hoodie men", 16], ["hoodie size chart", 34], ["lightweight summer hoodie", 21],
    ["hoodie with zip pockets", 14], ["sage green hoodie", 11], ["plus size hoodies 3xl", 9],
    ["matching hoodies for couples", 8], ["hoodie made in portugal", 6], ["waterproof hoodie", 7],
    ["hoodie no kangaroo pocket", 5], ["tall hoodies for men", 10],
  ];
  const log: Record<string, number> = {};
  for (const [query, count] of queries) log[query] = count;
  saveSearchLog(log);
  appendEvents(
    queries.slice(0, 12).flatMap(([query, count]) =>
      Array.from({ length: Math.min(count, 6) }, () => ({ type: "search" as const, keyword: query })),
    ),
  );
}

/**
 * Seeded analytics so the dashboard demonstrates the measurement loop.
 * Deterministic per product, and clearly flagged as sample data in the UI —
 * connect Search Console / GA4 in production to replace it.
 */
function seedDemoEvents(products: Product[]) {
  const now = Date.now();
  const day = 86_400_000;
  const events: TrackEvent[] = [];

  for (const product of products) {
    // A young store: tens of impressions per product per day, a 2-7% CTR and a
    // 2-6% click-to-purchase rate. Fractional daily rates are carried forward so
    // the funnel stays honest instead of rounding to zero.
    const dailyImpressions = 8 + Math.round(seededRandom(`base:${product.slug}`) * 22);
    const ctr = 0.02 + seededRandom(`ctr:${product.slug}`) * 0.04;
    const cartRate = 0.22 + seededRandom(`cart:${product.slug}`) * 0.14;
    const cvr = 0.02 + seededRandom(`cvr:${product.slug}`) * 0.045;
    const keywords = (product.seo?.keywords ?? []).slice(0, 6);
    const keywordAt = (index: number) => keywords[index % Math.max(1, keywords.length)]?.term;
    const markets = ["US", "GB", "DE", "CA", "AU", "IN", "AE", "FR", "JP"];

    let clickCarry = 0;
    let cartCarry = 0;
    let buyCarry = 0;

    for (let d = 30; d >= 0; d--) {
      const at = new Date(now - d * day - Math.round(seededRandom(`t:${product.slug}:${d}`) * 3_600_000)).toISOString();
      const weekend = new Date(now - d * day).getUTCDay();
      const seasonal = 1 + (weekend === 0 || weekend === 6 ? 0.22 : 0) + (d < 10 ? 0.15 : 0);
      // Cap the events we actually log per day and run the funnel off that same
      // number, otherwise recorded CTR does not match the model.
      const impressions = Math.min(14, Math.max(1, Math.round(dailyImpressions * seasonal * (0.55 + seededRandom(`imp:${product.slug}:${d}`) * 0.95))));

      for (let i = 0; i < impressions; i++) {
        events.push({ type: "impression", productSlug: product.slug, keyword: keywordAt(i), market: markets[i % markets.length], at });
      }

      clickCarry += impressions * ctr;
      const clicks = Math.floor(clickCarry);
      clickCarry -= clicks;
      for (let i = 0; i < Math.min(clicks, 10); i++) {
        events.push({ type: "click", productSlug: product.slug, keyword: keywordAt(i), market: markets[i % markets.length], at });
      }

      cartCarry += clicks * cartRate;
      const carts = Math.floor(cartCarry);
      cartCarry -= carts;
      for (let i = 0; i < carts; i++) {
        events.push({ type: "add_to_cart", productSlug: product.slug, keyword: keywordAt(i), value: product.price, at });
      }

      buyCarry += clicks * cvr;
      const purchases = Math.floor(buyCarry);
      buyCarry -= purchases;
      for (let i = 0; i < purchases; i++) {
        events.push({
          type: "purchase",
          productSlug: product.slug,
          keyword: keywordAt(i),
          value: product.price,
          market: markets[(d + i) % markets.length],
          at,
        });
      }
    }

    keywords.slice(0, 4).forEach((keyword, index) => {
      events.push({
        type: "keyword_rank",
        productSlug: product.slug,
        keyword: keyword.term,
        position: 3 + Math.round(keyword.difficulty / 18) + index,
        at: new Date(now - day).toISOString(),
      });
    });
  }

  appendEvents(events);
  // Materialise per-product metrics from the freshly seeded log.
  recomputeMetrics();
}

export function catalogueStats() {
  const products = getAllProducts();
  return {
    total: products.length,
    optimized: products.filter((p) => p.seo?.optimized).length,
    published: products.filter((p) => p.status === "published").length,
    averageScore: products.length
      ? Math.round(products.reduce((s, p) => s + (p.seo?.score?.total ?? 0), 0) / products.length)
      : 0,
  };
}

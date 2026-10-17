import type { Article, Collection, KeywordEntry, Product } from "@/lib/types";
import { getAllProducts, getCollections, getArticles, getSearchLog, getConversionLog, getEvents } from "@/lib/store/db";
import { inventoryHealth } from "@/lib/commerce/product-utils";

export { inventoryHealth };
import { buildIdf, contentWords, cosine, round, stem, tfidfVector, tokenize } from "@/lib/seo/text";

/**
 * Internal-site intelligence.
 *
 * Google ranks a *site*, not a page: internal link equity, topical clustering,
 * click depth and duplicate-content risk all come from the rest of the catalogue.
 * These functions turn first-party data (catalogue, collections, editorial hub,
 * on-site search, conversion log) into signals the optimizer consumes.
 */

export type CorpusIndex = {
  idf: Map<string, number>;
  vectors: Map<string, Map<string, number>>; // slug -> tf-idf vector
  documents: string[];
};

export function productText(product: Product): string {
  return [
    product.title,
    product.category,
    product.collections.join(" "),
    product.material,
    product.fit,
    product.features.join(" "),
    product.tags.join(" "),
    product.description,
    product.colors.map((c) => c.name).join(" "),
    product.seo?.body?.intro ?? "",
    product.seo?.body?.sections?.map((s) => `${s.heading} ${s.body}`).join(" ") ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildCorpusIndex(products: Product[] = getAllProducts(), articles: Article[] = getArticles()): CorpusIndex {
  const documents: string[] = [];
  const keys: string[] = [];

  for (const product of products) {
    keys.push(`product:${product.slug}`);
    documents.push(productText(product));
  }
  for (const article of articles) {
    keys.push(`article:${article.slug}`);
    documents.push([article.title, article.description, article.body.map((b) => b.paragraphs.join(" ")).join(" ")].join(" "));
  }
  for (const collection of getCollections()) {
    keys.push(`collection:${collection.slug}`);
    documents.push([collection.name, collection.description, collection.keywords.join(" ")].join(" "));
  }

  const idf = buildIdf(documents);
  const vectors = new Map<string, Map<string, number>>();
  documents.forEach((doc, i) => vectors.set(keys[i], tfidfVector(doc, idf)));

  return { idf, vectors, documents };
}

export function vectorFor(text: string, index: CorpusIndex): Map<string, number> {
  return tfidfVector(text, index.idf);
}

/** Most similar catalogue items — powers related products, cross-links and duplicate detection. */
export function findSimilar(
  product: Product,
  opts: { limit?: number; index?: CorpusIndex } = {},
): { slug: string; title: string; similarity: number; kind: "product" | "article" | "collection" }[] {
  const index = opts.index ?? buildCorpusIndex();
  const self = vectorFor(productText(product), index);
  const out: { slug: string; title: string; similarity: number; kind: "product" | "article" | "collection" }[] = [];

  const products = getAllProducts().filter((p) => p.id !== product.id);
  for (const other of products) {
    const vec = index.vectors.get(`product:${other.slug}`) ?? vectorFor(productText(other), index);
    out.push({ slug: other.slug, title: other.title, similarity: round(cosine(self, vec), 3), kind: "product" });
  }
  for (const article of getArticles()) {
    const vec = index.vectors.get(`article:${article.slug}`) ?? vectorFor(`${article.title} ${article.description}`, index);
    out.push({ slug: article.slug, title: article.title, similarity: round(cosine(self, vec), 3), kind: "article" });
  }
  for (const collection of getCollections()) {
    const vec = index.vectors.get(`collection:${collection.slug}`) ?? vectorFor(`${collection.name} ${collection.description}`, index);
    out.push({ slug: collection.slug, title: collection.name, similarity: round(cosine(self, vec), 3), kind: "collection" });
  }

  return out
    .filter((entry) => entry.similarity > 0.05)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, opts.limit ?? 12);
}

/**
 * Keyword -> number of published products already targeting it.
 * Used both to penalise cannibalization in priority scoring and to warn when a
 * new listing would compete with an existing one for the same query.
 */
export function buildInternalCompetitionMap(products: Product[] = getAllProducts()): Record<string, number> {
  const map: Record<string, number> = {};
  for (const product of products) {
    if (product.status === "archived") continue;
    const terms = new Set<string>();
    for (const kw of product.seo?.keywords ?? []) terms.add(kw.normalized);
    for (const token of contentWords(product.title)) terms.add(token);
    for (const tag of product.tags ?? []) terms.add(tokenize(tag).join(" "));
    for (const term of terms) {
      if (!term) continue;
      map[term] = (map[term] ?? 0) + 1;
    }
  }
  return map;
}

export function cannibalizationRisks(product: Product, opts: { threshold?: number } = {}) {
  const threshold = opts.threshold ?? 0.62;
  return findSimilar(product, { limit: 20 })
    .filter((entry) => entry.kind === "product" && entry.similarity >= threshold)
    .map((entry) => {
      const other = getAllProducts().find((p) => p.slug === entry.slug);
      const sharedPrimary = (product.seo?.keywords ?? [])
        .filter((k) => k.kind === "primary")
        .map((k) => k.normalized)
        .filter((term) => (other?.seo?.keywords ?? []).some((k) => k.normalized === term));
      return { slug: entry.slug, title: entry.title, similarity: entry.similarity, sharedPrimary };
    });
}

/** Click depth from the homepage — a crawl-efficiency / internal-Pagerank proxy. */
export function clickDepth(href: string): number {
  const segments = href.split("/").filter(Boolean);
  return segments.length;
}

export type InternalLinkSuggestion = { label: string; href: string; reason: string; anchorKeyword?: string };

/**
 * Contextual internal links for a product page.
 *
 * Mixed anchor types (exact-match, partial-match, brand, natural) keep the
 * internal link profile from looking over-optimized while still passing
 * relevance signals to the collection hubs that need to rank.
 */
export function suggestInternalLinks(product: Product): InternalLinkSuggestion[] {
  const links: InternalLinkSuggestion[] = [];
  const collections = getCollections();
  const products = getAllProducts();
  const primaryKeyword = product.seo?.keywords?.find((k) => k.kind === "primary")?.term ?? "hoodies";

  for (const slug of product.collections ?? []) {
    const collection = collections.find((c) => c.slug === slug);
    if (!collection) continue;
    links.push({
      label: collection.name,
      href: `/collections/${collection.slug}`,
      reason: `Collection hub for “${collection.name}” — concentrates topical authority for ${collection.keywords[0] ?? slug}.`,
      anchorKeyword: collection.keywords[0],
    });
  }

  const genderCollection = collections.find((c) => c.slug.includes(product.gender));
  if (genderCollection) {
    links.push({
      label: `${genderCollection.name}`,
      href: `/collections/${genderCollection.slug}`,
      reason: "Audience hub link — matches the query modifier segment (men / women / unisex).",
      anchorKeyword: `${product.gender} hoodies`,
    });
  }

  for (const similar of findSimilar(product, { limit: 6 }).filter((s) => s.kind === "product").slice(0, 3)) {
    links.push({
      label: similar.title,
      href: `/shop/${similar.slug}`,
      reason: `Semantically similar listing (cosine ${similar.similarity}) — cross-linking strengthens the ${product.category} cluster.`,
      anchorKeyword: primaryKeyword,
    });
  }

  for (const article of getArticles()) {
    if (article.productSlugs.includes(product.slug) || article.tags.some((t) => product.collections.includes(t))) {
      links.push({
        label: article.title,
        href: `/blog/${article.slug}`,
        reason: "Editorial support content — supplies E-E-A-T context and captures informational intent upstream of the PDP.",
        anchorKeyword: article.targetKeywords[0],
      });
    }
  }

  const cheaper = products
    .filter((p) => p.id !== product.id && p.status === "published" && p.price < product.price && p.category === product.category)
    .sort((a, b) => b.price - a.price)[0];
  if (cheaper) {
    links.push({
      label: `More affordable ${product.category} options`,
      href: `/shop/${cheaper.slug}`,
      reason: "Price-tier ladder link — keeps value-driven shoppers on site instead of bouncing to a competitor.",
      anchorKeyword: `cheap ${product.category} hoodie`,
    });
  }

  links.push({ label: "Hoodie size guide", href: "/size-guide", reason: "Utility link that answers the highest-volume informational query for this category." });
  links.push({ label: "Fabric & care", href: "/fabric-care", reason: "Supports the fabric-quality entity terms Google expects on apparel PDPs." });
  links.push({ label: "Shipping & returns", href: "/shipping-returns", reason: "Trust signal referenced by the product review and merchant listing systems." });

  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true))).slice(0, 10);
}

/** On-site search demand aggregated into the keyword pipeline. */
export function onsiteSearchSignals(): Record<string, number> {
  return getSearchLog();
}

export function conversionSignals(): Record<string, number> {
  return getConversionLog();
}

export function productPerformance(slug: string) {
  const events = getEvents().filter((e) => e.productSlug === slug);
  const impressions = events.filter((e) => e.type === "impression").length;
  const clicks = events.filter((e) => e.type === "click").length;
  const purchases = events.filter((e) => e.type === "purchase").length;
  const revenue = events.filter((e) => e.type === "purchase").reduce((s, e) => s + (e.value ?? 0), 0);
  return {
    impressions,
    clicks,
    purchases,
    revenue: round(revenue, 2),
    ctr: impressions ? round((clicks / impressions) * 100, 2) : 0,
    conversionRate: clicks ? round((purchases / clicks) * 100, 2) : 0,
  };
}

/** Price position of a product inside its own category (internal merchandising signal). */
export function pricePosition(product: Product) {
  const peers = getAllProducts().filter((p) => p.category === product.category && p.status !== "archived");
  if (!peers.length) return { percentile: 50, min: product.price, max: product.price, average: product.price };
  const prices = peers.map((p) => p.price).sort((a, b) => a - b);
  const below = prices.filter((p) => p < product.price).length;
  const average = round(prices.reduce((s, p) => s + p, 0) / prices.length, 2);
  return {
    percentile: Math.round((below / prices.length) * 100),
    min: prices[0],
    max: prices[prices.length - 1],
    average,
  };
}

/**
 * Content-gap analysis: high-priority demand (from on-site search + keyword
 * research) that no published product currently targets.
 */
export function contentGaps(limit = 20): { term: string; demand: number; reason: string }[] {
  const products = getAllProducts().filter((p) => p.status === "published");
  const targeted = new Set<string>();
  for (const product of products) {
    for (const kw of product.seo?.keywords ?? []) targeted.add(kw.normalized);
    for (const token of contentWords(product.title)) targeted.add(stem(token));
  }

  const gaps: { term: string; demand: number; reason: string }[] = [];
  for (const [query, count] of Object.entries(getSearchLog())) {
    const normalized = tokenize(query).join(" ");
    const covered = [...targeted].some((t) => t === normalized || t === stem(normalized));
    if (!covered && count >= 2) {
      gaps.push({ term: normalized, demand: count, reason: "On-site searches with no matching published listing" });
    }
  }

  const conversionLog = getConversionLog();
  for (const [term, purchases] of Object.entries(conversionLog)) {
    if (!targeted.has(term) && purchases > 0) {
      gaps.push({ term, demand: purchases * 5, reason: "Attributed purchases for a term no listing targets" });
    }
  }

  return gaps.sort((a, b) => b.demand - a.demand).slice(0, limit);
}

/** Keywords targeted across the catalogue, with the listing that owns them. */
export function keywordOwnership(products: Product[] = getAllProducts()): Record<string, { slug: string; title: string; priority: number }[]> {
  const ownership: Record<string, { slug: string; title: string; priority: number }[]> = {};
  for (const product of products) {
    for (const kw of product.seo?.keywords ?? []) {
      if (kw.kind !== "primary" && kw.kind !== "secondary") continue;
      const list = ownership[kw.normalized] ?? [];
      list.push({ slug: product.slug, title: product.title, priority: kw.priority });
      ownership[kw.normalized] = list;
    }
  }
  return ownership;
}

export function topKeywordsAcrossCatalogue(limit = 25): (KeywordEntry & { product: string })[] {
  const seen = new Map<string, KeywordEntry & { product: string }>();
  for (const product of getAllProducts()) {
    for (const kw of product.seo?.keywords ?? []) {
      const existing = seen.get(kw.normalized);
      if (!existing || kw.priority > existing.priority) seen.set(kw.normalized, { ...kw, product: product.slug });
    }
  }
  return [...seen.values()].sort((a, b) => b.priority - a.priority).slice(0, limit);
}

import type { Collection, Product } from "@/lib/types";
import { getAllProducts, getCollections, getArticles } from "@/lib/store/db";
import { discountPct, inventoryHealth } from "@/lib/commerce/product-utils";

export { discountPct, formatUsd, inventoryHealth, priceStats, stockState } from "@/lib/commerce/product-utils";
import { contentWords, round, stem, tokenize } from "@/lib/seo/text";

/** Storefront catalogue queries: filtering, faceting, sorting, search. */

export type SortKey = "featured" | "price-asc" | "price-desc" | "rating" | "newest" | "seo";

export type CatalogFilters = {
  q?: string;
  collection?: string;
  category?: string;
  gender?: string;
  minPrice?: number;
  maxPrice?: number;
  colors?: string[];
  sizes?: string[];
  inStockOnly?: boolean;
  sort?: SortKey;
  page?: number;
  perPage?: number;
};

export function publishedProducts(): Product[] {
  return getAllProducts().filter((p) => p.status === "published");
}

export function findProduct(slug: string): Product | undefined {
  return getAllProducts().find((p) => p.slug === slug);
}

export function findCollection(slug: string): Collection | undefined {
  return getCollections().find((c) => c.slug === slug);
}

export function productCollections(product: Product): Collection[] {
  const all = getCollections();
  return all.filter((c) => product.collections.includes(c.slug) || c.slug === product.category);
}

export function facetCounts(products: Product[]) {
  const collections = new Map<string, number>();
  const categories = new Map<string, number>();
  const genders = new Map<string, number>();
  const colors = new Map<string, number>();
  const sizes = new Map<string, number>();
  const prices: number[] = [];

  for (const product of products) {
    for (const c of product.collections) collections.set(c, (collections.get(c) ?? 0) + 1);
    categories.set(product.category, (categories.get(product.category) ?? 0) + 1);
    genders.set(product.gender, (genders.get(product.gender) ?? 0) + 1);
    for (const color of product.colors) colors.set(color.name, (colors.get(color.name) ?? 0) + 1);
    for (const size of product.sizes) sizes.set(size, (sizes.get(size) ?? 0) + 1);
    prices.push(product.price);
  }

  const toList = (map: Map<string, number>) => [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

  return {
    collections: toList(collections),
    categories: toList(categories),
    genders: toList(genders),
    colors: toList(colors),
    sizes: toList(sizes),
    priceMin: prices.length ? Math.floor(Math.min(...prices)) : 0,
    priceMax: prices.length ? Math.ceil(Math.max(...prices)) : 0,
  };
}

function relevanceScore(product: Product, tokens: string[]): number {
  const titleTokens = tokenize(product.title);
  const keywordTerms = (product.seo?.keywords ?? []).slice(0, 30).map((k) => k.normalized);
  const haystack = tokenize(
    `${product.title} ${product.category} ${product.collections.join(" ")} ${product.tags.join(" ")} ${product.material} ${product.fit} ${product.colors.map((c) => c.name).join(" ")} ${keywordTerms.join(" ")}`,
  );
  const stems = haystack.map(stem);

  let score = 0;
  for (const token of tokens) {
    const s = stem(token);
    if (titleTokens.includes(token)) score += 6;
    if (stems.includes(s)) score += 3;
    if (keywordTerms.some((k) => k.includes(token))) score += 2;
    if (product.seo?.keywords?.[0]?.normalized.includes(token)) score += 4;
  }
  if (!score) {
    const joined = haystack.join(" ");
    for (const token of tokens) if (joined.includes(token)) score += 1;
  }
  return score;
}

export function filterProducts(filters: CatalogFilters, source: Product[] = publishedProducts()) {
  let products = [...source];
  const q = filters.q?.trim().toLowerCase() ?? "";
  const tokens = contentWords(q);

  if (tokens.length) {
    products = products
      .map((product) => ({ product, score: relevanceScore(product, tokens) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.product);
  }

  if (filters.collection) {
    products = products.filter(
      (p) => p.collections.includes(filters.collection as string) || p.category === filters.collection || p.gender === filters.collection,
    );
  }
  if (filters.category) products = products.filter((p) => p.category === filters.category);
  if (filters.gender) products = products.filter((p) => p.gender === filters.gender);
  const minPrice = filters.minPrice;
  const maxPrice = filters.maxPrice;
  if (typeof minPrice === "number") products = products.filter((p) => p.price >= minPrice);
  if (typeof maxPrice === "number") products = products.filter((p) => p.price <= maxPrice);
  if (filters.colors?.length) {
    const wanted = filters.colors.map((c) => c.toLowerCase());
    products = products.filter((p) => p.colors.some((c) => wanted.includes(c.name.toLowerCase())));
  }
  if (filters.sizes?.length) {
    const wanted = filters.sizes.map((s) => s.toUpperCase());
    products = products.filter((p) => p.sizes.some((s) => wanted.includes(s.toUpperCase())) && wanted.some((s) => (p.inventory?.[s] ?? 0) > 0));
  }
  if (filters.inStockOnly) products = products.filter((p) => inventoryHealth(p).inStock);

  const sort = filters.sort ?? "featured";
  switch (sort) {
    case "price-asc":
      products.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      products.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      products.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
      break;
    case "newest":
      products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case "seo":
      products.sort((a, b) => (b.seo?.score?.total ?? 0) - (a.seo?.score?.total ?? 0));
      break;
    default:
      // "featured" blends commercial performance with SEO health — the same
      // signal mix that decides what merchandising surfaces on the homepage.
      products.sort((a, b) => featureScore(b) - featureScore(a));
  }

  return products;
}

function featureScore(product: Product): number {
  const stock = inventoryHealth(product);
  const conversion = product.metrics?.clicks ? product.metrics.purchases / product.metrics.clicks : 0;
  return (
    (product.seo?.score?.total ?? 0) * 0.35 +
    product.rating * 8 +
    Math.min(40, product.reviewCount / 12) +
    conversion * 400 +
    (stock.inStock ? 12 : -40) +
    (discountPct(product) > 0 ? 6 : 0)
  );
}

export function paginate<T>(items: T[], page = 1, perPage = 12): { items: T[]; page: number; perPage: number; total: number; pages: number } {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), pages);
  return { items: items.slice((safePage - 1) * perPage, safePage * perPage), page: safePage, perPage, total, pages };
}

export function relatedProducts(product: Product, limit = 4): Product[] {
  const all = publishedProducts().filter((p) => p.id !== product.id);
  const scored = all.map((candidate) => {
    let score = 0;
    if (candidate.category === product.category) score += 5;
    score += candidate.collections.filter((c) => product.collections.includes(c)).length * 2;
    if (candidate.gender === product.gender) score += 2;
    if (Math.abs(candidate.price - product.price) < 25) score += 2;
    if (candidate.weightGsm && product.weightGsm && Math.abs(candidate.weightGsm - product.weightGsm) <= 60) score += 2;
    score += candidate.rating;
    return { candidate, score };
  });
  return scored
    .filter((entry) => entry.score > 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function bestsellers(limit = 4): Product[] {
  return [...publishedProducts()]
    .sort((a, b) => (b.metrics?.purchases ?? 0) - (a.metrics?.purchases ?? 0) || b.rating - a.rating)
    .slice(0, limit);
}

export function highestScored(limit = 4): Product[] {
  return [...publishedProducts()].sort((a, b) => (b.seo?.score?.total ?? 0) - (a.seo?.score?.total ?? 0)).slice(0, limit);
}

export function breadcrumbsFor(product: Product) {
  return product.seo?.breadcrumb?.length
    ? product.seo.breadcrumb
    : [
        { name: "Home", href: "/" },
        { name: "Hoodies", href: "/shop" },
        { name: product.title, href: `/shop/${product.slug}` },
      ];
}

export function searchEverything(query: string, limit = 8) {
  const tokens = contentWords(query.toLowerCase());
  if (!tokens.length) return { products: [] as Product[], collections: [] as Collection[], articles: [] as { slug: string; title: string }[] };

  const products = filterProducts({ q: query }, publishedProducts()).slice(0, limit);
  const collections = getCollections()
    .filter((c) => tokens.some((t) => `${c.name} ${c.description} ${c.keywords.join(" ")}`.toLowerCase().includes(t)))
    .slice(0, 3);
  const articles = getArticles()
    .filter((a) => tokens.some((t) => `${a.title} ${a.description} ${a.targetKeywords.join(" ")}`.toLowerCase().includes(t)))
    .slice(0, 3)
    .map((a) => ({ slug: a.slug, title: a.title }));

  return { products, collections, articles };
}

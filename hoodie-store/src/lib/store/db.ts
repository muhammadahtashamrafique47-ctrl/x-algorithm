import fs from "node:fs";
import path from "node:path";
import type { Article, Collection, Product, TrackEvent } from "@/lib/types";

/**
 * File-backed JSON datastore.
 *
 * Deliberately dependency-free and synchronous-cached so the storefront, the
 * admin tools and the SEO engine all read exactly the same catalogue state.
 * Swap this module for Postgres/Prisma in production — every consumer goes
 * through these functions, so the interface is the only contract.
 */

const DATA_DIR = path.join(process.cwd(), "src", "data");
const RUNTIME_DIR = path.join(DATA_DIR, "runtime");
const SEED_DIR = path.join(DATA_DIR, "seed");

const FILES = {
  products: "products.json",
  collections: "collections.json",
  articles: "articles.json",
  events: "events.json",
  search: "search.json",
  settings: "settings.json",
} as const;

type Cache = { products?: Product[]; collections?: Collection[]; articles?: Article[]; events?: TrackEvent[]; search?: Record<string, number>; settings?: Record<string, unknown> };
const cache: Cache = {};

function ensureDirs() {
  // mkdirSync({recursive:true}) is idempotent, so there is no need for an
  // existsSync probe — and avoiding the probe keeps Next's file tracer from
  // pulling the whole project into the server bundle.
  for (const dir of [DATA_DIR, RUNTIME_DIR]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* already present or read-only: reads below will surface a real failure */
    }
  }
}

function runtimePath(file: string) {
  return path.join(RUNTIME_DIR, file);
}

function seedPath(file: string) {
  return path.join(SEED_DIR, file);
}

function readJson<T>(file: string, fallback: T): T {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(runtimePath(file), "utf8")) as T;
  } catch {
    /* not written yet, or corrupt — fall through to the seed copy */
  }
  try {
    const data = JSON.parse(fs.readFileSync(seedPath(file), "utf8")) as T;
    writeJson(file, data);
    return data;
  } catch {
    /* no seed either */
  }
  return fallback;
}

/** Atomic write: tmp file + rename, so a crash never leaves a half-written DB. */
export function writeJson(file: string, data: unknown): void {
  ensureDirs();
  const target = runtimePath(file);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, target);
}

export function getAllProducts(): Product[] {
  if (!cache.products) cache.products = readJson<Product[]>(FILES.products, []);
  return cache.products;
}

export function saveProducts(products: Product[]): void {
  cache.products = products;
  writeJson(FILES.products, products);
}

export function getProductBySlug(slug: string): Product | undefined {
  return getAllProducts().find((p) => p.slug === slug);
}

export function getProductById(id: string): Product | undefined {
  return getAllProducts().find((p) => p.id === id);
}

export function upsertProduct(product: Product): Product {
  const products = getAllProducts();
  const index = products.findIndex((p) => p.id === product.id);
  if (index >= 0) products[index] = product;
  else products.unshift(product);
  saveProducts([...products]);
  return product;
}

export function deleteProduct(id: string): boolean {
  const products = getAllProducts();
  const next = products.filter((p) => p.id !== id);
  const removed = next.length !== products.length;
  if (removed) saveProducts(next);
  return removed;
}

export function getCollections(): Collection[] {
  if (!cache.collections) cache.collections = readJson<Collection[]>(FILES.collections, []);
  return cache.collections;
}

export function saveCollections(collections: Collection[]): void {
  cache.collections = collections;
  writeJson(FILES.collections, collections);
}

export function getArticles(): Article[] {
  if (!cache.articles) cache.articles = readJson<Article[]>(FILES.articles, []);
  return cache.articles;
}

export function saveArticles(articles: Article[]): void {
  cache.articles = articles;
  writeJson(FILES.articles, articles);
}

const MAX_EVENTS = 20_000;

export function getEvents(): TrackEvent[] {
  if (!cache.events) cache.events = readJson<TrackEvent[]>(FILES.events, []);
  return cache.events;
}

export function recordEvent(event: TrackEvent): void {
  const events = getEvents();
  events.push({ ...event, at: event.at ?? new Date().toISOString() });
  const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
  cache.events = trimmed;
  writeJson(FILES.events, trimmed);
}

/**
 * Bulk append with a single disk write.
 *
 * `recordEvent` rewrites the whole log, which is fine for live traffic but far
 * too slow for seeding or bulk imports — this is the batched path.
 */
export function appendEvents(incoming: TrackEvent[]): void {
  if (!incoming.length) return;
  const stamped = incoming.map((event) => ({ ...event, at: event.at ?? new Date().toISOString() }));
  const events = [...getEvents(), ...stamped];
  const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
  cache.events = trimmed;
  writeJson(FILES.events, trimmed);
}

export function recordEvents(events: TrackEvent[]): void {
  appendEvents(events);
}

/** First-party search intent: on-site query -> count. */
export function getSearchLog(): Record<string, number> {
  if (!cache.search) cache.search = readJson<Record<string, number>>(FILES.search, {});
  return cache.search;
}

/** Replace the whole on-site search log (seeding / imports) keeping the cache in sync. */
export function saveSearchLog(log: Record<string, number>): void {
  cache.search = log;
  writeJson(FILES.search, log);
}

export function logSearch(query: string): void {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return;
  const log = getSearchLog();
  log[key] = (log[key] ?? 0) + 1;
  cache.search = log;
  writeJson(FILES.search, log);
  recordEvent({ type: "search", keyword: key });
}

export function getSettings(): Record<string, unknown> {
  if (!cache.settings) cache.settings = readJson<Record<string, unknown>>(FILES.settings, {});
  return cache.settings;
}

export function saveSettings(settings: Record<string, unknown>): void {
  cache.settings = settings;
  writeJson(FILES.settings, settings);
}

/** Drop the in-memory cache (used after direct file edits / reseeding). */
export function invalidateCache(): void {
  for (const key of Object.keys(cache) as (keyof Cache)[]) delete cache[key];
}

/** Aggregate keyword -> purchase counts from the event log. */
export function getConversionLog(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const event of getEvents()) {
    if ((event.type === "purchase" || event.type === "add_to_cart") && event.keyword) {
      out[event.keyword] = (out[event.keyword] ?? 0) + (event.type === "purchase" ? 3 : 1);
    }
  }
  return out;
}

export function getSiteStats() {
  const products = getAllProducts();
  const events = getEvents();
  const published = products.filter((p) => p.status === "published");
  const avgScore = published.length
    ? Math.round(published.reduce((s, p) => s + (p.seo?.score?.total ?? 0), 0) / published.length)
    : 0;
  const impressions = events.filter((e) => e.type === "impression").length;
  const clicks = events.filter((e) => e.type === "click").length;
  const purchases = events.filter((e) => e.type === "purchase").length;
  const revenue = events.filter((e) => e.type === "purchase").reduce((s, e) => s + (e.value ?? 0), 0);
  return {
    products: products.length,
    published: published.length,
    drafts: products.filter((p) => p.status === "draft").length,
    avgScore,
    impressions,
    clicks,
    purchases,
    revenue: Math.round(revenue * 100) / 100,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    conversionRate: clicks ? Math.round((purchases / clicks) * 10000) / 100 : 0,
    searchQueries: Object.keys(getSearchLog()).length,
    events: events.length,
  };
}

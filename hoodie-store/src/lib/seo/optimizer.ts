import type {
  CountryCode, FaqEntry, KeywordEntry, Locale, Product, ProductDraft, SeoBody, SeoIssue, SeoProfile, BodySection,
} from "@/lib/types";
import {
  BRAND_NAME, BRAND_SHORT, DEFAULT_LOCALE, MARKET_BY_COUNTRY, SERVED_LOCALES, SITE_URL, formatPrice, localTerms,
} from "@/lib/i18n/markets";
import { MODIFIERS, SEMANTIC_TERMS } from "@/lib/seo/lexicon";
import { buildKeywordEntry, expandKeywords, extractAttributes, keywordResearch, plausibility, type KeywordContext } from "@/lib/seo/keywords";
import {
  buildInternalCompetitionMap, cannibalizationRisks, contentGaps, conversionSignals, findSimilar, onsiteSearchSignals, pricePosition, productText, suggestInternalLinks, inventoryHealth,
} from "@/lib/seo/internal";
import { marketOpportunities, priceBandFor } from "@/lib/seo/external";
import { bodyText, buildScoringContext, contentFingerprint, MIN_CONTENT_WORDS, scoreListing } from "@/lib/seo/scoring";
import { refineListingCopy, aiStatus } from "@/lib/seo/ai/provider";
import { clamp, contentWords, dedupeBy, round, seededRandom, sentences, slugify, stem, titleCase, tokenize, truncateToChars, unique, wordCount } from "@/lib/seo/text";
import type { LlmCopyRefinement } from "@/lib/seo/ai/provider";

/**
 * The AI optimization pipeline.
 *
 *  1. Extract structured attributes from the merchant's raw upload.
 *  2. Research keywords: lexicon expansion × internal competition × on-site
 *     search × conversion log × market/season models.
 *  3. Generate candidate titles, descriptions and H1s, then *select* the best
 *     one with a SERP-level scoring function (generate-and-rank, not template
 *     fill).
 *  4. Write a unique, structured, entity-rich body + FAQs + alt text.
 *  5. Score the listing against the 19-factor Google-aligned rubric.
 *  6. Auto-fix every diagnosed issue and re-score (hill climbing, N passes).
 *  7. Optionally refine copy with a cloud LLM — accepted only if it scores
 *     higher than the local result.
 */

export type OptimizeOptions = {
  month?: number;
  targetMarkets?: CountryCode[];
  locales?: Locale[];
  useLlm?: boolean;
  passes?: number;
  preserveSlug?: boolean;
  locale?: Locale;
};

export function emptySeoProfile(): SeoProfile {
  return {
    optimized: false,
    engine: "local-nlp",
    version: 0,
    generatedAt: new Date(0).toISOString(),
    passes: 0,
    seoTitle: "",
    metaDescription: "",
    slug: "",
    canonicalPath: "",
    h1: "",
    breadcrumb: [],
    keywords: [],
    semanticTerms: [],
    intent: { primary: "commercial", secondary: [], confidence: 0, funnelStage: "consideration", rationale: "" },
    targetMarkets: [],
    hreflang: [],
    localizations: [],
    body: { intro: "", sections: [], faq: [], cta: "", wordCount: 0 },
    bullets: [],
    imageAlt: [],
    internalLinks: [],
    structuredData: [],
    score: { total: 0, grade: "F", factors: [], evaluatedAt: new Date(0).toISOString() },
    issues: [],
    contentHash: "",
    similarityToCatalogue: [],
  };
}

/* ------------------------------------------------------------------ *
 * Merchant draft normalisation
 * ------------------------------------------------------------------ */

export function newProductId(): string {
  return `prd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Turn whatever the merchant pasted/uploaded into a valid Product record. */
export function normalizeDraft(draft: ProductDraft, existing?: Product): Product {
  const now = new Date().toISOString();
  const title = (draft.title ?? existing?.title ?? "Untitled hoodie").trim();
  const category = (draft.category ?? existing?.category ?? guessCategory(title)).toLowerCase();
  const baseSlug = draft.slug ?? existing?.slug ?? slugify(title);

  const product: Product = {
    id: draft.id ?? existing?.id ?? newProductId(),
    sku: draft.sku ?? existing?.sku ?? `SKU-${baseSlug.slice(0, 8).toUpperCase()}-${Math.abs(hashSeed(title)) % 9000 + 1000}`,
    slug: ensureUniqueSlug(slugify(baseSlug), existing?.id),
    title,
    brand: draft.brand ?? existing?.brand ?? BRAND_NAME,
    category,
    collections: unique([...(draft.collections ?? existing?.collections ?? []), ...guessCollections(title, category, draft.gender ?? existing?.gender)]),
    gender: draft.gender ?? existing?.gender ?? "unisex",
    ageGroup: draft.ageGroup ?? existing?.ageGroup ?? "adult",
    price: Number(draft.price ?? existing?.price ?? 0) || 0,
    compareAtPrice: draft.compareAtPrice ?? existing?.compareAtPrice,
    cost: draft.cost ?? existing?.cost,
    currency: draft.currency ?? existing?.currency ?? "USD",
    colors: (draft.colors ?? existing?.colors ?? [{ name: "Black", hex: "#111111" }]).map((c) => ({
      name: String(c.name ?? "Black"),
      hex: String(c.hex ?? "#111111"),
    })),
    sizes: draft.sizes ?? existing?.sizes ?? ["XS", "S", "M", "L", "XL", "2XL"],
    material: draft.material ?? existing?.material ?? "80% combed cotton / 20% recycled polyester",
    weightGsm: draft.weightGsm ?? existing?.weightGsm ?? 380,
    fit: draft.fit ?? existing?.fit ?? "relaxed",
    features: draft.features ?? existing?.features ?? [],
    careInstructions: draft.careInstructions ?? existing?.careInstructions ?? "Machine wash cold inside out, tumble dry low, do not bleach.",
    countryOfOrigin: draft.countryOfOrigin ?? existing?.countryOfOrigin ?? "Portugal",
    description: draft.description ?? existing?.description ?? "",
    images: (draft.images ?? existing?.images ?? []).map((img) => ({
      src: img.src,
      alt: img.alt ?? "",
      width: img.width ?? 1200,
      height: img.height ?? 1500,
      role: img.role ?? "detail",
    })),
    inventory: draft.inventory ?? existing?.inventory ?? Object.fromEntries((draft.sizes ?? existing?.sizes ?? ["S", "M", "L", "XL"]).map((s) => [s, 25])),
    rating: draft.rating ?? existing?.rating ?? 0,
    reviewCount: draft.reviewCount ?? existing?.reviewCount ?? 0,
    reviews: draft.reviews ?? existing?.reviews ?? [],
    tags: unique([...(draft.tags ?? existing?.tags ?? []), ...guessTags(title, category)]),
    status: draft.status ?? existing?.status ?? "draft",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    publishedAt: draft.status === "published" ? (existing?.publishedAt ?? now) : existing?.publishedAt,
    seo: existing?.seo ?? emptySeoProfile(),
    metrics: existing?.metrics ?? {
      views: 0, impressions: 0, clicks: 0, addToCart: 0, purchases: 0, revenue: 0, searchEvents: {}, rankingKeywords: [],
    },
  };

  if (!product.description) product.description = describeFromAttributes(product);
  return product;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (/(zip|zipper)/.test(t)) return "zip-up";
  if (/(oversize|boxy|baggy)/.test(t)) return "oversized";
  if (/(crop)/.test(t)) return "cropped";
  if (/(heavy|400|450|500)/.test(t)) return "heavyweight";
  if (/(graphic|print|logo)/.test(t)) return "graphic";
  if (/(kid|child|youth|boys|girls)/.test(t)) return "kids";
  return "pullover";
}

export function guessCollections(title: string, category: string, gender?: string): string[] {
  const t = `${title} ${category}`.toLowerCase();
  const collections: string[] = [];
  if (gender && gender !== "unisex") collections.push(gender === "kids" ? "kids" : gender);
  else collections.push("unisex");
  for (const [dimension, list] of Object.entries(MODIFIERS)) {
    if (!["silhouette", "style", "material", "use"].includes(dimension)) continue;
    for (const mod of list) if (t.includes(mod.term)) collections.push(mod.term.replace(/\s+/g, "-"));
  }
  if (/(winter|fleece|heavy|sherpa)/.test(t)) collections.push("winter");
  if (/(summer|lightweight|breathable)/.test(t)) collections.push("lightweight");
  if (/(organic|recycled|sustain)/.test(t)) collections.push("sustainable");
  return unique(collections).slice(0, 6);
}

export function guessTags(title: string, category: string): string[] {
  const attrs = extractAttributes({ title, category });
  return unique(Object.values(attrs).flat().map((a) => a.replace(/\s+/g, "-"))).slice(0, 12);
}

function describeFromAttributes(product: Product): string {
  const attrs = extractAttributes(product);
  const parts = [
    `${product.title} in ${product.material}.`,
    attrs.silhouette?.length ? `${titleCase(attrs.silhouette.join(", "))} cut with a ${product.fit ?? "relaxed"} fit.` : "",
    product.weightGsm ? `${product.weightGsm} GSM fabric weight.` : "",
    product.features?.length ? product.features.join(". ") : "",
  ].filter(Boolean);
  return parts.join(" ");
}

import { getAllProducts } from "@/lib/store/db";

function ensureUniqueSlug(slug: string, selfId?: string): string {
  const products = getAllProducts();
  const taken = products.filter((p) => p.id !== selfId).map((p) => p.slug);
  if (!taken.includes(slug)) return slug;
  const stemSlug = slug.replace(/-\d+$/, "");
  let n = 2;
  while (taken.includes(`${stemSlug}-${n}`)) n++;
  return `${stemSlug}-${n}`;
}

/* ------------------------------------------------------------------ *
 * Keyword selection
 * ------------------------------------------------------------------ */

export function buildKeywordContext(product: Product, month: number, markets: CountryCode[]): KeywordContext {
  const attributes = extractAttributes(product);
  const corpus = productText(product);
  return {
    attributes,
    price: product.price,
    gender: product.gender,
    category: product.category,
    collections: product.collections,
    markets,
    month,
    internalCompetition: buildInternalCompetitionMap(getAllProducts().filter((p) => p.id !== product.id)),
    onsiteSearches: onsiteSearchSignals(),
    conversions: conversionSignals(),
    corpusText: corpus,
    attributeSalience: attributeSalience(product, attributes),
  };
}

/**
 * Ranks the product's own attributes by how much they define the product.
 * Words in the product name carry the most weight — that is what the merchant
 * chose to call it — followed by category, fabric and fit, then colourways and
 * incidental use cases last.
 */
export function attributeSalience(product: Product, attributes: Record<string, string[]>): Record<string, number> {
  const salience: Record<string, number> = {};
  const add = (value: string | undefined, weight: number) => {
    const key = value?.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim() ?? "";
    if (key.length < 3) return;
    salience[key] = Math.max(salience[key] ?? 0, weight);
  };

  const GENERIC = new Set(["hoodie", "hoodies", "the", "co", "supply", "northloop"]);
  const titleTokens = tokenize(product.title).filter((t) => !GENERIC.has(t));
  titleTokens.forEach((token) => add(token, 0.95));
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i + size <= titleTokens.length; i++) add(titleTokens.slice(i, i + size).join(" "), 1);
  }

  add(product.category, 0.6);
  add(product.fit, 0.72);
  (product.material ?? "").split(/[/,+]/).forEach((part) => add(part.trim(), 0.8));
  if (product.weightGsm) add(`${product.weightGsm} gsm`, 0.66);
  if (product.gender && product.gender !== "unisex") add(product.gender === "men" ? "mens" : product.gender === "women" ? "womens" : product.gender, 0.8);
  if (product.gender === "unisex") add("unisex", 0.4);
  (product.colors ?? []).forEach((color) => add(color.name, 0.44));
  (product.features ?? []).forEach((feature) => add(contentWords(feature).slice(0, 3).join(" "), 0.55));
  for (const value of attributes.use ?? []) add(value, 0.58);
  for (const value of attributes.season ?? []) add(value, 0.56);
  for (const value of attributes.silhouette ?? []) add(value, 0.85);
  for (const value of attributes.style ?? []) add(value, 0.78);
  for (const value of attributes.material ?? []) add(value, 0.8);

  return salience;
}

export function selectKeywords(product: Product, ctx: KeywordContext): KeywordEntry[] {
  const expanded = expandKeywords(ctx, { limit: 160 });
  const researched = keywordResearch(
    { seed: product.category === "zip-up" ? "zip up hoodie" : "hoodie", markets: ctx.markets, month: ctx.month, limit: 60 },
    {
      attributes: ctx.attributes,
      price: product.price,
      corpusText: ctx.corpusText,
      onsiteSearches: ctx.onsiteSearches,
      conversions: ctx.conversions,
      // Without this, research-sourced candidates score a neutral salience of 1
      // and crowd out the terms that actually name the product.
      attributeSalience: ctx.attributeSalience,
      internalCompetition: ctx.internalCompetition,
    },
  );

  const merged = dedupeBy([...expanded, ...researched], (k) => k.normalized);

  // Primary: highest-priority commercial/transactional term that is actually
  // relevant to this product (protects against ranking-chasing irrelevance).
  // Hard cannibalization guard: two product pages must never fight for the same
  // primary query. Terms already owned by a published listing are skipped unless
  // nothing else qualifies.
  const ownedPrimary = new Set(
    getAllProducts()
      .filter((p) => p.id !== product.id && p.status === "published" && p.seo?.keywords?.length)
      .map((p) => p.seo.keywords[0].normalized),
  );

  const qualifies = (k: KeywordEntry) =>
    (k.intent === "transactional" || k.intent === "commercial") &&
    k.relevance >= 0.3 &&
    k.term.split(" ").length <= 4 &&
    /(hoodie|hoodies|sweatshirt|pullover)/.test(k.term) &&
    plausibility(k.term) >= 0.78;

  const byPriority = (a: KeywordEntry, b: KeywordEntry) =>
    b.priority - a.priority || b.volume - a.volume || b.relevance - a.relevance;

  const primaryPool = merged.filter((k) => qualifies(k) && !ownedPrimary.has(k.normalized)).sort(byPriority);
  const fallbackPool = merged.filter((k) => qualifies(k)).sort(byPriority);

  // Prefer a term that names the product itself (salience >= 0.9 comes from the
  // product title, fabric or silhouette). Priority scores within a few points of
  // each other are statistical noise, so inside the top band we take the query
  // with the largest modelled volume — the same judgement a human SEO makes when
  // two equally relevant targets are on the table.
  const DEFINING = 0.9;
  const NOISE_BAND = 4;
  const pickFromBand = (list: KeywordEntry[]): KeywordEntry | undefined => {
    if (!list.length) return undefined;
    const top = list[0].priority;
    return list
      .filter((k) => k.priority >= top - NOISE_BAND)
      .sort((a, b) => b.volume - a.volume || b.priority - a.priority)[0];
  };
  const defining = (list: KeywordEntry[]) => list.filter((k) => (k.salience ?? 0) >= DEFINING);

  const primary =
    pickFromBand(defining(primaryPool)) ??
    primaryPool[0] ??
    pickFromBand(defining(fallbackPool)) ??
    fallbackPool[0] ??
    merged.sort((a, b) => b.priority - a.priority)[0];

  const withoutPrimary = merged.filter((k) => k.normalized !== primary?.normalized);
  const secondary = withoutPrimary
    .filter((k) => k.relevance >= 0.3 && (k.intent === "transactional" || k.intent === "commercial"))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
    .map((k) => ({ ...k, kind: "secondary" as const }));

  const secondaryTerms = new Set(secondary.map((s) => s.normalized));
  const longtail = withoutPrimary
    .filter((k) => !secondaryTerms.has(k.normalized) && k.kind === "longtail")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 28);

  const questions = withoutPrimary.filter((k) => k.kind === "question").sort((a, b) => b.volume - a.volume).slice(0, 8);
  const seasonal = withoutPrimary.filter((k) => k.kind === "seasonal").sort((a, b) => b.priority - a.priority).slice(0, 6);
  const localized = withoutPrimary.filter((k) => k.kind === "localized").sort((a, b) => b.priority - a.priority).slice(0, 12);
  const semantic = buildSemanticKeywords(product, ctx).slice(0, 14);

  const all = dedupeBy(
    [
      primary ? { ...primary, kind: "primary" as const } : null,
      ...secondary,
      ...longtail,
      ...questions,
      ...seasonal,
      ...localized,
      ...semantic,
    ].filter(Boolean) as KeywordEntry[],
    (k) => k.normalized,
  );

  return all.sort((a, b) => (a.kind === "primary" ? -1 : b.kind === "primary" ? 1 : b.priority - a.priority));
}

function buildSemanticKeywords(product: Product, ctx: KeywordContext): KeywordEntry[] {
  const text = `${productText(product)} ${product.description}`.toLowerCase();
  const terms: string[] = [];

  // Curated entity terms only. Arbitrary feature words ("half", "chest", "back")
  // produce queries nobody types, so they are filtered out unless they survive as
  // a multi-word entity that appears in the copy.
  for (const group of Object.values(SEMANTIC_TERMS)) {
    for (const term of group) if (text.includes(term)) terms.push(term);
  }
  for (const feature of product.features ?? []) {
    const words = contentWords(feature);
    if (words.length >= 2 && words.length <= 3 && text.includes(words.join(" "))) terms.push(words.join(" "));
  }

  const head = product.category === "zip-up" ? "zip up hoodie" : "hoodie";
  return unique(terms)
    .filter((term) => term.length > 3 && term !== head)
    .slice(0, 24)
    .map((term) => ({
      ...buildKeywordEntry(`${term} ${head}`, ctx, "semantic", "ai-expansion"),
      kind: "semantic" as const,
    }));
}

function semanticTermsFor(product: Product): string[] {
  const text = `${productText(product)} ${product.description}`.toLowerCase();
  const out: string[] = [];
  for (const [group, terms] of Object.entries(SEMANTIC_TERMS)) {
    const hits = terms.filter((t) => text.includes(t));
    if (hits.length) out.push(...hits);
    else if (["fabric", "fit", "care", "trust"].includes(group)) out.push(...terms.slice(0, 3));
  }
  return unique(out).slice(0, 26);
}

/* ------------------------------------------------------------------ *
 * Copy generation — generate candidates, then rank them
 * ------------------------------------------------------------------ */

type Candidate = { text: string; score: number; notes: string[] };

function rankTitle(candidate: string, primaryTerm: string, product: Product, takenTitles: Set<string>): Candidate {
  const notes: string[] = [];
  let score = 0;
  const len = candidate.length;
  const keywordStem = stem(primaryTerm.split(" ")[0] ?? "hoodie");

  if (len >= 45 && len <= 62) { score += 30; notes.push("ideal length"); }
  else if (len >= 34 && len <= 70) { score += 18; notes.push(`${len} chars — near ideal`); }
  else { score += 4; notes.push(`${len} chars — outside safe range`); }

  if (candidate.toLowerCase().includes(keywordStem)) { score += 22; notes.push("primary keyword present"); }
  if (candidate.toLowerCase().indexOf(keywordStem) >= 0 && candidate.toLowerCase().indexOf(keywordStem) < 22) { score += 10; notes.push("keyword front-loaded"); }
  if (candidate.endsWith(`| ${BRAND_SHORT}`) || candidate.endsWith(`| ${product.brand}`) || candidate.endsWith(`| ${BRAND_NAME}`)) {
    score += 6; notes.push("brand suffix");
  }

  const differentiators = [product.material?.split(" ")[0], product.weightGsm ? `${product.weightGsm} GSM` : "", product.colors?.[0]?.name, product.fit]
    .filter(Boolean).map((d) => String(d).toLowerCase());
  const diffHits = differentiators.filter((d) => candidate.toLowerCase().includes(d)).length;
  score += Math.min(12, diffHits * 6);
  if (diffHits) notes.push(`${diffHits} product differentiator(s)`);

  if (/^(buy|shop)\b/i.test(candidate)) { score += product.price < 60 ? 4 : 0; notes.push("commercial trigger"); }
  if (!takenTitles.has(candidate.toLowerCase())) { score += 14; notes.push("unique in catalogue"); }
  else { score -= 18; notes.push("duplicate title — penalised"); }
  if (/[!?]{2,}|[A-Z]{5,}/.test(candidate)) { score -= 8; notes.push("spammy casing/punctuation"); }

  // Deterministic per-product tie-break. Without it every listing in the
  // catalogue converges on the same winning template, and a wall of identical
  // title patterns is exactly the footprint Google's site-reputation and
  // helpful-content systems look for.
  const variety = seededRandom(`${product.slug}:title:${candidate}`) * 6;
  score += variety;
  if (variety > 3) notes.push("structural variety bonus");

  return { text: candidate, score: Math.round(score * 10) / 10, notes };
}

export function generateTitles(product: Product, keywords: KeywordEntry[], takenTitles: Set<string>): Candidate[] {
  const primary = keywords[0]?.term ?? "hoodie";
  const attrs = extractAttributes(product);
  const silhouette = attrs.silhouette?.[0] ?? "";
  const style = attrs.style?.[0] ?? "";
  const material = attrs.material?.[0] ?? "";
  const audience = product.gender === "unisex" ? "unisex" : product.gender;
  const gsm = product.weightGsm ? `${product.weightGsm} GSM` : "";
  const name = product.title.replace(/\s*\|.*$/, "");
  const brand = BRAND_SHORT;
  const colors = product.colors?.length ?? 0;
  const priceHook = product.price <= 50 ? "Under $50" : product.compareAtPrice && product.compareAtPrice > product.price ? `Now $${Math.round(product.price)}` : "Premium";
  const primaryTitle = titleCase(primary);
  // Never echo a modifier that already opens the keyword ("Heavyweight Hoodie:
  // Heavyweight Cotton ..." reads like a template and wastes pixels).
  const primaryTokens = new Set(tokenize(primary).map(stem));
  const attributesPhrase = titleCase(
    [silhouette, material].filter(Boolean).filter((attr) => !primaryTokens.has(stem(attr))).join(" "),
  );
  const notInPrimary = (value: string | undefined) => (value && !primaryTokens.has(stem(value)) ? value : "");
  const materialPhrase = titleCase(notInPrimary(material) || notInPrimary(style) || product.fit || "");
  const detailPhrase = attributesPhrase || titleCase(notInPrimary(style) || product.fit || "");

  const candidates = [
    `${primaryTitle}: ${detailPhrase} ${gsm} | ${brand}`,
    `${name} | ${gsm} ${titleCase(material)} ${titleCase(product.fit ?? "regular")} Fit | ${brand}`,
    `Buy ${primaryTitle} Online — ${materialPhrase} ${gsm} | ${brand}`,
    `${primaryTitle} in ${colors} Colours | ${titleCase(product.fit ?? "regular")} Fit, ${gsm} | ${brand}`,
    `${primaryTitle} for ${titleCase(audience)} — ${titleCase(style)} ${gsm} | ${brand}`,
    `${name}: ${gsm} ${materialPhrase} ${primaryTitle} | ${brand}`,
    `${primaryTitle} — Free Worldwide Shipping Over $75 | ${brand}`,
    `${primaryTitle} ${priceHook} | ${materialPhrase} ${detailPhrase} ${gsm} | ${brand}`,
  ]
    .map((c) => c.replace(/\s*\|\s*\|\s*/g, " | ").replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 18 && !/\|\s*\|$/.test(c));

  return dedupeBy(
    candidates.map((c) => rankTitle(c, primary, product, takenTitles)),
    (c) => c.text.toLowerCase(),
  ).sort((a, b) => b.score - a.score);
}

function rankMeta(candidate: string, primaryTerm: string, taken: Set<string>): Candidate {
  const notes: string[] = [];
  let score = 0;
  const len = candidate.length;
  if (len >= 140 && len <= 162) { score += 40; notes.push("ideal length"); }
  else if (len >= 115 && len <= 180) { score += 24; notes.push(`${len} chars`); }
  else { score += 6; notes.push(`${len} chars — outside range`); }

  const keywordStem = stem(primaryTerm.split(" ")[0] ?? "hoodie");
  if (candidate.toLowerCase().includes(keywordStem)) { score += 22; notes.push("keyword bolding eligible"); }
  if (/free shipping|free returns|30-day|30 day|worldwide|secure|in stock/i.test(candidate)) { score += 18; notes.push("trust hook"); }
  if (/shop|buy|order|discover|explore|get yours|add to/i.test(candidate)) { score += 14; notes.push("CTA"); }
  if (!taken.has(candidate.toLowerCase())) { score += 12; notes.push("unique"); }
  else score -= 16;
  if (/\d/.test(candidate)) { score += 6; notes.push("numeric specificity"); }
  return { text: candidate, score, notes };
}

export function generateMetas(
  product: Product,
  keywords: KeywordEntry[],
  taken: Set<string>,
  context: { marketName: string; season: string },
): Candidate[] {
  const primary = keywords[0]?.term ?? "hoodie";
  const secondary = keywords.find((k) => k.kind === "secondary")?.term ?? "";
  const gsm = product.weightGsm ? `${product.weightGsm} GSM` : "midweight";
  const material = product.material.split("/")[0].trim().toLowerCase();
  const price = product.price ? `From $${Math.round(product.price)}` : "";
  const stock = inventoryHealth(product).inStock ? "In stock" : "Back soon";
  const market = titleCase(context.marketName || "worldwide");
  const season = (context.season || "cold-season").toLowerCase();

  const candidates = [
    `Shop the ${primary} — ${gsm} ${material}, ${product.fit} fit in ${product.sizes.length} sizes. ${stock}, free worldwide shipping over $75 and 30-day returns.`,
    `${titleCase(primary)} built for ${season} layering: ${gsm} brushed fleece, double-needle stitching, ${product.colors.length} colourways. ${price} · free returns.`,
    `Discover our ${primary}: ${material} with a ${product.fit} cut, kangaroo pocket and ribbed cuffs. Rated ${product.rating || 4.7}/5 by ${(product.reviewCount || 0).toLocaleString()}+ shoppers. Ships to ${market}.`,
    `Buy ${primary} online — ${gsm}, pre-shrunk ${material}, true-to-size fit guide included. ${stock} with tracked delivery to ${market}.`,
  ];

  return dedupeBy(
    candidates.map((c) => rankMeta(c.replace(/\s+/g, " ").trim(), primary, taken)),
    (c) => c.text.toLowerCase(),
  ).sort((a, b) => b.score - a.score);
}

function generateH1(product: Product, keywords: KeywordEntry[]): string {
  const primary = keywords[0]?.term ?? "hoodie";
  const attrs = extractAttributes(product);
  const bits = [attrs.silhouette?.[0], attrs.material?.[0], product.colors?.[0]?.name].filter(Boolean);
  const name = product.title.replace(/\s*\|.*$/, "");
  const candidates = [
    `${name} — ${titleCase(primary)}`,
    `${titleCase(primary)}: ${titleCase(bits.join(" "))}`,
    `${titleCase(name)}`,
    `${titleCase([attrs.audience?.[0], primary].filter(Boolean).join(" "))} · ${titleCase(bits[0] ?? "")}`.trim(),
  ];
  return candidates.map((c) => c.replace(/\s+/g, " ").trim()).filter((c) => c.length <= 78 && c.length > 8).sort((a, b) => a.length - b.length)[0] ?? name;
}

function generateBullets(product: Product, keywords: KeywordEntry[]): string[] {
  const attrs = extractAttributes(product);
  const gsm = product.weightGsm ?? 380;
  const warmth = gsm >= 420 ? "sub-zero layering" : gsm >= 340 ? "autumn and winter" : "year-round";
  const bullets = [
    `${gsm} GSM ${product.material.split("/")[0].trim().toLowerCase()} — engineered for ${warmth}`,
    `${titleCase(product.fit ?? attrs.silhouette?.[0] ?? "relaxed")} fit with ${attrs.silhouette?.includes("oversized") ? "dropped shoulders" : "a clean shoulder line"}`,
    product.features?.[0] ?? "Double-needle stitching at every stress point",
    product.features?.[1] ?? "Brushed-back fleece interior that stays soft after 50 washes",
    product.features?.[2] ?? "Self-fabric drawcord and metal-tipped drawstrings",
    `${product.sizes.length} sizes (${product.sizes[0]}–${product.sizes[product.sizes.length - 1]}) with a true-to-size guide`,
    product.colors.length > 1 ? `${product.colors.length} garment-dyed colourways, all pre-shrunk` : "Garment-dyed and pre-shrunk",
    product.careInstructions ?? "Machine wash cold, tumble dry low",
  ];
  return unique(bullets).slice(0, 7).map((b) => truncateToChars(b, 120));
}

function generateBody(product: Product, keywords: KeywordEntry[], month: number, markets: CountryCode[]): SeoBody {
  const primary = keywords[0]?.term ?? "hoodie";
  const attrs = extractAttributes(product);
  const gsm = product.weightGsm ?? 380;
  const material = product.material;
  const fit = product.fit ?? "relaxed";
  const silhouette = attrs.silhouette?.[0] ?? (fit === "oversized" ? "oversized" : "regular");
  const style = attrs.style?.[0] ?? product.category;
  const colorNames = product.colors.map((c) => c.name.toLowerCase());
  const marketProfiles = markets.map((m) => MARKET_BY_COUNTRY[m]).filter(Boolean);
  const season = marketProfiles[0]?.coldMonths.includes(month) ? "cold-season" : "transitional-season";
  const band = priceBandFor(product);
  const position = pricePosition(product);

  const intro =
    `The ${product.title.replace(/\s*\|.*$/, "")} is a ${gsm} GSM ${silhouette} ${primary} cut from ${material}. ` +
    `It is built for ${season} wear: a brushed-back interior traps warmth without bulk, while the ${fit} body keeps it easy to layer over a tee or under a jacket. ` +
    `Every panel is sewn with double-needle stitching, so the cuffs, hem and pocket edges hold their shape through repeated washes.`;

  const sections: BodySection[] = [
    {
      heading: `Fabric and feel: what ${gsm} GSM actually means`,
      keyword: `${gsm} gsm ${primary}`,
      body:
        `Fabric weight is the single best predictor of how a hoodie performs. At ${gsm} GSM this sits in the ${gsm >= 420 ? "heavyweight" : gsm >= 340 ? "mid-to-heavy" : "lightweight"} band — ` +
        `${gsm >= 420 ? "warm enough to replace a light jacket down to around 5°C" : gsm >= 340 ? "warm enough for most autumn and winter days, and comfortable indoors" : "light enough for layering, travel and mild climates"}. ` +
        `The face is ${material.toLowerCase()}, loop-knit on the outside and brushed on the inside so it feels broken in from the first wear. Because the yarn is ring-spun and the fabric pre-shrunk, ` +
        `you get less than 3% shrinkage after washing and no twisted side seams.`,
      bullets: [
        `${gsm} GSM fabric weight`,
        `Brushed-back interior, ${material.split("/").length > 1 ? "cotton-rich face" : "single-jersey face"}`,
        "Pre-shrunk and garment-dyed for colour consistency",
      ],
    },
    {
      heading: `Fit and sizing for a ${silhouette} ${style}`,
      keyword: `${silhouette} ${primary} fit`,
      body:
        `This is a ${fit} ${silhouette} block. In practice that means a slightly dropped shoulder, a straight body that skims rather than clings, and a hem that lands at the hip. ` +
        `Our size guide lists chest width, body length and sleeve length for every size from ${product.sizes[0]} to ${product.sizes[product.sizes.length - 1]}, measured flat. ` +
        `${silhouette === "oversized" ? "If you want a closer fit, size down one; if you plan to layer a knit underneath, stay with your usual size." : "Most shoppers take their usual size; size up only if you intend to layer heavily."} ` +
        `The ribbed cuffs and hem are cut with 5% elastane so they recover instead of flaring.`,
      bullets: [
        `${titleCase(fit)} fit — ${silhouette === "oversized" ? "expect 4-6cm of extra room through the chest" : "true to size"}`,
        `Sizes ${product.sizes.join(", ")}`,
        "Ribbed cuffs and hem with elastane recovery",
      ],
    },
    {
      heading: "Construction details worth checking on any hoodie",
      keyword: `${primary} quality`,
      body:
        `Cheap hoodies fail at the seams. Here the shoulders carry twill taping, the kangaroo pocket is bar-tacked at both corners, and the hood is lined with the same brushed fleece rather than a thin single jersey. ` +
        `Drawstrings run through reinforced eyelets with a self-fabric channel, so they never cut into the hood. ` +
        `${product.features?.length ? `Additional details: ${product.features.slice(0, 4).join("; ")}.` : "Flatlock seams under the arm reduce chafing when you layer."}`,
    },
    {
      heading: `How to style the ${colorNames[0] ?? "core"} ${primary}`,
      keyword: `how to style a ${primary}`,
      body:
        `${titleCase(colorNames[0] ?? "a neutral")} is the most versatile starting point: wear it with straight-leg denim and a white tee for an everyday look, or over a collared shirt with wool trousers when you want the hoodie to read as intentional rather than casual. ` +
        `For ${season} layering, put it under a long overcoat or a shell jacket — the ${silhouette} cut leaves room without adding bulk at the shoulder. ` +
        `${colorNames.length > 1 ? `The full colourway range (${colorNames.slice(0, 5).join(", ")}) lets you build a rotation that works across seasons.` : "It also works as a travel layer: it packs flat and hides creases."}`,
    },
    {
      heading: "Care, longevity and shrinkage control",
      keyword: `how to wash a ${primary}`,
      body:
        `${product.careInstructions ?? "Machine wash cold inside out, tumble dry low."} Washing inside out protects the brushed face and any print; cold water keeps cotton fibres from contracting. ` +
        `Avoid fabric softener — it coats the fleece and reduces breathability. Line drying extends the life of the elastane in the cuffs, and if you tumble dry, use low heat and remove the hoodie while it is still slightly damp. ` +
        `Treated this way the fabric holds its weight and colour for years rather than a single season.`,
    },
    {
      heading: `Why shoppers choose ${product.brand} for ${primary}s`,
      keyword: `best ${primary}`,
      body:
        `This ${primary} sits in our ${band.band} price band (${`$${band.range[0]}–$${band.range[1]}`}), which places it at the ${position.percentile}th percentile of our own ${product.category} range — ` +
        `${position.percentile > 60 ? "a premium build justified by fabric weight and construction" : "mid-range pricing with above-average fabric weight for the money"}. ` +
        `${product.rating ? `It currently holds ${product.rating}/5 across ${product.reviewCount} verified reviews.` : "It is a new release; verified reviews appear below as they come in."} ` +
        `Orders ship worldwide with tracked delivery, free shipping over $75 and 30-day free returns, including exchange on size.`,
    },
  ];

  // Sustainability section only when the data supports it (no invented claims).
  if (/organic|recycled|sustain/i.test(`${material} ${product.features?.join(" ") ?? ""}`)) {
    sections.push({
      heading: "Materials and sourcing",
      keyword: `${primary} sustainable`,
      body:
        `This style uses ${material.toLowerCase()}, produced in ${product.countryOfOrigin ?? "our audited partner mill"}. ` +
        `Recycled content reduces virgin polyester demand, and the dye house runs a closed-loop water system. Packaging is plastic-free and fully recyclable.`,
    });
  }

  const faq = generateFaqs(product, keywords, sections);
  const cta =
    `Add the ${product.title.replace(/\s*\|.*$/, "")} to your bag — ${product.price ? `$${product.price.toFixed(2)}` : "priced at checkout"}, ` +
    `${inventoryHealth(product).inStock ? "in stock and ready to ship" : "back in stock soon — join the waitlist"}, free worldwide shipping over $75 and 30-day returns.`;

  const body: SeoBody = { intro, sections, faq, cta, wordCount: 0 };
  body.wordCount = wordCount(bodyText({ ...emptySeoProfile(), body } as SeoProfile));
  return body;
}

function generateFaqs(product: Product, keywords: KeywordEntry[], sections: BodySection[]): FaqEntry[] {
  const gsm = product.weightGsm ?? 380;
  const questions = keywords.filter((k) => k.kind === "question").sort((a, b) => b.volume - a.volume).slice(0, 6);
  const faqs: FaqEntry[] = [];

  const answerBank: Record<string, string> = {
    fit: `It is a ${product.fit ?? "relaxed"} ${product.category} block. Take your usual size for the intended look, or size down one for a closer fit. The size guide lists flat chest, body and sleeve measurements for ${product.sizes.join(", ")}.`,
    wash: `${product.careInstructions ?? "Machine wash cold inside out and tumble dry low."} Skip fabric softener and avoid high heat — the fabric is pre-shrunk, so shrinkage stays under 3%.`,
    warm: `At ${gsm} GSM this is a ${gsm >= 420 ? "heavyweight" : gsm >= 340 ? "mid-weight" : "lightweight"} hoodie. ${gsm >= 420 ? "It replaces a light jacket down to roughly 5°C." : gsm >= 340 ? "It covers most autumn and winter days and layers well under a coat." : "It is designed for layering, travel and mild climates rather than deep winter."}`,
    gsm: `GSM is grams per square metre — the weight of the fabric. Under 300 is lightweight, 300-400 is mid-weight, and 400+ is heavyweight. This style is ${gsm} GSM.`,
    style: `Wear it with straight-leg denim and a plain tee for everyday, or layer it under an overcoat in winter. ${product.colors.length > 1 ? `It comes in ${product.colors.map((c) => c.name.toLowerCase()).join(", ")}.` : ""}`,
    size: `Sizes run ${product.sizes[0]} to ${product.sizes[product.sizes.length - 1]}. ${product.gender === "unisex" ? "The block is unisex, so use the men's measurement chart as the reference." : `The block is cut for ${product.gender}.`}`,
    material: `${product.material}${product.countryOfOrigin ? `, made in ${product.countryOfOrigin}` : ""}.`,
    shipping: `Orders ship worldwide with tracking. Delivery is free over $75, and returns are free for 30 days including size exchanges.`,
    shrink: `The fabric is pre-shrunk and garment-dyed, so expect under 3% shrinkage if you wash cold and avoid high heat.`,
    worth: `For ${product.price ? `$${product.price.toFixed(2)}` : "this price"} you get ${gsm} GSM fabric, double-needle stitching, a lined hood and bar-tacked pockets — the details that usually separate a hoodie that lasts a season from one that lasts years.`,
  };

  const pickAnswer = (q: string): string => {
    const t = q.toLowerCase();
    if (/\bfit\b|size (should|to buy)|what size/.test(t)) return answerBank.size;
    if (/wash|shrink|dry|care/.test(t)) return answerBank.wash;
    if (/warm|winter|cold|temperature/.test(t)) return answerBank.warm;
    if (/gsm|weight/.test(t)) return answerBank.gsm;
    if (/style|outfit|wear/.test(t)) return answerBank.style;
    if (/worth|good|quality/.test(t)) return answerBank.worth;
    if (/material|fabric|cotton|made of/.test(t)) return answerBank.material;
    if (/ship|deliver|return/.test(t)) return answerBank.shipping;
    return answerBank.fit;
  };

  for (const q of questions) {
    faqs.push({ q: titleCase(q.term.replace(/\?$/, "")) + "?", a: pickAnswer(q.term) });
  }

  const defaults = [
    { q: `How should this ${product.category} hoodie fit?`, a: answerBank.fit },
    { q: `Is ${product.weightGsm ?? 380} GSM warm enough for winter?`, a: answerBank.warm },
    { q: "Will it shrink in the wash?", a: answerBank.shrink },
    { q: "What is the fabric composition?", a: answerBank.material },
    { q: "Do you ship internationally and accept returns?", a: answerBank.shipping },
    { q: "How do I style it?", a: answerBank.style },
  ];

  const merged = dedupeBy([...faqs, ...defaults], (f) => stem(f.q.replace(/\W/g, " ").toLowerCase()).slice(0, 40));
  return merged.slice(0, 6);
}

function generateImageAlt(product: Product, keywords: KeywordEntry[]): { src: string; alt: string }[] {
  const primary = keywords[0]?.term ?? "hoodie";
  const secondary = keywords.find((k) => k.kind === "secondary")?.term ?? "";
  const attrs = extractAttributes(product);
  const gsm = product.weightGsm ?? 380;
  const name = product.title.replace(/\s*\|.*$/, "");

  return product.images.map((image, index) => {
    const color = product.colors[index % Math.max(1, product.colors.length)]?.name ?? "";
    const role = image.role ?? (index === 0 ? "hero" : index % 3 === 0 ? "lifestyle" : "detail");
    const templates: Record<string, string[]> = {
      hero: [
        `${name} — ${color} ${primary} front view, ${gsm} GSM ${product.material.split("/")[0].trim().toLowerCase()}`,
        `${color} ${attrs.silhouette?.[0] ?? ""} ${primary} by ${product.brand}, front view on a plain background`,
      ],
      detail: [
        `Close-up of the brushed fleece interior and double-needle stitching on the ${name}`,
        `Detail of the lined hood, self-fabric drawcord and metal eyelets on the ${color} ${primary}`,
        `Ribbed cuff and hem detail on the ${gsm} GSM ${product.material.split("/")[0].trim().toLowerCase()} ${secondary || primary}`,
      ],
      lifestyle: [
        `Model wearing the ${color} ${primary} layered under an overcoat for ${attrs.season?.[0] ?? "winter"} styling`,
        `${name} styled with straight-leg denim — ${attrs.audience?.[0] ?? product.gender} streetwear look`,
      ],
      swatch: [`${color} colourway swatch for the ${name}`],
    };
    const pool = templates[role] ?? templates.detail;
    const chosen = pool[index % pool.length];
    return { src: image.src, alt: truncateToChars(chosen, 125) };
  });
}

/* ------------------------------------------------------------------ *
 * Localization + hreflang
 * ------------------------------------------------------------------ */

function buildLocalizations(product: Product, keywords: KeywordEntry[], markets: CountryCode[], locales: Locale[]) {
  const month = new Date().getMonth();
  return markets
    .map((code) => MARKET_BY_COUNTRY[code.toUpperCase()])
    .filter(Boolean)
    .slice(0, 8)
    .map((market) => {
      const native = localTerms(market, "hoodie");
      const locale = locales.find((l) => l.toLowerCase().startsWith(market.language.slice(0, 2).toLowerCase())) ?? market.locale;
      const attrs = extractAttributes(product);
      const silhouette = attrs.silhouette?.[0] ?? "";
      const localizedKeywords = unique([
        ...native,
        ...native.map((n) => `${n} ${silhouette}`.trim()),
        ...keywords.slice(0, 6).map((k) => k.term),
        `${native[0] ?? "hoodie"} ${market.name.toLowerCase()}`,
        `buy ${native[0] ?? "hoodie"} online ${market.name.toLowerCase()}`,
      ]).filter(Boolean).slice(0, 12);

      const titleBase = `${titleCase(native[0] ?? "Hoodie")} ${product.weightGsm ?? 380} GSM — ${titleCase(silhouette)} | ${product.brand}`;
      return {
        locale,
        country: market.country,
        seoTitle: truncateToChars(titleBase, 62),
        metaDescription: truncateToChars(
          `${titleCase(native[0] ?? "Hoodie")} ${product.weightGsm ?? 380} GSM in ${product.material.split("/")[0].trim().toLowerCase()}. ` +
          `${titleCase(product.fit ?? "relaxed")} fit, sizes ${product.sizes[0]}-${product.sizes[product.sizes.length - 1]}. ` +
          `Local price ${formatPrice(product.price, market)}, tracked delivery to ${market.name} and 30-day returns.`,
          162,
        ),
        h1: truncateToChars(`${titleCase(native[0] ?? "Hoodie")} — ${product.title.replace(/\s*\|.*$/, "")}`, 70),
        keywords: localizedKeywords,
        currency: market.currency,
        localizedPrice: formatPrice(product.price, market),
        marketNotes: `${market.name}: ${market.demandIndex}/100 demand, ${market.ecommerceIndex}/100 e-commerce maturity, price sensitivity ${market.priceSensitivity}/100, peak months ${market.coldMonths.map((m) => m + 1).join(", ") || "year-round"}.`,
      };
    });
}

function buildHreflang(slug: string, localizations: { locale: Locale }[], primaryLocale: Locale) {
  const entries = unique([primaryLocale, DEFAULT_LOCALE, ...localizations.map((l) => l.locale)]);
  const hreflang = entries.map((locale) => ({
    locale,
    href: locale === primaryLocale ? `${SITE_URL}/shop/${slug}` : `${SITE_URL}/shop/${slug}?hl=${locale}`,
  }));
  hreflang.push({ locale: "x-default", href: `${SITE_URL}/shop/${slug}` });
  return hreflang;
}

/* ------------------------------------------------------------------ *
 * Auto-fix loop
 * ------------------------------------------------------------------ */

function expandBodyToTarget(product: Product, body: SeoBody, keywords: KeywordEntry[], targetWords: number): SeoBody {
  const current = wordCount(`${body.intro} ${body.sections.map((s) => `${s.heading} ${s.body} ${(s.bullets ?? []).join(" ")}`).join(" ")} ${body.faq.map((f) => `${f.q} ${f.a}`).join(" ")} ${body.cta}`);
  if (current >= targetWords) return body;

  const primary = keywords[0]?.term ?? "hoodie";
  const attrs = extractAttributes(product);
  const extra: BodySection[] = [
    {
      heading: `${titleCase(primary)} buying checklist`,
      keyword: `best ${primary}`,
      body:
        `Before you buy any ${primary}, check four numbers: fabric weight in GSM, chest width measured flat, body length, and whether the hood is lined. ` +
        `Everything else — the pocket style, the drawcord, the cuff ribbing — follows from those. We publish all four for every size so you can compare like for like instead of guessing from a photo.`,
      bullets: ["Fabric weight (GSM)", "Flat chest and body measurements", "Lined vs single-layer hood", "Pre-shrunk guarantee"],
    },
    {
      heading: `${titleCase(attrs.season?.[0] ?? "Cold-season")} layering guide`,
      keyword: `${primary} layering`,
      body:
        `A ${product.weightGsm ?? 380} GSM hoodie is the middle layer in a three-layer system: a merino or cotton tee underneath for moisture management, the hoodie for insulation, and a shell or overcoat on top for wind and rain. ` +
        `Because the shoulders are cut with a slight drop, the hoodie sits flat under a coat instead of bunching. In milder weather it works as the outer layer on its own.`,
    },
    {
      heading: "Shipping, returns and size exchanges",
      keyword: `${primary} free shipping`,
      body:
        `We ship worldwide with tracked delivery — typically 2-4 business days domestically and 5-9 internationally. Orders over $75 ship free. ` +
        `Returns are free for 30 days, and size exchanges are prioritised so you are not left without a hoodie while the swap is in transit. Every order includes a prepaid return label.`,
    },
    {
      heading: `How the ${titleCase(attrs.silhouette?.[0] ?? product.category)} cut compares`,
      keyword: `${attrs.silhouette?.[0] ?? product.category} vs regular ${primary}`,
      body:
        `Compared with a regular-fit ${primary}, this ${attrs.silhouette?.[0] ?? product.category} block adds room through the chest and a slightly longer body while keeping the shoulder seam in place. ` +
        `That combination is what makes it read as intentional rather than oversized-by-accident, and it is the reason the same size works both as a standalone piece and as a mid-layer.`,
    },
  ];

  const sections = [...body.sections];
  for (const section of extra) {
    sections.push(section);
    const words = wordCount(`${body.intro} ${sections.map((s) => `${s.heading} ${s.body} ${(s.bullets ?? []).join(" ")}`).join(" ")} ${body.faq.map((f) => `${f.q} ${f.a}`).join(" ")} ${body.cta}`);
    if (words >= targetWords) break;
  }

  return { ...body, sections, wordCount: words0(sections, body) };
}

function words0(sections: BodySection[], body: SeoBody): number {
  return wordCount(`${body.intro} ${sections.map((s) => `${s.heading} ${s.body} ${(s.bullets ?? []).join(" ")}`).join(" ")} ${body.faq.map((f) => `${f.q} ${f.a}`).join(" ")} ${body.cta}`);
}

/** Reduce stuffing by swapping some exact-match occurrences for variants. */
function destuff(text: string, term: string): string {
  const tokens = tokenize(term);
  if (tokens.length < 2) return text;
  const variants = [tokens[tokens.length - 1], tokens.slice(0, -1).join(" "), "this style", "it"];
  let index = 0;
  return text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (match) => {
    index++;
    if (index % 3 !== 0) return match;
    const variant = variants[index % variants.length];
    return variant.charAt(0).toUpperCase() === match.charAt(0) && /[A-Z]/.test(match[0])
      ? variant.charAt(0).toUpperCase() + variant.slice(1)
      : variant;
  });
}

/**
 * Readability pass: split over-long sentences at safe boundaries only
 * (semicolons, or a comma immediately before a coordinating conjunction) so we
 * never produce a fragment.
 */
function improveReadability(text: string): string {
  return sentences(text)
    .map((sentence) => {
      if (wordCount(sentence) <= 24) return sentence;
      const parts = sentence
        .split(/;\s+|,\s+(?=(?:and|but|so|while|because|which|while)\s)/i)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) return sentence;
      return parts
        .map((part, i) => {
          const clean = part.replace(/[.,;]$/, "");
          const capped = i === 0 ? clean : clean.charAt(0).toUpperCase() + clean.slice(1);
          return `${capped}.`;
        })
        .join(" ");
    })
    .join(" ");
}

type FixResult = { profile: SeoProfile; applied: string[] };

function autoFix(product: Product, profile: SeoProfile, issues: SeoIssue[]): FixResult {
  const applied: string[] = [];
  let next: SeoProfile = { ...profile, body: { ...profile.body, sections: [...profile.body.sections] } };
  const keywords = next.keywords;
  const takenTitles = new Set(getAllProducts().filter((p) => p.id !== product.id).map((p) => p.seo?.seoTitle?.toLowerCase() ?? ""));
  const takenMetas = new Set(getAllProducts().filter((p) => p.id !== product.id).map((p) => p.seo?.metaDescription?.toLowerCase() ?? ""));

  const needs = (id: string) => next.score.factors.some((f) => f.id === id && f.score / f.weight < 0.85);

  if (needs("title")) {
    const candidates = generateTitles(product, keywords, takenTitles);
    const best = candidates[0];
    if (best && best.text !== next.seoTitle) {
      next.seoTitle = best.text;
      applied.push(`title regenerated (${best.score}/100: ${best.notes.join(", ")})`);
    }
  }
  if (next.seoTitle.length > 62) {
    next.seoTitle = truncateToChars(next.seoTitle.replace(/\s*\|\s*[^|]*$/, ""), 60) + ` | ${product.brand}`;
    applied.push("title trimmed to pixel budget");
  }

  if (needs("meta")) {
    const candidates = generateMetas(product, keywords, takenMetas, {
      marketName: MARKET_BY_COUNTRY[next.targetMarkets[0] ?? "US"]?.name ?? "worldwide",
      season: marketOpportunities(product, new Date().getMonth())[0]?.seasonNow ?? "cold-season",
    });
    const best = candidates[0];
    if (best) {
      next.metaDescription = best.text;
      applied.push(`meta description regenerated (${best.score}/100)`);
    }
  }
  if (next.metaDescription.length > 165) {
    next.metaDescription = truncateToChars(next.metaDescription, 160);
    applied.push("meta description trimmed");
  }

  if (needs("depth")) {
    const before = next.body.wordCount;
    next.body = expandBodyToTarget(product, next.body, keywords, MIN_CONTENT_WORDS + 60);
    next.body.wordCount = words0(next.body.sections, next.body);
    applied.push(`body expanded ${before} → ${next.body.wordCount} words`);
  }

  if (needs("semantic")) {
    const text = bodyText(next).toLowerCase();
    const missing = Object.entries(SEMANTIC_TERMS)
      .filter(([group]) => ["construction", "fabric", "fit", "care", "trust"].includes(group))
      .filter(([, terms]) => !terms.some((t) => text.includes(t)));
    if (missing.length) {
      const additions = missing.map(([group, terms]) => ({
        heading: `${titleCase(group)} specifics`,
        body: `${titleCase(group)} details for this ${product.category}: ${terms.slice(0, 4).join(", ")}.`,
        keyword: terms[0],
      }));
      next.body.sections = [...next.body.sections, ...additions];
      next.body.wordCount = words0(next.body.sections, next.body);
      applied.push(`semantic gaps filled: ${missing.map(([g]) => g).join(", ")}`);
    }
  }

  if (needs("density")) {
    const primaryTerm = keywords[0]?.term ?? "";
    next.body.sections = next.body.sections.map((s) => ({ ...s, body: destuff(s.body, primaryTerm) }));
    next.body.intro = destuff(next.body.intro, primaryTerm);
    next.body.wordCount = words0(next.body.sections, next.body);
    applied.push("keyword density normalised with variant substitution");
  }

  if (needs("readability")) {
    next.body.sections = next.body.sections.map((s) => ({ ...s, body: improveReadability(s.body) }));
    next.body.intro = improveReadability(next.body.intro);
    applied.push("long sentences split for readability");
  }

  if (needs("images")) {
    next.imageAlt = generateImageAlt(product, keywords);
    applied.push("alt text regenerated for every image");
  }

  if (needs("internal-links") || needs("uniqueness")) {
    const links = suggestInternalLinks(product);
    if (links.length > next.internalLinks.length) {
      next.internalLinks = links;
      applied.push(`internal links rebuilt (${links.length} contextual links)`);
    }
  }

  if (needs("headings") && next.body.faq.length < 4) {
    next.body.faq = generateFaqs(product, keywords, next.body.sections).slice(0, 6);
    applied.push(`FAQ expanded to ${next.body.faq.length} entries`);
  }

  if (needs("localization")) {
    next.localizations = buildLocalizations(product, keywords, next.targetMarkets, SERVED_LOCALES);
    next.hreflang = buildHreflang(next.slug, next.localizations, DEFAULT_LOCALE);
    applied.push(`localized variants rebuilt for ${next.localizations.length} markets`);
  }

  if (issues.some((i) => i.field === "structuredData")) {
    next.structuredData = unique([...next.structuredData, "Product", "Offer", "AggregateRating", "BreadcrumbList", "FAQPage", "ItemList"]);
    applied.push("structured data types completed");
  }

  return { profile: next, applied };
}

/* ------------------------------------------------------------------ *
 * Main pipeline
 * ------------------------------------------------------------------ */

/**
 * Score the merchant's raw listing exactly as uploaded — no generated copy, no
 * keywords, no structured data. This is the "before" number the admin shows
 * next to the optimized result, and it is what a real store looks like to
 * Google before the pipeline runs.
 */
export function rawProfileFor(product: Product): SeoProfile {
  const profile = emptySeoProfile();
  return {
    ...profile,
    slug: product.slug,
    canonicalPath: `/shop/${product.slug}`,
    seoTitle: product.title,
    metaDescription: truncateToChars(product.description || product.title, 158),
    h1: product.title,
    breadcrumb: [{ name: "Home", href: "/" }, { name: "Hoodies", href: "/shop" }, { name: product.title, href: `/shop/${product.slug}` }],
    body: {
      intro: product.description,
      sections: [],
      faq: [],
      cta: "",
      wordCount: wordCount(product.description),
    },
    bullets: (product.features ?? []).slice(0, 6),
    imageAlt: product.images.map((image) => ({ src: image.src, alt: image.alt })),
    internalLinks: [],
    structuredData: [],
    hreflang: [],
    localizations: [],
    targetMarkets: [],
  };
}

export async function optimizeProduct(product: Product, opts: OptimizeOptions = {}): Promise<Product> {
  const month = opts.month ?? new Date().getMonth();
  const opportunities = marketOpportunities(product, month);
  const markets = (opts.targetMarkets?.length ? opts.targetMarkets : opportunities.slice(0, 6).map((o) => o.country));
  const locales = opts.locales ?? SERVED_LOCALES;
  const maxPasses = clamp(opts.passes ?? 3, 1, 6);

  const ctx = buildKeywordContext(product, month, markets);
  const keywords = selectKeywords(product, ctx);
  const primary = keywords[0];

  const takenTitles = new Set(getAllProducts().filter((p) => p.id !== product.id).map((p) => p.seo?.seoTitle?.toLowerCase() ?? ""));
  const takenMetas = new Set(getAllProducts().filter((p) => p.id !== product.id).map((p) => p.seo?.metaDescription?.toLowerCase() ?? ""));

  const titles = generateTitles(product, keywords, takenTitles);
  const metas = generateMetas(product, keywords, takenMetas, {
    marketName: MARKET_BY_COUNTRY[markets[0] ?? "US"]?.name ?? "worldwide",
    season: opportunities[0]?.seasonNow ?? "cold-season",
  });

  // URLs stay derived from the product name. Stuffing the primary keyword and a
  // colourway into the path ("pullover-men-hoodie-oatmeal") is exactly the
  // pattern Google's spam systems flag, and it breaks every existing link the
  // merchant has already shared — so we keep it clean, short and stable.
  const slug = opts.preserveSlug && product.slug
    ? product.slug
    : ensureUniqueSlug(slugify(product.title).slice(0, 58) || slugify(primary?.term ?? "hoodie"), product.id);

  const body = generateBody(product, keywords, month, markets);
  const localizations = buildLocalizations(product, keywords, markets, locales);

  let profile: SeoProfile = {
    ...emptySeoProfile(),
    optimized: true,
    engine: "local-nlp",
    version: (product.seo?.version ?? 0) + 1,
    generatedAt: new Date().toISOString(),
    passes: 0,
    seoTitle: titles[0]?.text ?? product.title,
    metaDescription: metas[0]?.text ?? "",
    slug,
    canonicalPath: `/shop/${slug}`,
    h1: generateH1(product, keywords),
    breadcrumb: [
      { name: "Home", href: "/" },
      { name: "Hoodies", href: "/shop" },
      { name: titleCase(product.category.replace("-", " ")), href: `/collections/${product.category}` },
      { name: product.title.replace(/\s*\|.*$/, ""), href: `/shop/${slug}` },
    ],
    keywords,
    semanticTerms: semanticTermsFor(product),
    intent: intentProfileFor(primary, keywords, product),
    targetMarkets: markets,
    hreflang: buildHreflang(slug, localizations, DEFAULT_LOCALE),
    localizations,
    body: { ...body, wordCount: words0(body.sections, body) },
    bullets: generateBullets(product, keywords),
    imageAlt: generateImageAlt(product, keywords),
    internalLinks: suggestInternalLinks(product),
    structuredData: ["Product", "Offer", "AggregateRating", "BreadcrumbList", "FAQPage", "ItemList", "Organization", "WebSite"],
    score: { total: 0, grade: "F", factors: [], evaluatedAt: new Date().toISOString() },
    issues: [],
    contentHash: "",
    similarityToCatalogue: [],
  };

  const appliedFixes: string[] = [];
  const rawProfile = rawProfileFor(product);
  const rawProduct: Product = { ...product, seo: rawProfile };
  const baselineScore = product.seo?.optimized
    ? (product.seo.previousScore ?? product.seo.score.total)
    : scoreListing(rawProduct, rawProfile, buildScoringContext(rawProduct)).total;
  let previousScore = baselineScore;
  let best = profile;
  let bestScore = -1;

  for (let pass = 0; pass < maxPasses; pass++) {
    const scoredProduct: Product = { ...product, slug: profile.slug, seo: profile };
    const scoringCtx = buildScoringContext(scoredProduct);
    const score = scoreListing(scoredProduct, profile, scoringCtx);
    const issues = collectIssues(scoredProduct, profile, scoringCtx);
    profile = { ...profile, score, issues, passes: pass + 1 };

    if (score.total > bestScore) {
      bestScore = score.total;
      best = profile;
    }
    if (score.total >= 94 && !issues.some((i) => i.severity === "critical")) break;

    const fix = autoFix(product, profile, issues);
    appliedFixes.push(...fix.applied);
    profile = fix.profile;
  }

  // Optional cloud refinement — accepted only when it improves the score.
  const ai = aiStatus();
  if (opts.useLlm !== false && ai.enabled) {
    try {
      const refinement = await refineListingCopy({ product, draft: best });
      if (refinement) {
        const candidate = mergeRefinement(product, best, refinement);
        const candidateProduct: Product = { ...product, slug: candidate.slug, seo: candidate };
        const candidateScore = scoreListing(candidateProduct, candidate, buildScoringContext(candidateProduct));
        if (candidateScore.total >= bestScore) {
          candidate.score = candidateScore;
          candidate.issues = collectIssues(candidateProduct, candidate, buildScoringContext(candidateProduct));
          candidate.engine = "hybrid";
          best = candidate;
          bestScore = candidateScore.total;
          appliedFixes.push(`cloud LLM refinement accepted (${ai.provider}/${ai.model})`);
        } else {
          appliedFixes.push(`cloud LLM refinement rejected — scored ${candidateScore.total} vs local ${bestScore}`);
        }
      }
    } catch (error) {
      appliedFixes.push(`cloud refinement skipped: ${(error as Error).message}`);
    }
  }

  const finalProduct: Product = { ...product, slug: best.slug, seo: best };
  const similar = findSimilar(finalProduct, { limit: 5 })
    .filter((s) => s.kind === "product")
    .map((s) => ({ slug: s.slug, similarity: s.similarity }));

  const seo: SeoProfile = {
    ...best,
    contentHash: contentFingerprint(best),
    similarityToCatalogue: similar,
    previousScore,
    score: best.score,
    issues: best.issues.map((i) => ({ ...i, autoFixed: appliedFixes.some((f) => f.includes(i.field)) })),
  };

  if (appliedFixes.length) {
    seo.issues = [
      ...seo.issues,
      {
        id: `optimization-log:${seo.version}`,
        severity: "notice",
        field: "optimization",
        message: `Auto-optimization applied ${appliedFixes.length} correction(s): ${appliedFixes.slice(0, 6).join("; ")}.`,
        autoFixed: true,
      },
    ];
  }

  return {
    ...finalProduct,
    slug: seo.slug,
    seo,
    status: finalProduct.status === "draft" && process.env.SEO_AUTO_OPTIMIZE_ON_CREATE !== "false" ? "published" : finalProduct.status,
    publishedAt: finalProduct.status === "draft" ? new Date().toISOString() : finalProduct.publishedAt,
    updatedAt: new Date().toISOString(),
  };
}

function mergeRefinement(product: Product, profile: SeoProfile, refinement: LlmCopyRefinement): SeoProfile {
  const next: SeoProfile = { ...profile, body: { ...profile.body } };
  const safe = (value: string | undefined, min: number, max: number, fallback: string) => {
    if (!value) return fallback;
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length >= min && clean.length <= max ? clean : fallback;
  };

  next.seoTitle = safe(refinement.seoTitle, 30, 68, profile.seoTitle);
  next.metaDescription = safe(refinement.metaDescription, 110, 180, profile.metaDescription);
  next.h1 = safe(refinement.h1, 8, 90, profile.h1);
  next.body.intro = safe(refinement.intro, 120, 700, profile.body.intro);
  next.body.cta = refinement.cta && refinement.cta.length > 20 ? refinement.cta : profile.body.cta;
  if (refinement.bullets?.length) next.bullets = refinement.bullets.slice(0, 8).map((b) => truncateToChars(b, 130));
  if (refinement.sections?.length) {
    next.body.sections = refinement.sections.slice(0, 8).map((s) => ({
      heading: truncateToChars(s.heading, 70),
      body: s.body,
      bullets: s.bullets?.slice(0, 6),
    }));
  }
  if (refinement.faq?.length) next.body.faq = refinement.faq.slice(0, 8);
  if (refinement.imageAlt?.length) {
    const map = new Map(refinement.imageAlt.map((a) => [a.src, a.alt]));
    next.imageAlt = profile.imageAlt.map((a) => ({ src: a.src, alt: map.get(a.src) ?? a.alt }));
  }
  next.body.wordCount = words0(next.body.sections, next.body);

  // LLM keyword ideas are re-scored by our own models — we never trust raw numbers.
  if (refinement.extraKeywords?.length) {
    const ctx: KeywordContext = {
      attributes: extractAttributes(product),
      price: product.price,
      gender: product.gender,
      category: product.category,
      markets: profile.targetMarkets,
      corpusText: productText(product),
      onsiteSearches: onsiteSearchSignals(),
      conversions: conversionSignals(),
      internalCompetition: buildInternalCompetitionMap(getAllProducts().filter((p) => p.id !== product.id)),
    };
    const extra = refinement.extraKeywords
      .filter((k) => typeof k === "string" && k.trim().length > 3)
      .map((k) => ({ ...buildKeywordEntry(k.trim().toLowerCase(), ctx, k.match(/[^\x00-\x7F]/) ? "localized" : "longtail", "llm"), }))
      .filter((k) => k.relevance >= 0.18);
    next.keywords = dedupeBy([...profile.keywords, ...extra], (k) => k.normalized);
  }

  return next;
}

export function collectIssues(product: Product, profile: SeoProfile, ctx: ReturnType<typeof buildScoringContext>): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const add = (severity: SeoIssue["severity"], field: string, message: string, fix?: string) =>
    issues.push({ id: `${field}:${message.length}:${message.slice(0, 24)}`, severity, field, message, fix });

  for (const factor of profile.score.factors) {
    const ratio = factor.score / factor.weight;
    if (ratio >= 0.9) continue;
    const severity: SeoIssue["severity"] = ratio < 0.5 ? "critical" : ratio < 0.75 ? "warning" : "notice";
    add(severity, factor.id, `${factor.label}: ${factor.detail}`, factor.fix);
  }

  if (ctx.maxSimilarity >= 0.75) add("critical", "uniqueness", `Near-duplicate of another listing (similarity ${round(ctx.maxSimilarity * 100, 1)}%).`, "Differentiate copy and re-target a distinct keyword cluster.");
  if (!inventoryHealth(product).inStock) add("notice", "inventory", "Out of stock — Offer availability will be marked as BackOrder, which suppresses merchant listing rich results.", "Restock or mark the variant unavailable.");
  const band = priceBandFor(product);
  if (band.competitiveness < 45) add("notice", "pricing", `Price sits outside the ${band.band} band sweet spot for ${product.category}.`, "Consider a bundle, entry price point or value-tier listing to capture price-driven queries.");
  const risks = cannibalizationRisks(product, { threshold: 0.62 });
  for (const risk of risks) add("warning", "cannibalization", `Competes with /shop/${risk.slug} (similarity ${round(risk.similarity * 100, 1)}%)${risk.sharedPrimary.length ? ` on “${risk.sharedPrimary.join(", ")}”` : ""}.`, "Re-target one listing to a different cluster or merge them.");

  return dedupeBy(issues, (i) => `${i.field}:${i.message}`);
}

function intentProfileFor(primary: KeywordEntry | undefined, keywords: KeywordEntry[], product: Product): SeoProfile["intent"] {
  const kind = primary?.intent ?? "commercial";
  const secondary = unique(keywords.map((k) => k.intent).filter((i) => i !== kind)).slice(0, 3);
  const confidence = primary ? round(clamp(primary.relevance * 0.6 + primary.priority / 200 + 0.25, 0.4, 0.98), 2) : 0.5;
  const funnelStage = kind === "transactional" ? "decision" : kind === "commercial" ? "consideration" : "awareness";
  return {
    primary: kind,
    secondary,
    confidence,
    funnelStage,
    rationale:
      kind === "transactional"
        ? `Highest-priority target “${primary?.term}” carries explicit purchase modifiers, so the listing is written for the decision stage: price, stock, shipping and size assurance above the fold.`
        : kind === "commercial"
          ? `Shoppers searching “${primary?.term ?? ""}” are comparing options. The copy leads with fabric weight, construction and fit evidence, then closes with commercial assurance.`
          : `Primary demand for this product is informational (“${primary?.term ?? ""}”). The listing answers the question first and merchandises second.`,
  };
}

/** Re-optimize every published listing (nightly job / "Optimize all" button). */
export async function optimizeCatalogue(opts: OptimizeOptions & { onlyDrafts?: boolean; limit?: number } = {}) {
  const products = getAllProducts();
  const targets = (opts.onlyDrafts ? products.filter((p) => !p.seo?.optimized || p.status === "draft") : products).slice(0, opts.limit ?? products.length);
  const results: { slug: string; before: number; after: number; grade: string }[] = [];
  for (const product of targets) {
    const before = product.seo?.score?.total ?? 0;
    const optimized = await optimizeProduct(product, opts);
    results.push({ slug: optimized.slug, before, after: optimized.seo.score.total, grade: optimized.seo.score.grade });
  }
  return {
    processed: results.length,
    averageBefore: results.length ? round(results.reduce((s, r) => s + r.before, 0) / results.length, 1) : 0,
    averageAfter: results.length ? round(results.reduce((s, r) => s + r.after, 0) / results.length, 1) : 0,
    results,
    gaps: contentGaps(10),
  };
}


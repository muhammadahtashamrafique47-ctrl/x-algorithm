import type { KeywordEntry, SearchIntentKind, CountryCode, Gender } from "@/lib/types";
import { HEAD_TERMS, MODIFIERS, QUESTION_TEMPLATES, SERP_FEATURES, SEMANTIC_TERMS } from "@/lib/seo/lexicon";
import { MARKET_BY_COUNTRY, rankMarketsFor } from "@/lib/i18n/markets";
import {
  clamp, contentWords, cosine, dedupeBy, round, seededRandom, stem, tokenize, tfidfVector, buildIdf,
} from "@/lib/seo/text";

export type KeywordContext = {
  /** Attribute buckets extracted from the product (silhouette, material, color, ...) */
  attributes: Record<string, string[]>;
  price: number;
  gender?: Gender;
  category?: string;
  collections?: string[];
  markets?: CountryCode[];
  month?: number;
  /** normalized keyword -> number of internal products already targeting it */
  internalCompetition?: Record<string, number>;
  /** on-site search query -> count (first-party intent signal) */
  onsiteSearches?: Record<string, number>;
  /** keyword -> purchases attributed on-site */
  conversions?: Record<string, number>;
  /** attribute phrase -> salience 0..1 (title matches outweigh colourways) */
  attributeSalience?: Record<string, number>;
  /** free text describing the product, used for relevance scoring */
  corpusText?: string;
};

const INTENT_MULTIPLIER: Record<SearchIntentKind, number> = {
  transactional: 1.35,
  commercial: 1.2,
  local: 1.05,
  informational: 0.75,
  navigational: 0.6,
};

const TRANSACTIONAL_TOKENS = ["buy", "order", "shop", "sale", "deal", "discount", "cheap", "price", "prices", "free shipping", "delivery", "near me", "online", "under", "custom", "wholesale", "add to cart", "checkout"];
const COMMERCIAL_TOKENS = ["best", "top", "review", "reviews", "vs", "compare", "worth", "premium", "luxury", "quality", "rated"];
const INFORMATIONAL_TOKENS = ["how", "what", "why", "when", "which", "guide", "tips", "ideas", "style", "meaning", "shrinking", "wash", "care", "fit", "gsm", "difference"];
const LOCAL_TOKENS = ["near me", "store", "shop near", "outlet", "local", "city", "karachi", "lahore", "london", "new york", "dubai", "berlin", "tokyo"];

export function classifyIntent(term: string): SearchIntentKind {
  const t = term.toLowerCase();
  if (LOCAL_TOKENS.some((x) => t.includes(x))) return "local";
  if (INFORMATIONAL_TOKENS.some((x) => t.includes(x))) return "informational";
  if (TRANSACTIONAL_TOKENS.some((x) => t.includes(x))) return "transactional";
  if (COMMERCIAL_TOKENS.some((x) => t.includes(x))) return "commercial";
  // Product-noun queries in apparel are overwhelmingly commercial-investigation.
  return t.split(/\s+/).length >= 3 ? "transactional" : "commercial";
}

function matchHead(term: string): { volume: number; competition: number; term: string } {
  const t = term.toLowerCase();
  let best = { volume: 9_000, competition: 45, term: "" };
  for (const head of HEAD_TERMS) {
    if (head.volume === 0) continue;
    if (t.includes(head.term) && head.volume > best.volume) best = head;
  }
  if (!best.term) {
    if (t.includes("hood")) best = { volume: 400_000, competition: 86, term: "hoodie" };
    else if (t.includes("sweat")) best = { volume: 220_000, competition: 78, term: "sweatshirt" };
    else if (t.includes("zip")) best = { volume: 120_000, competition: 70, term: "zip up hoodie" };
  }
  return best;
}

function matchedModifiers(term: string): { dimension: string; weight: number; competition: number; intentBoost?: number; term: string }[] {
  const t = ` ${term.toLowerCase()} `;
  const found: { dimension: string; weight: number; competition: number; intentBoost?: number; term: string }[] = [];
  for (const [dimension, list] of Object.entries(MODIFIERS)) {
    for (const mod of list) {
      if (t.includes(` ${mod.term} `) || t.includes(` ${mod.term}`) && mod.term.includes(" ")) {
        if (t.includes(mod.term)) found.push({ dimension, ...mod });
      }
    }
  }
  return found;
}

/** Round volumes the way keyword tools bucket them. */
function bucketVolume(v: number): number {
  if (v < 10) return Math.max(0, Math.round(v));
  if (v < 100) return Math.round(v / 10) * 10;
  if (v < 1_000) return Math.round(v / 50) * 50;
  if (v < 10_000) return Math.round(v / 100) * 100;
  if (v < 100_000) return Math.round(v / 1_000) * 1_000;
  return Math.round(v / 10_000) * 10_000;
}

export function marketVolumeFactor(markets: CountryCode[] = []): number {
  if (!markets.length) return 1;
  const total = markets.reduce((sum, code) => {
    const m = MARKET_BY_COUNTRY[code.toUpperCase()];
    if (!m) return sum;
    return sum + (m.demandIndex / 100) * Math.log10(m.populationM + 10) * (m.ecommerceIndex / 100);
  }, 0);
  const usBaseline = (100 / 100) * Math.log10(335 + 10) * (96 / 100);
  return clamp(total / (usBaseline * Math.max(1, markets.length)) * markets.length * 0.45, 0.04, 1.4);
}

export function estimateVolume(term: string, ctx: Partial<KeywordContext> = {}): number {
  const head = matchHead(term);
  const mods = matchedModifiers(term);
  const tokens = contentWords(term);

  // A curated head term is a query whose volume we already know — trust it
  // instead of re-deriving it from modifiers.
  const stemmed = tokens.map(stem).join(" ");
  const exact = HEAD_TERMS.find((h) => h.volume > 0 && tokenize(h.term).map(stem).join(" ") === stemmed);
  if (exact) {
    return bucketVolume(clamp(exact.volume * marketVolumeFactor(ctx.markets) * (0.94 + seededRandom(`vol:${term}`) * 0.14), 0, 2_500_000));
  }

  // Calibrated decay: each modifier multiplies volume down by a factor derived
  // from its observed popularity, with a sharper exponent so niche modifiers
  // (hiking, bamboo, petite) collapse the way real long-tails do.
  const modifierFactor = (weight: number) => clamp(0.03 + weight / 900, 0.03, 0.2) * Math.pow(clamp(weight / 100, 0.02, 1), 1.6);

  let factor = 1;
  mods.forEach((mod, index) => {
    factor *= modifierFactor(mod.weight) * (index === 0 ? 1 : 0.55);
  });

  // Tokens that are not modelled modifiers (brand names, place names, odd words)
  // narrow the query further.
  // Tokens that no modifier list explains (brand jargon, invented words) collapse
  // the query hard — nobody searches for them. Multi-word modifiers consume more
  // than one token, so count tokens rather than modifier entries.
  const modelledTokens = mods.reduce((sum, mod) => sum + tokenize(mod.term).length, 0);
  const unmodelled = Math.max(0, tokens.length - 1 - modelledTokens);
  factor *= Math.pow(0.03, unmodelled);

  const jitter = 0.88 + seededRandom(`vol:${term}`) * 0.28;
  const market = marketVolumeFactor(ctx.markets);
  const intent = INTENT_MULTIPLIER[classifyIntent(term)];
  const intentPull = 0.6 + intent * 0.3;

  // First-party signals lift estimates for terms we have observed converting.
  const onsite = ctx.onsiteSearches?.[term.toLowerCase()] ?? 0;
  const conversions = ctx.conversions?.[term.toLowerCase()] ?? 0;
  const firstPartyBoost = 1 + Math.min(0.5, onsite / 500) + Math.min(0.8, conversions / 50);

  const volume = head.volume * factor * jitter * market * intentPull * firstPartyBoost;
  return bucketVolume(clamp(volume, 0, 2_500_000));
}

export function estimateDifficulty(term: string, ctx: Partial<KeywordContext> = {}): number {
  const head = matchHead(term);
  const mods = matchedModifiers(term);
  const tokens = contentWords(term);

  let difficulty = head.competition * 0.72;
  if (mods.length) difficulty += mods.reduce((s, m) => s + m.competition, 0) / mods.length * 0.28;
  // Long-tail queries are easier: specificity dilutes competition.
  difficulty -= Math.max(0, tokens.length - 2) * 5.5;
  const intent = classifyIntent(term);
  if (intent === "transactional") difficulty += 6;
  if (intent === "local") difficulty += 3;
  if (intent === "informational") difficulty -= 9;

  const marketComp = ctx.markets?.length
    ? ctx.markets.reduce((s, c) => s + (MARKET_BY_COUNTRY[c.toUpperCase()]?.ecommerceIndex ?? 60), 0) /
      ctx.markets.length
    : 70;
  difficulty += (marketComp - 70) * 0.18;

  const jitter = (seededRandom(`diff:${term}`) - 0.5) * 7;
  return Math.round(clamp(difficulty + jitter, 1, 98));
}

export function estimateCpc(term: string, ctx: Partial<KeywordContext> = {}): number {
  const difficulty = estimateDifficulty(term, ctx);
  const intent = classifyIntent(term);
  const marketFactor = ctx.markets?.length
    ? clamp(
        ctx.markets.reduce((s, c) => s + (MARKET_BY_COUNTRY[c.toUpperCase()]?.basketUsd ?? 55), 0) /
          ctx.markets.length / 55,
        0.35, 1.8,
      )
    : 1;
  const base = 0.18 + (difficulty / 100) ** 1.6 * 2.4;
  return round(base * INTENT_MULTIPLIER[intent] * marketFactor, 2);
}

/** Month-by-month demand index (0-200, 100 = average) for a term in target markets. */
export function seasonalityCurve(term: string, ctx: Partial<KeywordContext> = {}): { month: number; index: number }[] {
  const markets = (ctx.markets?.length ? ctx.markets : rankMarketsFor(new Date().getMonth()).slice(0, 4).map((m) => m.country))
    .map((c) => MARKET_BY_COUNTRY[c.toUpperCase()])
    .filter(Boolean);

  const t = term.toLowerCase();
  const seasonalBias: Record<number, number> = {};
  const bump = (month: number, amount: number) => {
    seasonalBias[month] = (seasonalBias[month] ?? 0) + amount;
  };

  for (const m of markets) {
    for (const month of m.coldMonths) bump(month, 14);
    for (const event of m.shoppingEvents) bump(event.month, event.weight * 0.22);
  }

  if (t.includes("winter")) for (const mo of [10, 11, 0, 1]) bump(mo, 40);
  if (t.includes("summer")) for (const mo of [5, 6, 7]) bump(mo, 34);
  if (t.includes("fall") || t.includes("autumn")) for (const mo of [8, 9, 10]) bump(mo, 30);
  if (t.includes("christmas") || t.includes("gift")) for (const mo of [10, 11]) bump(mo, 46);
  if (t.includes("lightweight") || t.includes("gym")) for (const mo of [0, 1, 3, 4]) bump(mo, 18);
  if (t.includes("back to school") || t.includes("school")) for (const mo of [7, 8]) bump(mo, 28);

  // Southern-hemisphere inversion when the query is AU/BR/ZA specific.
  const southern = markets.some((m) => m.hemisphere === "south");
  const out: { month: number; index: number }[] = [];
  for (let month = 0; month < 12; month++) {
    const effective = southern ? (month + 6) % 12 : month;
    const base = 100 + (seasonalBias[effective] ?? 0);
    const noise = (seededRandom(`season:${term}:${month}`) - 0.5) * 8;
    out.push({ month, index: Math.round(clamp(base + noise, 25, 260)) });
  }
  return out;
}

export function trendScore(term: string, ctx: Partial<KeywordContext> = {}): number {
  const curve = seasonalityCurve(term, ctx);
  const now = ctx.month ?? new Date().getMonth();
  const next = (now + 1) % 12;
  const recent = (curve[now]?.index ?? 100) * 0.6 + (curve[next]?.index ?? 100) * 0.4;

  const emerging = ["oversized", "boxy", "tech", "vintage", "recycled", "organic", "puff print", "acid wash", "half zip"];
  const t = term.toLowerCase();
  const emergingBoost = emerging.some((e) => t.includes(e)) ? 22 : 0;
  const decline = ["tie dye", "sherpa"].some((e) => t.includes(e)) ? -14 : 0;
  const noise = (seededRandom(`trend:${term}`) - 0.5) * 14;

  return Math.round(clamp((recent - 100) * 0.7 + emergingBoost + decline + noise, -80, 95));
}

export function serpFeaturesFor(term: string): string[] {
  const t = term.toLowerCase();
  const intent = classifyIntent(term);
  const features = new Set<string>();
  if (intent === "transactional" || intent === "commercial") {
    features.add("shopping ads");
    features.add("product listing");
    if (t.includes("best") || t.includes("review")) features.add("reviews snippet");
  }
  if (intent === "informational") {
    features.add("people also ask");
    if (t.startsWith("how") || t.startsWith("what")) features.add("featured snippet");
  }
  if (["fit", "size", "gsm", "wash", "care"].some((x) => t.includes(x))) features.add("size chart rich result");
  if (["style", "outfit", "look"].some((x) => t.includes(x))) features.add("image pack");
  if (intent === "local") features.add("local pack");
  if (t.includes("vs") || t.includes("compare")) features.add("video carousel");
  if (t.split(/\s+/).length >= 4) features.add("faq");
  return [...features].filter((f) => SERP_FEATURES.includes(f)).slice(0, 5);
}

/** Cosine relevance of a candidate keyword to the product's own text. */
export function relevanceTo(term: string, ctx: Partial<KeywordContext>): number {
  const corpus = ctx.corpusText ?? Object.values(ctx.attributes ?? {}).flat().join(" ");
  const idf = buildIdf([corpus, term, ...Object.keys(MODIFIERS)]);
  const a = tfidfVector(term, idf);
  const b = tfidfVector(corpus, idf);
  const semantic = cosine(a, b);

  const attributeTokens = new Set(Object.values(ctx.attributes ?? {}).flat().map((x) => stem(x)));
  const termStems = contentWords(term).map(stem);
  const overlap = termStems.filter((s) => attributeTokens.has(s)).length / Math.max(1, termStems.length);

  return round(clamp(semantic * 0.6 + overlap * 0.55, 0, 1), 3);
}

/**
 * How likely a composed query is to be something a human actually types.
 *
 * Combinatorial expansion can produce grammatically valid nonsense; this
 * dampens those candidates so they never become a primary target or end up in
 * a title tag.
 */
export function plausibility(term: string): number {
  const tokens = contentWords(term);
  const mods = matchedModifiers(term);
  const hasHead = /(hoodie|hoodies|sweatshirt|pullover|zip)/.test(term);

  const headIsLast = /(hoodies?|sweatshirts?|pullover|pullovers)$/.test(term);
  const hasPreposition = /\b(for|with|and|under|over|near|in)\b/.test(term);

  let score = tokens.length <= 2 ? 1 : tokens.length === 3 ? 0.93 : tokens.length === 4 ? 0.8 : tokens.length === 5 ? 0.62 : 0.4;
  if (!hasHead) score *= 0.72;
  if (mods.length > 2) score *= 0.75;
  // "hoodie heavyweight" is not how people type — the product noun leads the query
  // unless a preposition explains the trailing modifier ("hoodie for men").
  if (!headIsLast && !hasPreposition && tokens.length > 1) score *= 0.55;
  if (hasPreposition && tokens.length > 5) score *= 0.8;
  return clamp(round(score, 3), 0.1, 1);
}

export function priorityScore(entry: Omit<KeywordEntry, "priority"> & { internalCompetition?: number }): number {
  // Rescaled so a 10x volume difference actually moves the ranking: a 32k/mo
  // term must beat a 2.5k/mo term on volume alone, even when the smaller one
  // looks more transactional.
  const volumeScore = clamp((Math.log10(Math.max(10, entry.volume)) - 1) / 5, 0, 1); // 10 -> 0, 1M+ -> 1
  const difficultyScore = (100 - entry.difficulty) / 100;
  const intentScore = INTENT_MULTIPLIER[entry.intent] / 1.35;
  const relevanceScore = entry.relevance;
  const trendFactor = clamp(0.5 + entry.trend / 120, 0.2, 1.3);
  const onsiteSignal = entry.source === "onsite-search" ? 1.14 : entry.source === "conversion-log" ? 1.22 : 1;
  const cannibalizationPenalty = entry.internalCompetition && entry.internalCompetition > 1 ? 0.86 : 1;

  const raw =
    volumeScore * 34 +
    difficultyScore * 18 +
    intentScore * 12 +
    relevanceScore * 26 +
    10 * trendFactor;

  // Product-page fit: a PDP should target terms with a concrete product
  // modifier. Audience-only queries ("hoodie for men") belong on collection
  // pages, so they are damped here to stop them hijacking the primary target.
  const PRODUCT_DIMENSIONS = new Set(["silhouette", "style", "material", "color", "construction", "season", "use", "priceBand"]);
  const specific = matchedModifiers(entry.term).some((mod) => PRODUCT_DIMENSIONS.has(mod.dimension));
  const pageFit = specific ? 1 : 0.82;

  // A curated head term is a query we know exists at scale, not a composed guess.
  const knownQuery = KNOWN_QUERIES.has(tokenize(entry.term).map(stem).join(" ")) ? 1.18 : 1;

  return Math.round(clamp(raw * onsiteSignal * cannibalizationPenalty * plausibility(entry.term) * pageFit * knownQuery, 0, 100));
}

/**
 * Attribute salience: the strongest match between a candidate term and the
 * product's defining attributes. Terms built from the product name, category or
 * fabric outrank terms built from a single colourway or an incidental use case,
 * which is how a real SEO lead would pick a primary target by hand.
 */
export function attributeSalienceFor(term: string, ctx: Partial<KeywordContext>): number {
  const map = ctx.attributeSalience;
  if (!map) return 1;
  const t = ` ${tokenize(term).join(" ")} `;
  let best = 0;
  for (const [phrase, weight] of Object.entries(map)) {
    const needle = tokenize(phrase).join(" ");
    if (needle && t.includes(` ${needle} `)) best = Math.max(best, weight);
  }
  return round(best, 3);
}

export function buildKeywordEntry(
  term: string,
  ctx: Partial<KeywordContext>,
  kind: KeywordEntry["kind"],
  source: KeywordEntry["source"],
): KeywordEntry {
  const normalized = tokenize(term).join(" ");
  const intent = classifyIntent(normalized);
  const volume = estimateVolume(normalized, ctx);
  const difficulty = estimateDifficulty(normalized, ctx);
  const trend = trendScore(normalized, ctx);
  const relevance = relevanceTo(normalized, ctx);
  const internalCompetition = ctx.internalCompetition?.[normalized] ?? 0;
  const salience = attributeSalienceFor(normalized, ctx);

  const entry: Omit<KeywordEntry, "priority"> & { internalCompetition?: number } = {
    term: normalized,
    normalized,
    kind,
    intent,
    volume,
    difficulty,
    cpc: estimateCpc(normalized, ctx),
    relevance,
    trend,
    seasonality: seasonalityCurve(normalized, ctx),
    markets: ctx.markets ?? [],
    serpFeatures: serpFeaturesFor(normalized),
    source,
    internalCompetition,
    salience,
  };

  // Salience only applies when the caller supplied product attributes — the
  // standalone research tool has nothing to be salient against.
  const salienceSignal = ctx.attributeSalience ? 0.55 + 0.6 * salience : 1;

  return { ...entry, priority: Math.round(clamp(priorityScore(entry) * salienceSignal, 0, 100)) };
}

/** Extract attribute buckets from a product so expansion is grounded in real data. */
export function extractAttributes(input: {
  title: string;
  category?: string;
  collections?: string[];
  material?: string;
  fit?: string;
  gender?: Gender;
  colors?: { name: string }[];
  features?: string[];
  tags?: string[];
  weightGsm?: number;
}): Record<string, string[]> {
  const text = [input.title, input.category, input.material, input.fit, ...(input.features ?? []), ...(input.tags ?? []), ...(input.collections ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const attributes: Record<string, string[]> = {};
  for (const [dimension, list] of Object.entries(MODIFIERS)) {
    const hits = list.filter((m) => text.includes(m.term)).map((m) => m.term);
    if (hits.length) attributes[dimension] = [...new Set(hits)];
  }
  const colorHits = (input.colors ?? []).map((c) => c.name.toLowerCase());
  attributes.color = [...new Set([...(attributes.color ?? []), ...colorHits])];
  if (input.gender && input.gender !== "unisex") {
    attributes.audience = [...new Set([...(attributes.audience ?? []), input.gender])];
  }
  const gsm = input.weightGsm;
  if (gsm) {
    attributes.silhouette = [
      ...(attributes.silhouette ?? []),
      gsm >= 400 ? "heavyweight" : gsm >= 300 ? "midweight" : "lightweight",
    ];
  }
  return attributes;
}

function fillTemplate(template: string, attributes: Record<string, string[]>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const options = attributes[key];
    if (!options?.length) return "";
    return options[Math.floor(seededRandom(`${template}:${key}`) * options.length) % options.length];
  });
}

/**
 * Core keyword research routine.
 *
 * Composes head terms × attribute modifiers × intent modifiers × market terms
 * × question templates, then scores every candidate with the volume / difficulty
 * / CPC / trend / relevance models above. First-party signals (on-site search,
 * attributed conversions) and internal cannibalization are folded into priority.
 */
export function expandKeywords(
  ctx: KeywordContext,
  opts: { limit?: number; includeQuestions?: boolean; includeLocalized?: boolean; includeSeasonal?: boolean } = {},
): KeywordEntry[] {
  const limit = opts.limit ?? 120;
  const attributes = ctx.attributes;
  const candidates = new Map<string, KeywordEntry>();
  const push = (term: string, kind: KeywordEntry["kind"], source: KeywordEntry["source"]) => {
    const clean = term.replace(/\s+/g, " ").trim().replace(/\s{2,}/g, " ");
    if (!clean || clean.length < 4) return;
    const key = tokenize(clean).join(" ");
    if (candidates.has(key)) return;
    candidates.set(key, buildKeywordEntry(clean, ctx, kind, source));
  };

  const head = ctx.category === "zip-up" ? "zip up hoodie" : "hoodies";
  const singular = ctx.category === "zip-up" ? "zip up hoodie" : "hoodie";
  push(singular, "primary", "ai-expansion");
  push(head, "primary", "ai-expansion");

  // 1. Attribute-driven combinations.
  //
  // Only modifier pairs that shoppers actually type together are composed —
  // an unrestricted cross-product generates plausible-looking nonsense
  // ("hiking pine hoodie") that would poison both the keyword list and the
  // title the optimizer writes from it.
  const PAIRS: [string, string][] = [
    ["silhouette", "style"], ["silhouette", "material"], ["silhouette", "audience"], ["silhouette", "color"],
    ["style", "material"], ["style", "audience"], ["style", "season"], ["style", "use"], ["style", "color"],
    ["material", "audience"], ["material", "season"], ["material", "use"], ["material", "color"],
    ["audience", "season"], ["audience", "use"],
    ["season", "color"], ["use", "color"],
  ];

  const pick = (dimension: string, limit = 3) => (attributes[dimension] ?? []).slice(0, limit);
  const audienceFor = (audience: string) => (audience === "unisex" ? "unisex" : audience);

  // Single-modifier terms first (the highest-volume long-tails).
  for (const dimension of ["silhouette", "style", "material", "season", "use", "color"]) {
    for (const value of pick(dimension, 4)) push(`${value} ${singular}`, "longtail", "ai-expansion");
  }
  for (const value of pick("audience", 3)) {
    if (value === "unisex") {
      push(`unisex ${singular}`, "longtail", "ai-expansion");
      push(`unisex ${head}`, "longtail", "ai-expansion");
      continue;
    }
    // Both real patterns: the prefixed form ("kids hoodie", "womens hoodie") and
    // the prepositional form ("hoodie for kids").
    const prefixed = value === "men" ? "mens" : value === "women" ? "womens" : value;
    push(`${prefixed} ${singular}`, "longtail", "ai-expansion");
    push(`${prefixed} ${head}`, "longtail", "ai-expansion");
    push(`${singular} for ${value}`, "longtail", "ai-expansion");
    push(`${head} for ${value}`, "longtail", "ai-expansion");
  }

  // Two-modifier terms from the whitelist only.
  for (const [left, right] of PAIRS) {
    for (const a of pick(left, 2)) {
      for (const b of pick(right, 2)) {
        if (a === b) continue;
        const phrase = `${a} ${b} ${singular}`;
        if (contentWords(phrase).length <= 5) push(phrase, "longtail", "ai-expansion");
        if (right === "audience") {
          const audience = audienceFor(b);
          const alt = audience === "unisex" ? `${a} unisex ${singular}` : `${a} ${singular} for ${audience}`;
          if (contentWords(alt).length <= 6) push(alt, "longtail", "ai-expansion");
        }
      }
    }
  }

  // Colour-first terms ("black oversized hoodie") are a distinct, high-volume pattern.
  for (const color of pick("color", 3)) {
    push(`${color} ${singular}`, "longtail", "ai-expansion");
    for (const silhouette of pick("silhouette", 2)) push(`${color} ${silhouette} ${singular}`, "longtail", "ai-expansion");
    for (const style of pick("style", 2)) push(`${color} ${style} ${singular}`, "longtail", "ai-expansion");
  }

  // 1b. Novel attributes: words the merchant put in the product name that no
  // modifier list knows about ("alpaca", "packable", "varsity"). They are real
  // demand signals, so they get modelled as low-volume long-tails rather than
  // being silently dropped.
  for (const [phrase, weight] of Object.entries(ctx.attributeSalience ?? {})) {
    if (weight < 0.85) continue;
    const clean = phrase.trim();
    if (!clean || clean.length < 3 || contentWords(clean).length > 3) continue;
    if (matchedModifiers(clean).length) continue; // already covered by the lexicon
    if (/^(studio|junior|explorer|summit|meridian|atlas|coastal|nocturne|terra|grid|heritage|basecamp|nightshift|aurora|cobalt|nimbus)$/i.test(clean)) {
      // Model names still get a branded long-tail, at lower priority.
      push(`${clean} ${singular}`, "longtail", "ai-expansion");
      continue;
    }
    push(`${clean} ${singular}`, "longtail", "ai-expansion");
    if (contentWords(clean).length === 1) push(`${clean} ${head}`, "longtail", "ai-expansion");
  }

  // 2. Commercial intent overlay.
  for (const mod of MODIFIERS.commercial.slice(0, 9)) {
    const attrs = (attributes.silhouette ?? []).concat(attributes.style ?? [], attributes.material ?? []).slice(0, 3);
    push(`${mod.term} ${head}`, "longtail", "ai-expansion");
    for (const a of attrs) push(`${mod.term} ${a} ${head}`, "longtail", "ai-expansion");
    push(`${head} ${mod.term}`, "longtail", "ai-expansion");
  }

  // 3. Price band overlay grounded in the actual price point.
  const bands = [20, 30, 50, 100].filter((b) => ctx.price < b * 1.35);
  for (const band of bands.slice(-2)) push(`${head} under ${band}`, "longtail", "ai-expansion");
  for (const mod of MODIFIERS.priceBand) if (bands.includes(Number(mod.term.split(" ")[1]))) push(`${mod.term} ${head}`, "longtail", "ai-expansion");

  // 4. Market / geo terms (global visibility requirement).
  for (const market of (ctx.markets ?? []).slice(0, 8)) {
    const profile = MARKET_BY_COUNTRY[market.toUpperCase()];
    if (!profile) continue;
    const geoWord = profile.country === "US" ? "usa" : profile.name.toLowerCase();
    push(`${singular} ${geoWord}`, "longtail", "ai-expansion");
    push(`buy ${head} online ${geoWord}`, "longtail", "ai-expansion");
    for (const native of profile.lexicon.hoodie ?? []) {
      if (native.toLowerCase() !== "hoodie") push(native, "localized", "ai-expansion");
      if (native.toLowerCase() !== "hoodie") push(`${native} ${geoWord}`, "localized", "ai-expansion");
    }
  }

  // 5. Question terms (People-Also-Ask / FAQ rich results).
  if (opts.includeQuestions !== false) {
    for (const q of QUESTION_TEMPLATES) {
      const filled = fillTemplate(q.template, attributes).replace(/\s+/g, " ").trim();
      if (!/\{|\}/.test(filled) && filled.split(" ").length > 2) push(filled, "question", "ai-expansion");
    }
    const attrs = [...(attributes.silhouette ?? []), ...(attributes.material ?? []), ...(attributes.style ?? [])].slice(0, 3);
    for (const a of attrs) {
      push(`what is a ${a} ${singular}`, "question", "ai-expansion");
      push(`how to style a ${a} ${singular}`, "question", "ai-expansion");
      push(`are ${a} ${head} worth it`, "question", "ai-expansion");
    }
    push(`how should a ${singular} fit`, "question", "ai-expansion");
    push(`what gsm ${singular} is warmest`, "question", "ai-expansion");
  }

  // 6. Seasonal / event terms for the current and next month in target markets.
  if (opts.includeSeasonal !== false) {
    const month = ctx.month ?? new Date().getMonth();
    const activeMarkets = (ctx.markets?.length ? ctx.markets : rankMarketsFor(month).slice(0, 5).map((m) => m.country))
      .map((c) => MARKET_BY_COUNTRY[c.toUpperCase()])
      .filter(Boolean);
    for (const market of activeMarkets) {
      for (const event of market.shoppingEvents) {
        if (event.month === month || event.month === (month + 1) % 12 || event.weight >= 80) {
          const name = event.name.toLowerCase();
          push(`${name} ${singular} deals`, "seasonal", "ai-expansion");
          push(`${head} for ${name}`, "seasonal", "ai-expansion");
        }
      }
      for (const cold of market.coldMonths) {
        if (cold === month) {
          push(`winter ${singular} ${market.country === "US" ? "" : market.name.toLowerCase()}`.trim(), "seasonal", "ai-expansion");
        }
      }
    }
  }

  // 7. First-party signals: on-site searches and converting queries.
  for (const [query, count] of Object.entries(ctx.onsiteSearches ?? {})) {
    if (count >= 2) push(query, "longtail", "onsite-search");
  }
  for (const [query, purchases] of Object.entries(ctx.conversions ?? {})) {
    if (purchases >= 1) push(query, "longtail", "conversion-log");
  }

  // 8. Semantic / entity terms so the listing satisfies topical depth.
  for (const group of Object.values(SEMANTIC_TERMS)) {
    for (const term of group) {
      if ((ctx.corpusText ?? "").toLowerCase().includes(term)) push(`${term} ${singular}`, "semantic", "ai-expansion");
    }
  }

  const all = [...candidates.values()].sort((a, b) => b.priority - a.priority || b.volume - a.volume);
  return dedupeBy(all, (k) => k.normalized).slice(0, limit);
}

/** Cluster keywords into topic groups (used for collection pages + content hubs). */
export function clusterKeywords(keywords: KeywordEntry[]): { cluster: string; keywords: KeywordEntry[]; volume: number }[] {
  const clusters = new Map<string, KeywordEntry[]>();
  for (const kw of keywords) {
    const signature = contentWords(kw.term)
      .map(stem)
      .filter((t) => !["hoodi", "hoodies", "sweatshirt", "pullover", "zip"].includes(t))
      .sort()[0] ?? "general";
    const list = clusters.get(signature) ?? [];
    list.push(kw);
    clusters.set(signature, list);
  }
  return [...clusters.entries()]
    .map(([cluster, list]) => ({
      cluster,
      keywords: list.sort((a, b) => b.priority - a.priority),
      volume: list.reduce((s, k) => s + k.volume, 0),
    }))
    .sort((a, b) => b.volume - a.volume);
}

/** Localized variants of a keyword for a specific market (native lexicon + geo terms). */
export function localizeKeyword(term: string, country: CountryCode): string[] {
  const market = MARKET_BY_COUNTRY[country.toUpperCase()];
  if (!market) return [];
  const out = new Set<string>();
  const base = term.replace(/hoodies?|hooded sweatshirts?/gi, "").trim();
  for (const native of market.lexicon.hoodie ?? []) {
    out.add(native.toLowerCase());
    if (base) out.add(`${native.toLowerCase()} ${base}`.replace(/\s+/g, " ").trim());
  }
  const geo = market.country === "US" ? "usa" : market.name.toLowerCase();
  out.add(`${term} ${geo}`.replace(/\s+/g, " "));
  return [...out].filter(Boolean);
}

export type KeywordResearchRequest = {
  seed: string;
  markets?: CountryCode[];
  month?: number;
  limit?: number;
  intent?: SearchIntentKind | "all";
  maxDifficulty?: number;
  minVolume?: number;
  sort?: "priority" | "volume" | "difficulty" | "trend" | "cpc";
};

/** Stemmed forms of the curated head terms — real, verified queries. */
const KNOWN_QUERIES = new Set(HEAD_TERMS.filter((h) => h.volume > 0).map((h) => tokenize(h.term).map(stem).join(" ")));

/** Modifiers people really do type after the product noun. */
const REVERSED_OK = new Set([
  "sale", "deals", "near me", "online", "cheap", "best", "luxury", "premium",
  "for men", "for women", "uk", "usa", "winter", "summer", "under 50", "under 100",
]);

/**
 * Standalone keyword research (powers /admin/keywords and /api/keywords).
 * Works from any seed, not only from an existing product.
 */
export function keywordResearch(req: KeywordResearchRequest, baseCtx: Partial<KeywordContext> = {}): KeywordEntry[] {
  const seed = req.seed.trim().toLowerCase();
  if (!seed) return [];
  const markets = req.markets?.length ? req.markets : rankMarketsFor(req.month ?? new Date().getMonth()).slice(0, 6).map((m) => m.country);
  const ctx: Partial<KeywordContext> = {
    ...baseCtx,
    markets,
    month: req.month,
    corpusText: baseCtx.corpusText ?? seed,
  };

  const results = new Map<string, KeywordEntry>();
  const add = (term: string, kind: KeywordEntry["kind"]) => {
    const clean = term.replace(/\s+/g, " ").trim();
    const key = tokenize(clean).join(" ");
    if (!key || results.has(key)) return;
    results.set(key, buildKeywordEntry(clean, ctx, kind, "ai-expansion"));
  };

  add(seed, "primary");
  add(`${seed}s`, "primary");

  // Cross the seed with every modifier dimension.
  for (const [dimension, list] of Object.entries(MODIFIERS)) {
    if (seed.includes(dimension)) continue;
    for (const mod of list) {
      if (seed.includes(mod.term)) continue;
      add(`${mod.term} ${seed}`, "longtail");
      // Reversed word order is only a real query pattern for a handful of
      // commercial and locational modifiers.
      if (REVERSED_OK.has(mod.term) || /\b(sale|deals|near me|online|cheap|best|under|for|uk|usa)\b/.test(mod.term)) {
        add(`${seed} ${mod.term}`, "longtail");
      }
      if (dimension === "commercial" || dimension === "priceBand") continue;
      add(`${mod.term} ${seed} for men`, "longtail");
      add(`${mod.term} ${seed} for women`, "longtail");
      add(`buy ${mod.term} ${seed} online`, "longtail");
    }
  }

  // Audience / geo / seasonal overlays.
  for (const audience of ["men", "women", "kids", "plus size", "teens"]) {
    add(`${seed} for ${audience}`, "longtail");
    add(`best ${seed} for ${audience}`, "longtail");
  }
  // Nobody types "hoodie for unisex" — the real query leads with the modifier.
  add(`unisex ${seed}`, "longtail");
  add(`best unisex ${seed}`, "longtail");
  for (const market of markets) {
    const profile = MARKET_BY_COUNTRY[market.toUpperCase()];
    if (!profile) continue;
    for (const variant of localizeKeyword(seed, market)) add(variant, "localized");
    for (const event of profile.shoppingEvents.slice(0, 3)) add(`${event.name.toLowerCase()} ${seed} deals`, "seasonal");
  }
  for (const q of QUESTION_TEMPLATES) {
    const filled = q.template.replace(/\{(\w+)\}/g, (_m, k) => {
      const list = MODIFIERS[k];
      if (!list?.length) return seed.includes("hood") ? "oversized" : seed;
      return list[Math.floor(seededRandom(`${q.template}:${k}`) * list.length) % list.length].term;
    });
    add(filled.replace(/\bhoodie\b/g, seed.includes("hood") ? seed : "hoodie"), "question");
  }

  const intentFilter = req.intent;
  const maxDifficulty = req.maxDifficulty;
  const minVolume = req.minVolume;

  let list = [...results.values()];
  if (intentFilter && intentFilter !== "all") list = list.filter((k) => k.intent === intentFilter);
  if (typeof maxDifficulty === "number") list = list.filter((k) => k.difficulty <= maxDifficulty);
  if (typeof minVolume === "number") list = list.filter((k) => k.volume >= minVolume);

  const sort = req.sort ?? "priority";
  list.sort((a, b) => (sort === "difficulty" || sort === "cpc" ? a[sort] - b[sort] : (b[sort] as number) - (a[sort] as number)));
  return dedupeBy(list, (k) => k.normalized).slice(0, req.limit ?? 200);
}

/**
 * Dynamic typeahead suggestions (powers /api/keywords/suggest).
 * Blends lexicon expansion with first-party search history so the widget gets
 * smarter as real shoppers use the site.
 */
export function suggestKeywords(
  partial: string,
  opts: { limit?: number; markets?: CountryCode[]; onsiteSearches?: Record<string, number>; corpus?: string[] } = {},
): KeywordEntry[] {
  const q = partial.trim().toLowerCase();
  const limit = opts.limit ?? 12;
  if (!q) return [];

  const pool = new Set<string>();
  for (const term of Object.keys(opts.onsiteSearches ?? {})) if (term.includes(q)) pool.add(term);
  for (const doc of opts.corpus ?? []) {
    const words = contentWords(doc);
    for (const w of words) if (w.startsWith(q)) pool.add(`${q} ${w}`);
  }
  for (const [dimension, list] of Object.entries(MODIFIERS)) {
    for (const mod of list) {
      if (mod.term.startsWith(q) || `${dimension}`.startsWith(q)) pool.add(`${mod.term} hoodie`);
      if (`${mod.term} hoodie`.includes(q)) pool.add(`${mod.term} hoodie`);
    }
  }
  for (const head of HEAD_TERMS) if (head.term.includes(q)) pool.add(head.term);
  for (const country of opts.markets ?? []) {
    for (const variant of localizeKeyword(q.length > 2 ? q : "hoodie", country)) if (variant.includes(q)) pool.add(variant);
  }
  // Completions of the partial itself.
  for (const suffix of ["for men", "for women", "sale", "buy online", "with zipper", "oversized", "heavyweight", "under 50", "uk", "usa", "black", "grey", "winter"]) {
    pool.add(`${q} ${suffix}`);
  }

  const ctx: Partial<KeywordContext> = { markets: opts.markets, onsiteSearches: opts.onsiteSearches, corpusText: q };
  const entries = [...pool]
    .filter((term) => term && tokenize(term).join(" ").length > 2)
    .map((term) => buildKeywordEntry(term, ctx, term.includes("?") ? "question" : "longtail", opts.onsiteSearches?.[term] ? "onsite-search" : "ai-expansion"))
    .sort((a, b) => b.priority - a.priority || b.volume - a.volume);

  return dedupeBy(entries, (k) => k.normalized).slice(0, limit);
}

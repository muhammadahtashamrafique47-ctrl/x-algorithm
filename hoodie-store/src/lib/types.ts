/**
 * Domain model for the storefront + the AI SEO engine.
 *
 * Everything the engine produces is persisted on the product record itself so
 * that rendering never needs to re-derive SEO output at request time.
 */

export type Locale = string; // BCP-47, e.g. "en-GB"
export type CountryCode = string; // ISO-3166 alpha-2, e.g. "DE"

export type ProductStatus = "draft" | "published" | "archived";
export type Gender = "men" | "women" | "unisex" | "kids";

export type ColorSwatch = { name: string; hex: string };

export type ProductImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  role?: "hero" | "detail" | "lifestyle" | "swatch";
};

export type SearchIntentKind =
  | "transactional"
  | "commercial"
  | "informational"
  | "navigational"
  | "local";

export type IntentProfile = {
  primary: SearchIntentKind;
  secondary: SearchIntentKind[];
  /** 0..1 confidence for the primary classification */
  confidence: number;
  /** Stage of the buying journey the listing should serve */
  funnelStage: "awareness" | "consideration" | "decision" | "retention";
  rationale: string;
};

export type KeywordEntry = {
  term: string;
  normalized: string;
  kind: "primary" | "secondary" | "longtail" | "question" | "semantic" | "localized" | "seasonal";
  intent: SearchIntentKind;
  /** Estimated global monthly searches (modelled, see lib/seo/keywords.ts) */
  volume: number;
  /** 0..100 — higher is harder to rank for */
  difficulty: number;
  /** Estimated Google Ads CPC in USD */
  cpc: number;
  /** 0..100 priority = f(volume, difficulty, intent, relevance, conversion history) */
  priority: number;
  relevance: number; // 0..1 cosine relevance to this product
  trend: number; // -100..100 momentum
  seasonality: { month: number; index: number }[]; // month 0..11
  markets: CountryCode[];
  serpFeatures: string[];
  source: string; // "merchant" | "ai-expansion" | "onsite-search" | "conversion-log" | "llm"
  /**
   * 0..1 — how strongly this term matches the product's *defining* attributes
   * (name, category, fabric) rather than incidental ones (a colourway). Drives
   * primary-target selection so a kids' hoodie does not target "navy hoodie".
   */
  salience?: number;
};

export type SeoIssueSeverity = "critical" | "warning" | "notice";

export type SeoIssue = {
  id: string;
  severity: SeoIssueSeverity;
  field: string;
  message: string;
  fix?: string;
  autoFixed?: boolean;
};

export type ScoreFactor = {
  id: string;
  group: "onpage" | "content" | "technical" | "semantic" | "internal" | "external" | "experience" | "trust";
  label: string;
  weight: number;
  score: number; // 0..weight
  detail: string;
  fix?: string;
};

export type SeoScore = {
  total: number; // 0..100
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  factors: ScoreFactor[];
  evaluatedAt: string;
};

export type BodySection = {
  heading: string;
  body: string;
  bullets?: string[];
  keyword?: string;
};

export type FaqEntry = { q: string; a: string };

export type SeoBody = {
  intro: string;
  sections: BodySection[];
  faq: FaqEntry[];
  cta: string;
  wordCount: number;
};

export type LocalizationEntry = {
  locale: Locale;
  country: CountryCode;
  seoTitle: string;
  metaDescription: string;
  h1: string;
  keywords: string[];
  currency: string;
  localizedPrice: string;
  marketNotes: string;
};

export type InternalLink = {
  label: string;
  href: string;
  reason: string;
  anchorKeyword?: string;
};

export type SeoProfile = {
  optimized: boolean;
  engine: "local-nlp" | "llm" | "hybrid";
  version: number;
  generatedAt: string;
  passes: number;

  seoTitle: string;
  metaDescription: string;
  slug: string;
  canonicalPath: string;
  h1: string;
  breadcrumb: { name: string; href: string }[];

  keywords: KeywordEntry[];
  semanticTerms: string[];
  intent: IntentProfile;
  targetMarkets: CountryCode[];
  hreflang: { locale: Locale; href: string }[];
  localizations: LocalizationEntry[];

  body: SeoBody;
  bullets: string[];
  imageAlt: { src: string; alt: string }[];
  internalLinks: InternalLink[];
  structuredData: string[];

  score: SeoScore;
  previousScore?: number;
  issues: SeoIssue[];

  /** Rolling fingerprint used to detect thin/duplicate content across the catalogue */
  contentHash: string;
  similarityToCatalogue: { slug: string; similarity: number }[];
};

export type ProductMetrics = {
  views: number;
  impressions: number;
  clicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  searchEvents: Record<string, number>; // on-site query -> count
  rankingKeywords: { term: string; position: number; updatedAt: string }[];
  lastTrackedAt?: string;
};

export type Product = {
  id: string;
  sku: string;
  slug: string;
  title: string;
  brand: string;
  category: string; // pullover | zip-up | oversized | ...
  collections: string[];
  gender: Gender;
  ageGroup: "adult" | "teen" | "kids";
  price: number;
  compareAtPrice?: number;
  cost?: number;
  currency: string;
  colors: ColorSwatch[];
  sizes: string[];
  material: string;
  weightGsm?: number;
  fit?: string;
  features: string[];
  careInstructions?: string;
  countryOfOrigin?: string;
  description: string;
  images: ProductImage[];
  inventory: Record<string, number>;
  rating: number;
  reviewCount: number;
  reviews?: { author: string; rating: number; title: string; body: string; date: string }[];
  tags: string[];
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  seo: SeoProfile;
  metrics: ProductMetrics;
};

/** Minimal merchant-facing payload accepted by the upload endpoints. */
export type ProductDraft = Partial<Omit<Product, "id" | "seo" | "metrics" | "createdAt" | "updatedAt">> & {
  id?: string;
};

export type Collection = {
  slug: string;
  name: string;
  description: string;
  seoTitle: string;
  metaDescription: string;
  keywords: string[];
  parent?: string;
};

export type Article = {
  slug: string;
  title: string;
  description: string;
  body: { heading: string; paragraphs: string[] }[];
  tags: string[];
  targetKeywords: string[];
  productSlugs: string[];
  author: string;
  updatedAt: string;
  readingMinutes: number;
};

export type TrackEvent = {
  type: "impression" | "click" | "view" | "add_to_cart" | "purchase" | "search" | "keyword_rank";
  productSlug?: string;
  keyword?: string;
  market?: CountryCode;
  value?: number;
  position?: number;
  source?: string;
  at?: string;
};

export type MarketProfile = {
  country: CountryCode;
  locale: Locale;
  name: string;
  language: string;
  currency: string;
  symbol: string;
  hemisphere: "north" | "south" | "equatorial";
  populationM: number;
  /** 0..100 relative demand for hoodies/apparel online */
  demandIndex: number;
  /** 0..100 e-commerce maturity */
  ecommerceIndex: number;
  /** 0..100 price sensitivity (higher = more value-driven queries) */
  priceSensitivity: number;
  /** Average apparel basket size in USD */
  basketUsd: number;
  /** Peak cold months (0-11) in local season */
  coldMonths: number[];
  /** Terms for "hoodie" and friends in the local language */
  lexicon: Record<string, string[]>;
  shoppingEvents: { name: string; month: number; weight: number }[];
};

import type { KeywordEntry, Product, CountryCode, MarketProfile } from "@/lib/types";
import { MARKETS, MARKET_BY_COUNTRY, rankMarketsFor, formatPrice } from "@/lib/i18n/markets";
import { clamp, round } from "@/lib/seo/text";

/**
 * External-factor models: the parts of ranking and demand that live outside the
 * product record — Google's ranking systems, SERP composition, seasonality,
 * market economics and the global retail calendar.
 */

export type AlgorithmFactor = {
  id: string;
  name: string;
  weight: number;
  system: string;
  whatItRewards: string;
  howWeSatisfyIt: string;
};

/**
 * Weighted model of the ranking systems that decide apparel PDP visibility.
 * Weights are our own planning allocation (they sum to 100) informed by
 * Google's published guidance on Search Essentials, Helpful Content, Product
 * Reviews, Page Experience and the E-E-A-T quality-rater framework.
 */
export const ALGORITHM_FACTORS: AlgorithmFactor[] = [
  {
    id: "query-relevance",
    name: "Query & term relevance",
    weight: 18,
    system: "Core ranking / BERT-style query understanding",
    whatItRewards: "Primary keyword in title, H1, URL, first 100 words; natural coverage of variants.",
    howWeSatisfyIt: "The optimizer writes title/H1/slug from the highest-priority keyword and enforces placement rules.",
  },
  {
    id: "content-quality",
    name: "Content quality & depth",
    weight: 16,
    system: "Helpful Content System / core",
    whatItRewards: "Original, substantive copy that answers the query better than the current top result.",
    howWeSatisfyIt: "Every listing gets a unique 300+ word structured body with sections, bullets and FAQs.",
  },
  {
    id: "eeat",
    name: "E-E-A-T & product knowledge",
    weight: 14,
    system: "Quality Rater Guidelines / Product Reviews System",
    whatItRewards: "Demonstrated expertise: fabric weight (GSM), construction, care, origin, real reviews.",
    howWeSatisfyIt: "Semantic entity terms are injected from the fabric/construction/care lexicon and reviews are marked up.",
  },
  {
    id: "structured-data",
    name: "Structured data eligibility",
    weight: 12,
    system: "Rich results / Merchant listing",
    whatItRewards: "Complete Product, Offer, AggregateRating, Review, BreadcrumbList and FAQPage JSON-LD.",
    howWeSatisfyIt: "schema.ts emits every eligible type with availability, price validity and shipping details.",
  },
  {
    id: "internal-links",
    name: "Internal link equity & topology",
    weight: 10,
    system: "Crawl & link analysis",
    whatItRewards: "Shallow click depth, contextual anchors, hub-and-spoke clustering.",
    howWeSatisfyIt: "internal.ts suggests cluster links with mixed anchors and keeps PDPs two clicks from home.",
  },
  {
    id: "page-experience",
    name: "Page experience / Core Web Vitals",
    weight: 9,
    system: "Page Experience",
    whatItRewards: "Fast LCP, no CLS, responsive images, mobile-first copy.",
    howWeSatisfyIt: "next/image AVIF/WebP with explicit dimensions, priority hero, no layout-shifting widgets.",
  },
  {
    id: "uniqueness",
    name: "Uniqueness / cannibalization control",
    weight: 8,
    system: "Duplicate content handling",
    whatItRewards: "One canonical page per query intent; no near-duplicate listings.",
    howWeSatisfyIt: "TF-IDF similarity audit + canonical tags + shared-primary-keyword warnings.",
  },
  {
    id: "freshness",
    name: "Freshness",
    weight: 5,
    system: "Query deserving freshness",
    whatItRewards: "Recently updated pages for seasonal/trend queries.",
    howWeSatisfyIt: "dateModified is refreshed on every optimization pass and re-emitted in JSON-LD + sitemap.",
  },
  {
    id: "localization",
    name: "Localization & hreflang",
    weight: 5,
    system: "International targeting",
    whatItRewards: "Correct hreflang clusters, locale-appropriate copy, local currency & shipping.",
    howWeSatisfyIt: "marketProfiles drive hreflang alternates and localized titles/descriptions per locale.",
  },
  {
    id: "engagement",
    name: "Engagement & conversion signals",
    weight: 3,
    system: "Post-click quality signals",
    whatItRewards: "High CTR in the SERP, low pogo-sticking, add-to-cart activity.",
    howWeSatisfyIt: "Titles are CTR-tuned within pixel budget; events feed the rank tracker and re-prioritization loop.",
  },
];

export const ALGORITHM_WEIGHT_TOTAL = ALGORITHM_FACTORS.reduce((s, f) => s + f.weight, 0);

/** Standard organic CTR decay by position (used for traffic forecasts). */
export const CTR_BY_POSITION = [0, 0.276, 0.158, 0.11, 0.084, 0.063, 0.049, 0.039, 0.032, 0.027, 0.024];

export function ctrForPosition(position: number): number {
  if (position <= 0) return 0;
  if (position < CTR_BY_POSITION.length) return CTR_BY_POSITION[position];
  return Math.max(0.004, 0.024 / position);
}

export type SerpLandscape = {
  term: string;
  composition: { archetype: string; share: number }[];
  difficultyBand: "easy" | "moderate" | "hard" | "very hard";
  narrative: string;
  winnablePositions: number[];
  richResultOpportunities: string[];
};

export function serpLandscape(term: string, difficulty: number, serpFeatures: string[] = []): SerpLandscape {
  const commercial = /(buy|sale|price|cheap|shop|deal|discount|under)/.test(term);
  const informational = /(how|what|why|which|guide|vs)/.test(term);

  const composition = informational
    ? [
        { archetype: "Editorial / blog content", share: 0.46 },
        { archetype: "Marketplace (Amazon, Etsy)", share: 0.18 },
        { archetype: "Brand DTC guides", share: 0.24 },
        { archetype: "Video / UGC", share: 0.12 },
      ]
    : commercial
      ? [
          { archetype: "Marketplace (Amazon, Etsy, eBay)", share: 0.38 },
          { archetype: "Brand DTC product pages", share: 0.34 },
          { archetype: "Comparison / review sites", share: 0.18 },
          { archetype: "Retailer category pages", share: 0.1 },
        ]
      : [
          { archetype: "Marketplace category pages", share: 0.34 },
          { archetype: "Brand DTC category pages", share: 0.3 },
          { archetype: "Fast-fashion retailers", share: 0.24 },
          { archetype: "Editorial roundups", share: 0.12 },
        ];

  const band: SerpLandscape["difficultyBand"] =
    difficulty < 25 ? "easy" : difficulty < 50 ? "moderate" : difficulty < 75 ? "hard" : "very hard";

  const narrative =
    band === "easy"
      ? `Long-tail query with weak incumbents — a well-structured PDP can reach page one inside 4-8 weeks.`
      : band === "moderate"
        ? `Contested but winnable: expect marketplace and DTC incumbents. Differentiate on structured data completeness, review depth and collection-hub authority.`
        : band === "very hard"
          ? `Head term dominated by marketplaces with massive link equity. Treat as a brand/awareness target and win the long-tail cluster around it first.`
          : `Competitive SERP. Requires strong internal linking from a topical hub, 20+ reviews and a merchant-listing rich result to earn clicks.`;

  return {
    term,
    composition,
    difficultyBand: band,
    narrative,
    winnablePositions: band === "easy" ? [1, 2, 3] : band === "moderate" ? [3, 4, 5, 6] : band === "hard" ? [6, 7, 8, 9] : [9, 10],
    richResultOpportunities: serpFeatures.length ? serpFeatures : ["product listing", "reviews snippet"],
  };
}

export type MarketOpportunity = {
  country: CountryCode;
  market: MarketProfile;
  score: number;
  reasons: string[];
  localizedPrice: string;
  seasonNow: string;
  peakMonths: number[];
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function seasonName(month: number, hemisphere: "north" | "south" | "equatorial"): string {
  if (hemisphere === "equatorial") return "tropical (year-round demand for lightweight layers)";
  const northSeasons = ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"];
  const season = northSeasons[month];
  const flipped: Record<string, string> = { Winter: "Summer", Summer: "Winter", Spring: "Autumn", Autumn: "Spring" };
  return hemisphere === "south" ? flipped[season] : season;
}

/** Rank the global markets where this specific listing has the best chance right now. */
export function marketOpportunities(product: Product, month: number = new Date().getMonth()): MarketOpportunity[] {
  const premium = product.price >= 90;
  const value = product.price <= 45;
  const lightweight = (product.weightGsm ?? 350) < 320;

  return rankMarketsFor(month, { premium })
    .map((market) => {
      const reasons: string[] = [];
      let score = market.demandIndex * 0.4 + market.ecommerceIndex * 0.25;

      const isCold = market.coldMonths.includes(month);
      if (isCold && !lightweight) {
        score += 18;
        reasons.push(`${seasonName(month, market.hemisphere)} in ${market.name} — peak hoodie season`);
      }
      if (lightweight && !isCold) {
        score += 8;
        reasons.push(`Lightweight ${product.weightGsm ?? "mid"} GSM matches ${market.name}'s current climate`);
      }
      if (value && market.priceSensitivity >= 70) {
        score += 14;
        reasons.push(`Price point (${formatPrice(product.price, market)}) fits a high price-sensitivity market`);
      }
      if (premium && market.basketUsd >= 55) {
        score += 12;
        reasons.push(`Premium price aligns with a ${formatPrice(market.basketUsd, market)} average apparel basket`);
      }
      const events = market.shoppingEvents.filter((e) => e.month === month || e.month === (month + 1) % 12);
      if (events.length) {
        score += Math.max(...events.map((e) => e.weight)) * 0.16;
        reasons.push(`${events.map((e) => e.name).join(" + ")} demand spike in ${MONTH_NAMES[events[0].month]}`);
      }
      if (market.populationM >= 100) {
        score += 5;
        reasons.push(`Large addressable population (${market.populationM}M)`);
      }
      if (!reasons.length) reasons.push(`Baseline demand index ${market.demandIndex}/100 with ${market.ecommerceIndex}/100 e-commerce maturity`);

      return {
        country: market.country,
        market,
        score: round(clamp(score, 0, 130), 1),
        reasons,
        localizedPrice: formatPrice(product.price, market),
        seasonNow: seasonName(month, market.hemisphere),
        peakMonths: market.coldMonths,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function upcomingEvents(month: number = new Date().getMonth(), horizon = 3) {
  const out: { name: string; month: number; countries: CountryCode[]; weight: number }[] = [];
  for (let offset = 0; offset < horizon; offset++) {
    const m = (month + offset) % 12;
    for (const market of MARKETS) {
      for (const event of market.shoppingEvents) {
        if (event.month !== m) continue;
        const existing = out.find((e) => e.name === event.name && e.month === m);
        if (existing) {
          existing.countries.push(market.country);
          existing.weight = Math.max(existing.weight, event.weight);
        } else {
          out.push({ name: event.name, month: m, countries: [market.country], weight: event.weight });
        }
      }
    }
  }
  return out.sort((a, b) => a.month - b.month || b.weight - a.weight);
}

/** Indicative market price bands by category, used for price-competitiveness scoring. */
export const PRICE_BANDS: Record<string, { fast: [number, number]; mid: [number, number]; premium: [number, number]; luxury: [number, number] }> = {
  pullover: { fast: [18, 35], mid: [36, 65], premium: [66, 120], luxury: [121, 400] },
  "zip-up": { fast: [22, 40], mid: [41, 75], premium: [76, 140], luxury: [141, 450] },
  oversized: { fast: [24, 42], mid: [43, 78], premium: [79, 145], luxury: [146, 460] },
  cropped: { fast: [18, 34], mid: [35, 62], premium: [63, 115], luxury: [116, 380] },
  heavyweight: { fast: [35, 55], mid: [56, 95], premium: [96, 160], luxury: [161, 420] },
  graphic: { fast: [20, 38], mid: [39, 68], premium: [69, 125], luxury: [126, 400] },
  kids: { fast: [14, 26], mid: [27, 45], premium: [46, 80], luxury: [81, 200] },
};

export function priceBandFor(product: Product): { band: string; range: [number, number]; competitiveness: number } {
  const bands = PRICE_BANDS[product.category] ?? PRICE_BANDS.pullover;
  const entries = Object.entries(bands) as [string, [number, number]][];
  const match = entries.find(([, [min, max]]) => product.price >= min && product.price <= max);
  const band = match?.[0] ?? (product.price < entries[0][1][0] ? "below-market" : "above-market");
  const range = match?.[1] ?? entries[entries.length - 1][1];
  const mid = (range[0] + range[1]) / 2;
  const competitiveness = round(clamp(100 - (Math.abs(product.price - mid) / mid) * 120, 20, 100), 1);
  return { band, range, competitiveness };
}

/** Forecast organic impressions/clicks if the listing holds a given average position. */
export function trafficForecast(keywords: KeywordEntry[], position = 5) {
  const volume = keywords.reduce((s, k) => s + k.volume, 0);
  const weightedCtr = ctrForPosition(position);
  const impressions = Math.round(volume * 0.35); // share of volume we are eligible for
  const clicks = Math.round(impressions * weightedCtr);
  const conversionRate = 0.028;
  return {
    position,
    monthlyVolume: volume,
    estimatedImpressions: impressions,
    estimatedClicks: clicks,
    estimatedOrders: Math.round(clicks * conversionRate * 10) / 10,
    ctr: round(weightedCtr * 100, 2),
  };
}

export type ExternalSignals = {
  month: number;
  monthName: string;
  opportunities: MarketOpportunity[];
  priceBand: { band: string; range: [number, number]; competitiveness: number };
  events: { name: string; month: number; countries: CountryCode[]; weight: number }[];
  algorithmFactors: AlgorithmFactor[];
  forecast: ReturnType<typeof trafficForecast>;
};

export function externalSignalsFor(product: Product, month = new Date().getMonth()): ExternalSignals {
  const opportunities = marketOpportunities(product, month);
  return {
    month,
    monthName: MONTH_NAMES[month],
    opportunities,
    priceBand: priceBandFor(product),
    events: upcomingEvents(month),
    algorithmFactors: ALGORITHM_FACTORS,
    forecast: trafficForecast(product.seo?.keywords ?? [], 5),
  };
}

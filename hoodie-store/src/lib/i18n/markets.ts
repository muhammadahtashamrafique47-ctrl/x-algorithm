import type { MarketProfile, CountryCode, Locale } from "@/lib/types";

/**
 * Global market profiles.
 *
 * These drive three things:
 *  1. hreflang / alternate-locale emission for every listing,
 *  2. market-weighted search-volume + difficulty modelling in the keyword engine,
 *  3. localized keyword expansion (native terms for "hoodie", local retail calendar).
 *
 * The numbers are calibrated planning indices (relative, not absolute market
 * research data) so the engine behaves deterministically without any network
 * dependency. Swap this file for a live feed (Statista / Similarweb / GKP export)
 * in production — the interface is the contract.
 */
export const MARKETS: MarketProfile[] = [
  {
    country: "US", locale: "en-US", name: "United States", language: "English",
    currency: "USD", symbol: "$", hemisphere: "north", populationM: 335,
    demandIndex: 100, ecommerceIndex: 96, priceSensitivity: 52, basketUsd: 68,
    coldMonths: [10, 11, 0, 1, 2],
    lexicon: { hoodie: ["hoodie", "hooded sweatshirt", "hoody", "sweatshirt"], pullover: ["pullover", "crewneck"], zip: ["zip up", "full zip"] },
    shoppingEvents: [
      { name: "Black Friday", month: 10, weight: 100 }, { name: "Cyber Monday", month: 10, weight: 92 },
      { name: "Christmas", month: 11, weight: 88 }, { name: "Back to School", month: 7, weight: 55 },
      { name: "Amazon Prime Day", month: 6, weight: 48 }, { name: "Super Bowl", month: 1, weight: 22 },
    ],
  },
  {
    country: "GB", locale: "en-GB", name: "United Kingdom", language: "English",
    currency: "GBP", symbol: "£", hemisphere: "north", populationM: 68,
    demandIndex: 88, ecommerceIndex: 95, priceSensitivity: 58, basketUsd: 55,
    coldMonths: [9, 10, 11, 0, 1, 2],
    lexicon: { hoodie: ["hoodie", "hooded top", "jumper"], pullover: ["sweatshirt", "jumper"], zip: ["zip up", "zip through"] },
    shoppingEvents: [
      { name: "Black Friday", month: 10, weight: 95 }, { name: "Boxing Day", month: 11, weight: 90 },
      { name: "Christmas", month: 11, weight: 85 }, { name: "January Sale", month: 0, weight: 60 },
    ],
  },
  {
    country: "CA", locale: "en-CA", name: "Canada", language: "English",
    currency: "CAD", symbol: "C$", hemisphere: "north", populationM: 40,
    demandIndex: 84, ecommerceIndex: 86, priceSensitivity: 55, basketUsd: 60,
    coldMonths: [9, 10, 11, 0, 1, 2, 3],
    lexicon: { hoodie: ["hoodie", "hooded sweatshirt"], pullover: ["pullover"], zip: ["zip up"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 88 }, { name: "Boxing Day", month: 11, weight: 92 }, { name: "Christmas", month: 11, weight: 80 }],
  },
  {
    country: "AU", locale: "en-AU", name: "Australia", language: "English",
    currency: "AUD", symbol: "A$", hemisphere: "south", populationM: 27,
    demandIndex: 70, ecommerceIndex: 88, priceSensitivity: 54, basketUsd: 58,
    coldMonths: [4, 5, 6, 7, 8],
    lexicon: { hoodie: ["hoodie", "hooded jumper"], pullover: ["jumper"], zip: ["zip up"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 78 }, { name: "EOFY Sale", month: 5, weight: 62 }, { name: "Christmas", month: 11, weight: 70 }],
  },
  {
    country: "DE", locale: "de-DE", name: "Germany", language: "German",
    currency: "EUR", symbol: "€", hemisphere: "north", populationM: 84,
    demandIndex: 82, ecommerceIndex: 90, priceSensitivity: 62, basketUsd: 57,
    coldMonths: [9, 10, 11, 0, 1, 2],
    lexicon: { hoodie: ["hoodie", "kapuzenpullover", "hoodie damen", "hoodie herren"], pullover: ["pullover", "sweatshirt"], zip: ["zip hoodie", "kapuzenjacke"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 90 }, { name: "Weihnachten", month: 11, weight: 86 }, { name: "Winterschlussverkauf", month: 0, weight: 55 }],
  },
  {
    country: "FR", locale: "fr-FR", name: "France", language: "French",
    currency: "EUR", symbol: "€", hemisphere: "north", populationM: 68,
    demandIndex: 78, ecommerceIndex: 87, priceSensitivity: 60, basketUsd: 54,
    coldMonths: [9, 10, 11, 0, 1, 2],
    lexicon: { hoodie: ["hoodie", "sweat à capuche", "pull à capuche"], pullover: ["sweat", "pull"], zip: ["sweat zippé", "veste à capuche"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 88 }, { name: "Soldes d'hiver", month: 0, weight: 70 }, { name: "Noël", month: 11, weight: 82 }],
  },
  {
    country: "ES", locale: "es-ES", name: "Spain", language: "Spanish",
    currency: "EUR", symbol: "€", hemisphere: "north", populationM: 48,
    demandIndex: 66, ecommerceIndex: 80, priceSensitivity: 66, basketUsd: 44,
    coldMonths: [10, 11, 0, 1, 2],
    lexicon: { hoodie: ["sudadera con capucha", "hoodie", "sudadera"], pullover: ["jersey", "sudadera"], zip: ["sudadera cremallera"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 86 }, { name: "Reyes", month: 0, weight: 78 }, { name: "Rebajas", month: 0, weight: 64 }],
  },
  {
    country: "IT", locale: "it-IT", name: "Italy", language: "Italian",
    currency: "EUR", symbol: "€", hemisphere: "north", populationM: 59,
    demandIndex: 64, ecommerceIndex: 76, priceSensitivity: 64, basketUsd: 47,
    coldMonths: [10, 11, 0, 1, 2],
    lexicon: { hoodie: ["felpa con cappuccio", "hoodie", "felpa"], pullover: ["maglione", "felpa"], zip: ["felpa zip"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 85 }, { name: "Saldi", month: 0, weight: 68 }, { name: "Natale", month: 11, weight: 76 }],
  },
  {
    country: "NL", locale: "nl-NL", name: "Netherlands", language: "Dutch",
    currency: "EUR", symbol: "€", hemisphere: "north", populationM: 18,
    demandIndex: 62, ecommerceIndex: 92, priceSensitivity: 50, basketUsd: 52,
    coldMonths: [9, 10, 11, 0, 1, 2],
    lexicon: { hoodie: ["hoodie", "trui met capuchon"], pullover: ["sweater", "trui"], zip: ["zip hoodie"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 80 }, { name: "Sinterklaas", month: 11, weight: 72 }],
  },
  {
    country: "SE", locale: "sv-SE", name: "Sweden", language: "Swedish",
    currency: "SEK", symbol: "kr", hemisphere: "north", populationM: 11,
    demandIndex: 68, ecommerceIndex: 91, priceSensitivity: 46, basketUsd: 56,
    coldMonths: [8, 9, 10, 11, 0, 1, 2, 3],
    lexicon: { hoodie: ["hoodie", "tröja med huva"], pullover: ["tröja"], zip: ["zip hoodie"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 78 }, { name: "Jul", month: 11, weight: 74 }],
  },
  {
    country: "JP", locale: "ja-JP", name: "Japan", language: "Japanese",
    currency: "JPY", symbol: "¥", hemisphere: "north", populationM: 124,
    demandIndex: 76, ecommerceIndex: 89, priceSensitivity: 48, basketUsd: 51,
    coldMonths: [9, 10, 11, 0, 1, 2],
    lexicon: { hoodie: ["パーカー", "フーディー", "hoodie"], pullover: ["スウェット"], zip: ["ジップアップ"] },
    shoppingEvents: [{ name: "福袋", month: 0, weight: 70 }, { name: "Black Friday", month: 10, weight: 62 }, { name: "Christmas", month: 11, weight: 66 }],
  },
  {
    country: "KR", locale: "ko-KR", name: "South Korea", language: "Korean",
    currency: "KRW", symbol: "₩", hemisphere: "north", populationM: 52,
    demandIndex: 72, ecommerceIndex: 94, priceSensitivity: 50, basketUsd: 49,
    coldMonths: [9, 10, 11, 0, 1, 2],
    lexicon: { hoodie: ["후드티", "후디", "hoodie"], pullover: ["맨투맨"], zip: ["집업"] },
    shoppingEvents: [{ name: "Korea Sale Festa", month: 10, weight: 60 }, { name: "Pepero Day", month: 10, weight: 34 }],
  },
  {
    country: "IN", locale: "en-IN", name: "India", language: "English",
    currency: "INR", symbol: "₹", hemisphere: "north", populationM: 1428,
    demandIndex: 74, ecommerceIndex: 78, priceSensitivity: 84, basketUsd: 22,
    coldMonths: [10, 11, 0, 1],
    lexicon: { hoodie: ["hoodie", "hoodie for men", "hoodie for women", "sweatshirt"], pullover: ["sweater", "pullover"], zip: ["zip hoodie"] },
    shoppingEvents: [{ name: "Diwali", month: 9, weight: 96 }, { name: "Big Billion Days", month: 9, weight: 90 }, { name: "Republic Day Sale", month: 0, weight: 52 }],
  },
  {
    country: "PK", locale: "en-PK", name: "Pakistan", language: "English",
    currency: "PKR", symbol: "₨", hemisphere: "north", populationM: 240,
    demandIndex: 66, ecommerceIndex: 58, priceSensitivity: 90, basketUsd: 18,
    coldMonths: [10, 11, 0, 1, 2],
    lexicon: { hoodie: ["hoodie", "hoodie price in pakistan", "sweatshirt", "hooded sweatshirt"], pullover: ["pullover", "sweater"], zip: ["zip hoodie"] },
    shoppingEvents: [{ name: "Blessed Friday", month: 10, weight: 88 }, { name: "Winter Sale", month: 11, weight: 70 }, { name: "Eid", month: 2, weight: 64 }],
  },
  {
    country: "AE", locale: "ar-AE", name: "United Arab Emirates", language: "Arabic",
    currency: "AED", symbol: "د.إ", hemisphere: "north", populationM: 10,
    demandIndex: 52, ecommerceIndex: 84, priceSensitivity: 44, basketUsd: 74,
    coldMonths: [11, 0, 1],
    lexicon: { hoodie: ["هودي", "hoodie", "سترة بقلنسوة"], pullover: ["بلوفر"], zip: ["هودي بسحاب"] },
    shoppingEvents: [{ name: "White Friday", month: 10, weight: 94 }, { name: "Ramadan", month: 2, weight: 72 }, { name: "Eid", month: 3, weight: 68 }],
  },
  {
    country: "SA", locale: "ar-SA", name: "Saudi Arabia", language: "Arabic",
    currency: "SAR", symbol: "﷼", hemisphere: "north", populationM: 36,
    demandIndex: 54, ecommerceIndex: 80, priceSensitivity: 48, basketUsd: 66,
    coldMonths: [11, 0, 1],
    lexicon: { hoodie: ["هودي", "hoodie", "جاكيت بقلنسوة"], pullover: ["بلوفر"], zip: ["هودي بسحاب"] },
    shoppingEvents: [{ name: "White Friday", month: 10, weight: 92 }, { name: "Ramadan", month: 2, weight: 70 }],
  },
  {
    country: "BR", locale: "pt-BR", name: "Brazil", language: "Portuguese",
    currency: "BRL", symbol: "R$", hemisphere: "south", populationM: 216,
    demandIndex: 68, ecommerceIndex: 76, priceSensitivity: 78, basketUsd: 32,
    coldMonths: [4, 5, 6, 7],
    lexicon: { hoodie: ["moletom com capuz", "hoodie", "moletom"], pullover: ["blusa de frio"], zip: ["moletom zip"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 92 }, { name: "Dia do Consumidor", month: 2, weight: 66 }],
  },
  {
    country: "MX", locale: "es-MX", name: "Mexico", language: "Spanish",
    currency: "MXN", symbol: "Mex$", hemisphere: "north", populationM: 129,
    demandIndex: 60, ecommerceIndex: 70, priceSensitivity: 76, basketUsd: 28,
    coldMonths: [10, 11, 0, 1],
    lexicon: { hoodie: ["sudadera con capucha", "hoodie"], pullover: ["sudadera"], zip: ["sudadera cierre"] },
    shoppingEvents: [{ name: "El Buen Fin", month: 10, weight: 94 }, { name: "Navidad", month: 11, weight: 70 }],
  },
  {
    country: "ZA", locale: "en-ZA", name: "South Africa", language: "English",
    currency: "ZAR", symbol: "R", hemisphere: "south", populationM: 60,
    demandIndex: 58, ecommerceIndex: 62, priceSensitivity: 74, basketUsd: 30,
    coldMonths: [4, 5, 6, 7],
    lexicon: { hoodie: ["hoodie", "hooded top"], pullover: ["jersey"], zip: ["zip hoodie"] },
    shoppingEvents: [{ name: "Black Friday", month: 10, weight: 86 }, { name: "Christmas", month: 11, weight: 62 }],
  },
  {
    country: "SG", locale: "en-SG", name: "Singapore", language: "English",
    currency: "SGD", symbol: "S$", hemisphere: "equatorial", populationM: 6,
    demandIndex: 44, ecommerceIndex: 90, priceSensitivity: 42, basketUsd: 62,
    coldMonths: [],
    lexicon: { hoodie: ["hoodie", "lightweight hoodie"], pullover: ["pullover"], zip: ["zip up"] },
    shoppingEvents: [{ name: "11.11 Singles Day", month: 10, weight: 96 }, { name: "12.12", month: 11, weight: 78 }, { name: "Chinese New Year", month: 0, weight: 60 }],
  },
];

export const MARKET_BY_COUNTRY: Record<CountryCode, MarketProfile> = Object.fromEntries(
  MARKETS.map((m) => [m.country, m]),
);

export const MARKET_BY_LOCALE: Record<Locale, MarketProfile> = Object.fromEntries(
  MARKETS.map((m) => [m.locale, m]),
);

/** Locales the storefront actually serves (hreflang + sitemap alternates). */
export const SERVED_LOCALES: Locale[] = (
  process.env.NEXT_PUBLIC_MARKET_LOCALES ?? "en-US,en-GB,de-DE,fr-FR,es-ES,ja-JP,ar-AE,en-AU,en-CA"
)
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);

export const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "en-US";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Northloop Supply Co.";
export const BRAND_SHORT = process.env.NEXT_PUBLIC_BRAND_SHORT?.trim() || BRAND_NAME.replace(/\s+(Supply|Co|Company|Ltd|Inc|Group).*/i, "").trim() || BRAND_NAME;
export const BRAND_TAGLINE =
  process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Heavyweight hoodies, built for every climate.";
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "help@northloop.example";

export function marketFor(country: CountryCode): MarketProfile | undefined {
  return MARKET_BY_COUNTRY[country?.toUpperCase?.() ?? ""];
}

export function marketsForCountries(countries: CountryCode[]): MarketProfile[] {
  return countries.map((c) => MARKET_BY_COUNTRY[c?.toUpperCase?.()]).filter(Boolean) as MarketProfile[];
}

/**
 * Top-N markets for a product based on demand, e-commerce maturity and the
 * season the product is written for. Used to prioritise hreflang alternates.
 */
export function rankMarketsFor(month: number, opts: { premium?: boolean } = {}): MarketProfile[] {
  return [...MARKETS].sort((a, b) => {
    const seasonalA = a.coldMonths.includes(month) ? 18 : 0;
    const seasonalB = b.coldMonths.includes(month) ? 18 : 0;
    const premiumA = opts.premium ? (a.basketUsd / 4) : -(a.priceSensitivity / 4);
    const premiumB = opts.premium ? (b.basketUsd / 4) : -(b.priceSensitivity / 4);
    const scoreA = a.demandIndex * 0.45 + a.ecommerceIndex * 0.25 + seasonalA + premiumA;
    const scoreB = b.demandIndex * 0.45 + b.ecommerceIndex * 0.25 + seasonalB + premiumB;
    return scoreB - scoreA;
  });
}

/** Native-language terms for a concept in a given market (used for localized keywords). */
export function localTerms(market: MarketProfile, concept: "hoodie" | "pullover" | "zip"): string[] {
  return market.lexicon[concept] ?? [];
}

export function formatPrice(amountUsd: number, market?: MarketProfile): string {
  if (!market) return `$${amountUsd.toFixed(2)}`;
  // Indicative FX for display of localized prices in SEO copy.
  const fx: Record<string, number> = {
    USD: 1, GBP: 0.79, EUR: 0.92, CAD: 1.36, AUD: 1.52, JPY: 152, KRW: 1360,
    INR: 83, PKR: 278, AED: 3.67, SAR: 3.75, BRL: 5.4, MXN: 18.2, ZAR: 18.6,
    SEK: 10.6, SGD: 1.35,
  };
  const rate = fx[market.currency] ?? 1;
  const value = amountUsd * rate;
  const digits = ["JPY", "KRW", "INR", "PKR"].includes(market.currency) ? 0 : 2;
  return `${market.symbol}${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

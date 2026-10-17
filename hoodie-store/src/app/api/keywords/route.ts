import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, getSearchLog } from "@/lib/store/db";
import { clusterKeywords, keywordResearch, type KeywordResearchRequest } from "@/lib/seo/keywords";
import { extractAttributes } from "@/lib/seo/keywords";
import { buildInternalCompetitionMap, conversionSignals, findSimilar, productText } from "@/lib/seo/internal";
import { marketOpportunities, serpLandscape, upcomingEvents } from "@/lib/seo/external";
import { toCsv } from "@/lib/commerce/csv";
import { rankMarketsFor } from "@/lib/i18n/markets";
import { round, unique } from "@/lib/seo/text";
import type { CountryCode, SearchIntentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseRequest(url: URL): KeywordResearchRequest & { productSlug?: string; format?: string } {
  const markets = (url.searchParams.get("markets") ?? "")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean) as CountryCode[];

  return {
    seed: url.searchParams.get("seed") ?? url.searchParams.get("q") ?? "hoodie",
    markets: markets.length ? markets : undefined,
    month: url.searchParams.get("month") ? Number(url.searchParams.get("month")) : undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 120,
    intent: (url.searchParams.get("intent") as SearchIntentKind | "all") ?? "all",
    maxDifficulty: url.searchParams.get("maxDifficulty") ? Number(url.searchParams.get("maxDifficulty")) : undefined,
    minVolume: url.searchParams.get("minVolume") ? Number(url.searchParams.get("minVolume")) : undefined,
    sort: (url.searchParams.get("sort") as KeywordResearchRequest["sort"]) ?? "priority",
    productSlug: url.searchParams.get("productSlug") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  };
}

/**
 * GET/POST /api/keywords — the keyword research engine.
 *
 * Combines lexicon expansion with first-party signals (on-site search,
 * attributed conversions), internal competition (cannibalization), market
 * economics and the retail calendar. Returns scored candidates, topic clusters
 * and a SERP landscape assessment for the seed.
 */
async function handle(url: URL, body?: Record<string, unknown>) {
  await ensureCatalogue();
  const req = body ? ({ ...parseRequest(url), ...body } as ReturnType<typeof parseRequest>) : parseRequest(url);
  const products = getAllProducts();
  const product = req.productSlug ? products.find((p) => p.slug === req.productSlug) : undefined;

  const month = req.month ?? new Date().getMonth();
  const markets = req.markets?.length ? req.markets : rankMarketsFor(month).slice(0, 6).map((m) => m.country);

  const context = product
    ? {
        attributes: extractAttributes(product),
        price: product.price,
        gender: product.gender,
        category: product.category,
        collections: product.collections,
        corpusText: productText(product),
        internalCompetition: buildInternalCompetitionMap(products.filter((p) => p.id !== product.id)),
      }
    : {
        corpusText: req.seed,
        internalCompetition: buildInternalCompetitionMap(products),
      };

  const keywords = keywordResearch(
    {
      seed: req.seed,
      markets,
      month,
      limit: req.limit,
      intent: req.intent,
      maxDifficulty: req.maxDifficulty,
      minVolume: req.minVolume,
      sort: req.sort,
    },
    { ...context, onsiteSearches: getSearchLog(), conversions: conversionSignals(), markets, month },
  );

  const clusters = clusterKeywords(keywords).slice(0, 14);
  const intentBreakdown = unique(keywords.map((k) => k.intent)).map((intent) => ({
    intent,
    count: keywords.filter((k) => k.intent === intent).length,
    volume: keywords.filter((k) => k.intent === intent).reduce((s, k) => s + k.volume, 0),
  }));

  const totalVolume = keywords.reduce((s, k) => s + k.volume, 0);
  const avgDifficulty = keywords.length ? round(keywords.reduce((s, k) => s + k.difficulty, 0) / keywords.length, 1) : 0;
  const avgCpc = keywords.length ? round(keywords.reduce((s, k) => s + k.cpc, 0) / keywords.length, 2) : 0;

  const quickWins = keywords
    .filter((k) => k.difficulty <= 40 && k.volume >= 100 && (k.intent === "transactional" || k.intent === "commercial"))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);

  const summary = {
    seed: req.seed,
    generatedAt: new Date().toISOString(),
    month,
    markets,
    count: keywords.length,
    totalVolume,
    avgDifficulty,
    avgCpc,
    estimatedMonthlyClicksAtPosition5: Math.round(totalVolume * 0.3 * 0.063),
    intentBreakdown,
    quickWins,
    serp: serpLandscape(req.seed, keywords.find((k) => k.normalized === req.seed.toLowerCase())?.difficulty ?? 60, keywords[0]?.serpFeatures ?? []),
    events: upcomingEvents(month, 3).slice(0, 8),
    similarListings: product ? findSimilar(product, { limit: 4 }).map((s) => ({ slug: s.slug, title: s.title, similarity: s.similarity })) : [],
    marketOpportunities: product
      ? marketOpportunities(product, month).slice(0, 6).map((o) => ({ country: o.country, name: o.market.name, score: o.score, season: o.seasonNow, reasons: o.reasons }))
      : rankMarketsFor(month).slice(0, 6).map((m) => ({ country: m.country, name: m.name, score: m.demandIndex, season: "" , reasons: [`Demand index ${m.demandIndex}/100`] })),
  };

  if (req.format === "csv") {
    const csv = toCsv(
      keywords.map((k) => ({
        keyword: k.term,
        intent: k.intent,
        kind: k.kind,
        volume: k.volume,
        difficulty: k.difficulty,
        cpc: k.cpc,
        priority: k.priority,
        relevance: k.relevance,
        trend: k.trend,
        serp_features: k.serpFeatures.join(" | "),
        markets: markets.join(" "),
        peak_months: k.seasonality
          .slice()
          .sort((a, b) => b.index - a.index)
          .slice(0, 3)
          .map((s) => s.month + 1)
          .join(" "),
      })),
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="keywords-${req.seed.replace(/\s+/g, "-")}.csv"`,
      },
    });
  }

  return NextResponse.json({ keywords, clusters, summary });
}

export async function GET(request: NextRequest) {
  return handle(new URL(request.url));
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return handle(new URL(request.url), body);
}

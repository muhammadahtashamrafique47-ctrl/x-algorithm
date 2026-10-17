import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, getSearchLog } from "@/lib/store/db";
import { suggestKeywords } from "@/lib/seo/keywords";
import { conversionSignals } from "@/lib/seo/internal";
import type { CountryCode } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/keywords/suggest?q=over&limit=10&markets=US,GB
 *
 * Dynamic typeahead used by the storefront search overlay and the admin keyword
 * tool. Suggestions are ranked by our own priority model, and on-site search
 * history is blended in so the widget learns from real shopper demand.
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Number(url.searchParams.get("limit") ?? 10);
  const markets = (url.searchParams.get("markets") ?? "")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean) as CountryCode[];

  const products = getAllProducts();
  const suggestions = suggestKeywords(q, {
    limit,
    markets,
    onsiteSearches: { ...getSearchLog(), ...conversionSignals() },
    corpus: products.flatMap((p) => [p.title, ...(p.seo?.keywords ?? []).slice(0, 6).map((k) => k.term), ...p.tags]),
  });

  return NextResponse.json({
    query: q,
    suggestions: suggestions.map((s) => ({
      term: s.term,
      volume: s.volume,
      difficulty: s.difficulty,
      cpc: s.cpc,
      priority: s.priority,
      intent: s.intent,
      trend: s.trend,
      source: s.source,
      serpFeatures: s.serpFeatures,
    })),
    onsite: Object.entries(getSearchLog())
      .filter(([term]) => q && term.includes(q.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term, count]) => ({ term, count })),
  });
}

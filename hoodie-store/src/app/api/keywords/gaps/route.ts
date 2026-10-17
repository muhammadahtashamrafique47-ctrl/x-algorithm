import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { contentGaps, keywordOwnership, topKeywordsAcrossCatalogue, buildInternalCompetitionMap } from "@/lib/seo/internal";
import { getAllProducts, getSearchLog } from "@/lib/store/db";
import { filterProducts } from "@/lib/commerce/catalog";
import { tokenize } from "@/lib/seo/text";

export const dynamic = "force-dynamic";

/**
 * GET /api/keywords/gaps
 *
 * Demand-side intelligence: queries shoppers search for on-site that no
 * published listing targets, keywords contested by several listings
 * (cannibalization), and the terms the catalogue owns today.
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const products = getAllProducts();
  const published = products.filter((p) => p.status === "published");
  const searchLog = getSearchLog();

  const gaps = contentGaps(Number(url.searchParams.get("limit") ?? 25));
  const ownership = keywordOwnership(published);
  const contested = Object.entries(ownership)
    .filter(([, owners]) => owners.length > 1)
    .map(([term, owners]) => ({ term, owners: owners.map((o) => ({ slug: o.slug, title: o.title, priority: o.priority })) }))
    .sort((a, b) => b.owners.length - a.owners.length)
    .slice(0, 25);

  const zeroResult = Object.entries(searchLog)
    .filter(([term, count]) => count >= 1 && filterProducts({ q: term }, published).length === 0)
    .sort((a, b) => b[1] - a[1])
    .map(([term, count]) => ({ term, count, tokens: tokenize(term).join(" ") }));

  const competition = buildInternalCompetitionMap(products);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    gaps: gaps.map((gap) => ({
      ...gap,
      competingListings: Object.entries(competition)
        .filter(([term]) => tokenize(term).some((t) => tokenize(gap.term).includes(t)))
        .slice(0, 3)
        .map(([term, count]) => ({ term, count })),
    })),
    zeroResultSearches: zeroResult,
    contestedKeywords: contested,
    ownedKeywords: topKeywordsAcrossCatalogue(30),
    totals: {
      gaps: gaps.length,
      contested: contested.length,
      zeroResult: zeroResult.length,
      searchedTerms: Object.keys(searchLog).length,
      targetedTerms: Object.keys(ownership).length,
    },
  });
}

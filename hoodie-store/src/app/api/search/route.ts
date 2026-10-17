import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { searchEverything } from "@/lib/commerce/catalog";
import { logSearch } from "@/lib/store/db";
import { summarizeProduct } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=...&limit=8
 *
 * Storefront search API. Logs the query as first-party demand (unless the
 * caller opts out with `log=false`, used by admin previews and crawlers).
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Number(url.searchParams.get("limit") ?? 8);

  if (q.length >= 3 && url.searchParams.get("log") !== "false") logSearch(q);

  const results = searchEverything(q, limit);
  return NextResponse.json({
    query: q,
    total: results.products.length,
    products: results.products.map((product) => ({
      slug: product.slug,
      title: product.title,
      price: product.price,
      image: product.images[0]?.src ?? "/images/site/placeholder.jpg",
      rating: product.rating,
      reviewCount: product.reviewCount,
      weightGsm: product.weightGsm,
      category: product.category,
      primaryKeyword: product.seo?.keywords?.[0]?.term,
      score: product.seo?.score?.total,
    })),
    collections: results.collections.map((c) => ({ slug: c.slug, name: c.name })),
    articles: results.articles,
    detailed: url.searchParams.get("view") === "full" ? results.products.map(summarizeProduct) : undefined,
  });
}

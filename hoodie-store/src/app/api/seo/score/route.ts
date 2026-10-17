import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts } from "@/lib/store/db";
import { auditProduct } from "@/lib/seo/audit";
import { buildScoringContext, scoreListing } from "@/lib/seo/scoring";
import { trafficForecast, serpLandscape } from "@/lib/seo/external";
import { fullProduct } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/**
 * GET /api/seo/score?slug=meridian-450-heavyweight-hoodie
 *
 * Re-scores a single listing on demand (without changing it) and returns the
 * factor breakdown, issues, cannibalization risks and a traffic forecast.
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? url.searchParams.get("id") ?? "";
  const product = getAllProducts().find((p) => p.slug === slug || p.id === slug);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const liveScore = scoreListing(product, product.seo, buildScoringContext(product));
  const audit = auditProduct(product);
  const primary = product.seo?.keywords?.[0];

  return NextResponse.json({
    slug: product.slug,
    storedScore: product.seo?.score,
    liveScore,
    drift: Math.round((liveScore.total - (product.seo?.score?.total ?? 0)) * 10) / 10,
    audit,
    forecast: {
      position3: trafficForecast(product.seo?.keywords ?? [], 3),
      position5: trafficForecast(product.seo?.keywords ?? [], 5),
      position10: trafficForecast(product.seo?.keywords ?? [], 10),
    },
    serp: primary ? serpLandscape(primary.term, primary.difficulty, primary.serpFeatures) : null,
    product: url.searchParams.get("view") === "full" ? fullProduct(product) : undefined,
  });
}

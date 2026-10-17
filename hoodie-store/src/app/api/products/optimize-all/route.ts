import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { optimizeCatalogue } from "@/lib/seo/optimizer";
import { recomputeMetrics } from "@/lib/commerce/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/products/optimize-all
 *
 * Re-runs the AI pipeline across the catalogue (or only unoptimized/draft
 * listings). This is the nightly job equivalent: keyword targets are refreshed
 * against the latest first-party signals, copy is regenerated where the score
 * dropped, and cannibalization is re-checked against the whole catalogue.
 */
export async function POST(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    onlyDrafts?: boolean;
    month?: number;
    targetMarkets?: string[];
    passes?: number;
    limit?: number;
  };

  const report = await optimizeCatalogue({
    onlyDrafts: body.onlyDrafts ?? url.searchParams.get("drafts") === "true",
    month: body.month,
    targetMarkets: body.targetMarkets,
    passes: body.passes ?? 3,
    limit: body.limit ?? Number(url.searchParams.get("limit") ?? undefined),
  });

  recomputeMetrics();

  return NextResponse.json({
    ...report,
    finishedAt: new Date().toISOString(),
    improved: report.results.filter((r) => r.after > r.before).length,
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { analyticsSummary, rankTracker, recomputeMetrics } from "@/lib/commerce/analytics";
import { getSiteStats } from "@/lib/store/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics?days=30
 *
 * First-party performance roll-up: impressions, clicks, CTR, orders, revenue,
 * daily series, market split, per-product and per-keyword breakdowns plus the
 * keyword rank tracker.
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? 30);

  if (url.searchParams.get("recompute") === "true") recomputeMetrics();

  return NextResponse.json({
    window: days,
    totals: getSiteStats(),
    summary: analyticsSummary(days),
    rankTracker: rankTracker(Number(url.searchParams.get("rankLimit") ?? 30)),
    generatedAt: new Date().toISOString(),
    note: "Sample analytics are seeded on first boot so the measurement loop can be demonstrated end to end. Connect Search Console / GA4 to replace them with live data.",
  });
}

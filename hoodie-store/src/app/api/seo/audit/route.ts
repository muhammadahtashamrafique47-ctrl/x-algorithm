import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { runSiteAudit } from "@/lib/seo/audit";
import { aiStatus } from "@/lib/seo/ai/provider";
import { ALGORITHM_FACTORS } from "@/lib/seo/external";
import { SITE_URL } from "@/lib/i18n/markets";

export const dynamic = "force-dynamic";

/**
 * GET /api/seo/audit — full site audit: score, factor health, issues,
 * opportunities, technical checklist and performance roll-up.
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const audit = runSiteAudit();
  const format = url.searchParams.get("format");

  if (format === "text") {
    const lines = [
      `SEO AUDIT — ${SITE_URL}`,
      `Generated ${audit.generatedAt}`,
      `Site score: ${audit.score}/100 (${audit.grade})`,
      "",
      `Catalogue: ${audit.counts.published} published / ${audit.counts.products} total`,
      `Keywords targeted: ${audit.counts.keywordsTargeted} · Markets: ${audit.counts.markets} · Locales: ${audit.counts.locales}`,
      "",
      "RANKING-SYSTEM HEALTH",
      ...audit.factorHealth.map((f) => `  ${f.name.padEnd(38)} ${Math.round(f.averageRatio * 100)}% (${f.status})`),
      "",
      `ISSUES (${audit.issues.length})`,
      ...audit.issues.map((i) => `  [${i.severity.toUpperCase()}] ${i.title} — ${i.action}`),
      "",
      "TECHNICAL CHECKS",
      ...audit.technical.map((t) => `  ${t.passed ? "PASS" : "FAIL"}  ${t.check}: ${t.detail}`),
      "",
      `PERFORMANCE  impressions ${audit.performance.impressions} · clicks ${audit.performance.clicks} · CTR ${audit.performance.ctr}% · orders ${audit.performance.orders} · revenue $${audit.performance.revenue}`,
      `Forecast monthly organic clicks at current targets: ${audit.performance.forecastMonthlyClicks.toLocaleString()}`,
    ];
    return new NextResponse(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  return NextResponse.json({ ...audit, ai: aiStatus(), algorithmFactors: ALGORITHM_FACTORS });
}

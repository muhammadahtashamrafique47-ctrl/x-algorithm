import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, upsertProduct } from "@/lib/store/db";
import { optimizeProduct } from "@/lib/seo/optimizer";
import { fullProduct } from "@/lib/api/serialize";
import { auditProduct } from "@/lib/seo/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/products/:id/optimize
 *
 * Re-runs the full AI pipeline on one listing: keyword research → copy
 * generation → scoring → auto-fix loop → optional LLM refinement. Returns the
 * before/after score so the admin UI can show the lift.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureCatalogue();
  const { id } = await params;
  const product = getAllProducts().find((p) => p.id === id) ?? getAllProducts().find((p) => p.slug === id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    month?: number;
    targetMarkets?: string[];
    passes?: number;
    useLlm?: boolean;
    preserveSlug?: boolean;
    publish?: boolean;
  };

  const before = product.seo?.score?.total ?? 0;
  const optimized = await optimizeProduct(product, {
    month: body.month,
    targetMarkets: body.targetMarkets,
    passes: body.passes ?? 4,
    useLlm: body.useLlm,
    preserveSlug: body.preserveSlug ?? true,
  });
  if (body.publish) {
    optimized.status = "published";
    optimized.publishedAt = optimized.publishedAt ?? new Date().toISOString();
  }
  upsertProduct(optimized);

  return NextResponse.json({
    slug: optimized.slug,
    before,
    after: optimized.seo.score.total,
    lift: Math.round((optimized.seo.score.total - before) * 10) / 10,
    grade: optimized.seo.score.grade,
    engine: optimized.seo.engine,
    passes: optimized.seo.passes,
    autoFixes: optimized.seo.issues.filter((i) => i.field === "optimization").map((i) => i.message),
    product: fullProduct(optimized),
    audit: auditProduct(optimized),
  });
}

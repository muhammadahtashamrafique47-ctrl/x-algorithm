import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { deleteProduct, getAllProducts, upsertProduct } from "@/lib/store/db";
import { normalizeDraft, optimizeProduct } from "@/lib/seo/optimizer";
import { fullProduct, summarizeProduct } from "@/lib/api/serialize";
import { auditProduct } from "@/lib/seo/audit";
import type { ProductDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

function resolve(idOrSlug: string) {
  const products = getAllProducts();
  return products.find((p) => p.id === idOrSlug) ?? products.find((p) => p.slug === idOrSlug);
}

/** GET /api/products/:id — full record + per-listing audit */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureCatalogue();
  const { id } = await params;
  const product = resolve(id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json({ product: fullProduct(product), audit: auditProduct(product) });
}

/** PATCH /api/products/:id — update fields, optionally re-run the AI pipeline */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureCatalogue();
  const { id } = await params;
  const existing = resolve(id);
  if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const payload = (await request.json()) as ProductDraft & { optimize?: boolean; reoptimize?: boolean; preserveSlug?: boolean };
  const merged = normalizeDraft(payload, existing);

  const shouldOptimize = payload.optimize !== false && (payload.reoptimize ?? true);
  const product = shouldOptimize
    ? await optimizeProduct(merged, { preserveSlug: payload.preserveSlug ?? true })
    : { ...merged, seo: merged.seo };

  upsertProduct(product);
  return NextResponse.json({
    product: summarizeProduct(product),
    optimized: shouldOptimize,
    score: product.seo?.score?.total ?? 0,
    grade: product.seo?.score?.grade ?? "F",
  });
}

/** DELETE /api/products/:id */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureCatalogue();
  const { id } = await params;
  const product = resolve(id);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  deleteProduct(product.id);
  return NextResponse.json({ deleted: true, slug: product.slug });
}

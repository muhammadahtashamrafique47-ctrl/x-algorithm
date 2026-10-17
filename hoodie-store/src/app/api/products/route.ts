import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, upsertProduct } from "@/lib/store/db";
import { normalizeDraft, optimizeProduct } from "@/lib/seo/optimizer";
import { summarizeProduct, fullProduct } from "@/lib/api/serialize";
import { filterProducts, paginate } from "@/lib/commerce/catalog";
import type { ProductDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/products — list products (summaries by default, full records with ?view=full)
 * POST /api/products — upload a product; the AI SEO pipeline runs automatically
 */
export async function GET(request: NextRequest) {
  await ensureCatalogue();
  const url = new URL(request.url);
  const products = getAllProducts();
  const filtered = filterProducts(
    {
      q: url.searchParams.get("q") ?? undefined,
      collection: url.searchParams.get("collection") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      sort: (url.searchParams.get("sort") as never) ?? "featured",
    },
    url.searchParams.get("status") === "all" ? products : products.filter((p) => p.status !== "archived"),
  );
  const page = paginate(filtered, Number(url.searchParams.get("page") ?? 1), Number(url.searchParams.get("perPage") ?? 50));
  const view = url.searchParams.get("view") === "full" ? fullProduct : summarizeProduct;

  return NextResponse.json({
    total: page.total,
    page: page.page,
    pages: page.pages,
    products: page.items.map((product) => view(product)),
  });
}

export async function POST(request: NextRequest) {
  await ensureCatalogue();
  const payload = (await request.json()) as ProductDraft & {
    optimize?: boolean;
    publish?: boolean;
    month?: number;
    targetMarkets?: string[];
    passes?: number;
  };

  if (!payload.title || !String(payload.title).trim()) {
    return NextResponse.json({ error: "A product title is required." }, { status: 400 });
  }

  const normalized = normalizeDraft({
    ...payload,
    status: payload.publish === false ? "draft" : (payload.status ?? "published"),
  });

  if (payload.optimize === false) {
    upsertProduct(normalized);
    return NextResponse.json({ product: summarizeProduct(normalized), optimized: false }, { status: 201 });
  }

  const optimized = await optimizeProduct(normalized, {
    month: payload.month,
    targetMarkets: payload.targetMarkets as string[] | undefined,
    passes: payload.passes,
  });
  upsertProduct(optimized);

  return NextResponse.json(
    {
      product: summarizeProduct(optimized),
      optimized: true,
      engine: optimized.seo.engine,
      passes: optimized.seo.passes,
      score: optimized.seo.score.total,
      grade: optimized.seo.score.grade,
      previousScore: optimized.seo.previousScore ?? 0,
      primaryKeyword: optimized.seo.keywords[0]?.term,
      autoFixes: optimized.seo.issues.filter((i) => i.field === "optimization").map((i) => i.message),
    },
    { status: 201 },
  );
}

import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { upsertProduct } from "@/lib/store/db";
import { normalizeDraft, optimizeProduct } from "@/lib/seo/optimizer";
import { csvRowsToDrafts, detectFormat, parseCsv } from "@/lib/commerce/csv";
import type { ProductDraft } from "@/lib/types";

export const dynamic = "force-dynamic";

export const CSV_TEMPLATE = `title,sku,category,gender,price,compare_at_price,currency,material,weight_gsm,fit,sizes,colors,features,description,care_instructions,country_of_origin,tags,collections,images,inventory,rating,review_count,status
Apex 420 Heavyweight Hoodie,NL-APX-420,heavyweight,unisex,112,139,USD,100% combed cotton loopback,420,regular,"S,M,L,XL,2XL","Black,Sand","Double-needle stitching;Lined hood;Bar-tacked pocket","A 420 GSM heavyweight pullover built for cold commutes.","Machine wash cold inside out, tumble dry low.",Portugal,"heavyweight,winter","men,heavyweight,winter",/images/products/apex-420-black.jpg,120,4.7,86,published`;

/**
 * POST /api/products/import
 *
 * Bulk upload from CSV or JSON. Each row goes through the identical pipeline as
 * a single manual upload (normalize → keyword research → copy generation →
 * scoring → auto-fix), so a 200-row spreadsheet arrives fully optimized.
 *
 * Accepts:
 *   - multipart/form-data with a `file` field (.csv or .json)
 *   - text/csv or text/plain raw body
 *   - application/json { data: [...] } or { csv: "..." }
 */
export async function POST(request: NextRequest) {
  await ensureCatalogue();
  const contentType = request.headers.get("content-type") ?? "";
  let text = "";
  let jsonDrafts: ProductDraft[] | null = null;
  let fileName = "upload";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (file instanceof File) {
        fileName = file.name;
        text = await file.text();
      }
      const publishFlag = form.get("publish");
      if (publishFlag === "false") jsonDrafts = null;
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { data?: unknown; csv?: string; products?: ProductDraft[] };
      if (typeof body.csv === "string") text = body.csv;
      else if (Array.isArray(body.data)) jsonDrafts = body.data as ProductDraft[];
      else if (Array.isArray(body.products)) jsonDrafts = body.products;
      else text = "";
    } else {
      text = await request.text();
    }
  } catch (error) {
    return NextResponse.json({ error: `Could not read the upload: ${(error as Error).message}` }, { status: 400 });
  }

  let drafts: ProductDraft[] = [];
  const format = jsonDrafts ? "json" : fileName.endsWith(".json") ? "json" : detectFormat(text || "csv");

  if (jsonDrafts) {
    drafts = jsonDrafts;
  } else if (format === "json" && text) {
    try {
      const parsed = JSON.parse(text);
      drafts = Array.isArray(parsed) ? parsed : parsed.products ?? [];
    } catch (error) {
      return NextResponse.json({ error: `Invalid JSON: ${(error as Error).message}` }, { status: 400 });
    }
  } else if (text) {
    const rows = parseCsv(text);
    if (!rows.length) return NextResponse.json({ error: "The CSV contained no data rows." }, { status: 400 });
    drafts = csvRowsToDrafts(rows);
  }

  if (!drafts.length) {
    return NextResponse.json({ error: "No products found in the upload. Expected a `title` column (CSV) or an array of product objects (JSON)." }, { status: 400 });
  }

  const url = new URL(request.url);
  const optimize = url.searchParams.get("optimize") !== "false";
  const results: {
    title: string;
    slug?: string;
    status: "created" | "failed";
    score?: number;
    grade?: string;
    primaryKeyword?: string;
    error?: string;
  }[] = [];

  for (const draft of drafts.slice(0, 500)) {
    try {
      if (!draft.title) throw new Error("missing title");
      const normalized = normalizeDraft(draft);
      const product = optimize ? await optimizeProduct(normalized, {}) : normalized;
      upsertProduct(product);
      results.push({
        title: product.title,
        slug: product.slug,
        status: "created",
        score: product.seo?.score?.total,
        grade: product.seo?.score?.grade,
        primaryKeyword: product.seo?.keywords?.[0]?.term,
      });
    } catch (error) {
      results.push({ title: String(draft.title ?? "unknown"), status: "failed", error: (error as Error).message });
    }
  }

  const created = results.filter((r) => r.status === "created");
  return NextResponse.json(
    {
      format,
      received: drafts.length,
      created: created.length,
      failed: results.length - created.length,
      averageScore: created.length ? Math.round((created.reduce((s, r) => s + (r.score ?? 0), 0) / created.length) * 10) / 10 : 0,
      results,
      createdSlugs: created.map((r) => r.slug),
      productSummaries: created.slice(0, 10),
    },
    { status: 201 },
  );
}

/** GET /api/products/import — returns the CSV template merchants can fill in. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("template") === "csv") {
    return new NextResponse(CSV_TEMPLATE, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="hoodie-import-template.csv"',
      },
    });
  }
  return NextResponse.json({
    formats: ["csv", "json"],
    columns: Object.keys(parseCsv(CSV_TEMPLATE)[0] ?? {}),
    template: CSV_TEMPLATE,
    notes: [
      "Only `title` is required — every other field is inferred or filled with a sensible default.",
      "Multi-value columns (sizes, colors, tags, features, collections, images) accept comma, semicolon or pipe separated values.",
      "Each imported row is auto-optimized unless ?optimize=false is passed.",
      "Images may be absolute URLs or /public paths; the upload endpoint can host files first.",
    ],
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { appendEvents, getAllProducts, upsertProduct } from "@/lib/store/db";
import { recomputeMetrics } from "@/lib/commerce/analytics";
import { MARKET_BY_COUNTRY } from "@/lib/i18n/markets";
import { round } from "@/lib/seo/text";
import type { TrackEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

type CheckoutLine = { slug: string; title?: string; size?: string; color?: string; qty: number; price: number };
type CheckoutPayload = {
  email?: string;
  name?: string;
  country?: string;
  address?: string;
  city?: string;
  postcode?: string;
  method?: string;
  lines?: CheckoutLine[];
  source?: string;
};

/**
 * POST /api/checkout
 *
 * Demonstration checkout: validates the order, decrements inventory, records
 * attributed `purchase` events (including the keyword that brought the shopper
 * in) and returns an order reference. No payment is taken.
 */
export async function POST(request: NextRequest) {
  await ensureCatalogue();
  const payload = (await request.json().catch(() => ({}))) as CheckoutPayload;
  const lines = (payload.lines ?? []).filter((line) => line.slug && line.qty > 0);
  if (!lines.length) return NextResponse.json({ error: "No items to check out." }, { status: 400 });
  if (!payload.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const products = getAllProducts();
  const subtotal = round(lines.reduce((sum, line) => sum + line.qty * (line.price || 0), 0), 2);
  const shipping = subtotal >= 75 ? 0 : 6.95;
  const total = round(subtotal + shipping, 2);
  const market = (payload.country ?? "US").toUpperCase();
  const orderId = `NL-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
  const keyword = typeof payload.source === "string" && payload.source && payload.source !== "direct" ? payload.source.toLowerCase() : undefined;

  const events: TrackEvent[] = [];
  for (const line of lines) {
    const product = products.find((p) => p.slug === line.slug);
    if (!product) continue;

    // Decrement inventory for the purchased size when we know it.
    if (line.size && product.inventory?.[line.size] !== undefined) {
      product.inventory = { ...product.inventory, [line.size]: Math.max(0, product.inventory[line.size] - line.qty) };
    }
    product.metrics = {
      ...product.metrics,
      purchases: (product.metrics?.purchases ?? 0) + line.qty,
      revenue: round((product.metrics?.revenue ?? 0) + line.qty * line.price, 2),
    };
    upsertProduct(product);

    for (let i = 0; i < line.qty; i++) {
      events.push({ type: "purchase", productSlug: line.slug, value: line.price, keyword, market, source: "checkout" });
    }
  }
  appendEvents(events);
  recomputeMetrics();

  return NextResponse.json({
    orderId,
    status: "confirmed",
    email: payload.email,
    market,
    marketName: MARKET_BY_COUNTRY[market]?.name ?? market,
    currency: MARKET_BY_COUNTRY[market]?.currency ?? "USD",
    items: lines.reduce((sum, line) => sum + line.qty, 0),
    subtotal,
    shipping,
    total,
    attributedKeyword: keyword ?? "direct",
    deliveryEstimate: `${new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)} → ${new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10)}`,
    note: "Demonstration checkout — no payment was taken. The purchase events feed the SEO conversion log.",
  });
}

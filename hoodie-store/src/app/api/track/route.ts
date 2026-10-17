import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { appendEvents, recordEvent } from "@/lib/store/db";
import { recomputeMetrics } from "@/lib/commerce/analytics";
import type { TrackEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: TrackEvent["type"][] = ["impression", "click", "view", "add_to_cart", "purchase", "search", "keyword_rank"];

/**
 * POST /api/track — first-party measurement beacon.
 *
 * Accepts a single event, a batch ({ events: [...] }), JSON or sendBeacon's
 * text/plain body. Every event feeds the loop that re-ranks keyword targets and
 * flags under-performing titles on the next optimization pass.
 */
export async function POST(request: NextRequest) {
  await ensureCatalogue();
  const contentType = request.headers.get("content-type") ?? "";
  let payload: Partial<TrackEvent> & { events?: Partial<TrackEvent>[] } = {};

  try {
    if (contentType.includes("application/json")) payload = await request.json();
    else {
      const text = await request.text();
      payload = text ? (JSON.parse(text) as typeof payload) : {};
    }
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const incoming = (payload.events ?? [payload]).filter((event): event is Partial<TrackEvent> => Boolean(event && event.type));
  const events: TrackEvent[] = incoming
    .filter((event) => VALID.includes(event.type as TrackEvent["type"]))
    .map((event) => ({
      type: event.type as TrackEvent["type"],
      productSlug: typeof event.productSlug === "string" ? event.productSlug.slice(0, 120) : undefined,
      keyword: typeof event.keyword === "string" ? event.keyword.toLowerCase().slice(0, 120) : undefined,
      market: typeof event.market === "string" ? event.market.toUpperCase().slice(0, 2) : undefined,
      value: typeof event.value === "number" && Number.isFinite(event.value) ? event.value : undefined,
      position: typeof event.position === "number" ? event.position : undefined,
      source: typeof event.source === "string" ? event.source.slice(0, 60) : undefined,
      at: new Date().toISOString(),
    }));

  if (!events.length) return new NextResponse(null, { status: 204 });

  if (events.length === 1) recordEvent(events[0]);
  else appendEvents(events);

  // Keep denormalised product metrics fresh on money events only.
  if (events.some((event) => event.type === "purchase" || event.type === "add_to_cart")) recomputeMetrics();

  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ ok: true, accepted: VALID });
}

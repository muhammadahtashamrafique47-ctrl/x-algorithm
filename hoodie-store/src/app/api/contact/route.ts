import { NextResponse, type NextRequest } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getSettings, saveSettings } from "@/lib/store/db";
import { SUPPORT_EMAIL } from "@/lib/i18n/markets";

export const dynamic = "force-dynamic";

/**
 * Host-relative 303. `NextResponse.redirect(new URL(path, request.url))` bakes
 * in whatever host the server is bound to (0.0.0.0 behind a proxy), which sends
 * the shopper's browser somewhere it cannot resolve. A relative Location is
 * resolved by the browser against the origin it is already on.
 */
function seeOther(location: string) {
  return new NextResponse(null, { status: 303, headers: { location } });
}

type Message = { name: string; email: string; order?: string; topic: string; message: string; at: string };

/**
 * POST /api/contact — storefront contact form.
 *
 * Messages are persisted locally so nothing is silently dropped; point this at
 * your inbox (Resend/Postmark/Help Scout) in production by replacing the
 * `persist` call with the provider SDK.
 */
export async function POST(request: NextRequest) {
  await ensureCatalogue();
  const contentType = request.headers.get("content-type") ?? "";

  let payload: Partial<Message> = {};
  if (contentType.includes("application/json")) {
    payload = (await request.json()) as Message;
  } else {
    const form = await request.formData();
    payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      order: String(form.get("order") ?? "") || undefined,
      topic: String(form.get("topic") ?? "order"),
      message: String(form.get("message") ?? ""),
    };
  }

  if (!payload.email || !payload.message) {
    return seeOther("/contact?error=email+and+message+are+required");
  }

  const settings = getSettings();
  const messages = ((settings.messages as Message[]) ?? []).slice(-499);
  messages.push({
    name: payload.name ?? "Anonymous",
    email: payload.email,
    order: payload.order,
    topic: payload.topic ?? "order",
    message: payload.message,
    at: new Date().toISOString(),
  });
  saveSettings({ ...settings, messages });

  return seeOther(`/contact?sent=1&to=${encodeURIComponent(SUPPORT_EMAIL)}`);
}

export async function GET() {
  await ensureCatalogue();
  const messages = (getSettings().messages as Message[]) ?? [];
  return NextResponse.json({ count: messages.length, messages: messages.slice(-50).reverse() });
}

import { NextResponse, type NextRequest } from "next/server";
import { getSettings, saveSettings } from "@/lib/store/db";

export const dynamic = "force-dynamic";

/** POST /api/subscribe — newsletter / restock alert signup from the footer. */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let email = "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } else {
    const form = await request.formData();
    email = String(form.get("email") ?? "").trim().toLowerCase();
  }

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const settings = getSettings();
  const subscribers = new Set<string>(((settings.subscribers as string[]) ?? []).map((e) => e.toLowerCase()));
  if (valid) subscribers.add(email);
  saveSettings({ ...settings, subscribers: [...subscribers] });

  if (contentType.includes("application/json")) {
    return NextResponse.json({ subscribed: valid, email: valid ? email : undefined, total: subscribers.size });
  }

  const location = valid ? "/?subscribed=1" : "/contact?error=Enter+a+valid+email+address";
  return new NextResponse(null, { status: 303, headers: { location } });
}

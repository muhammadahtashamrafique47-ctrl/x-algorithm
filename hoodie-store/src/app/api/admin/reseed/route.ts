import { NextResponse } from "next/server";
import { reseedCatalogue } from "@/lib/store/bootstrap";
import { getSiteStats } from "@/lib/store/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/admin/reseed — rebuild the demo catalogue through the AI pipeline. */
export async function POST() {
  const result = await reseedCatalogue();
  return NextResponse.json({ ...result, stats: getSiteStats(), finishedAt: new Date().toISOString() });
}

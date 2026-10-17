/**
 * Preview-origin bootstrap (runs as `predev` / `prebuild`).
 *
 * NEXT_PUBLIC_SITE_URL is inlined at BUILD time, so canonical, hreflang, OG and
 * sitemap URLs are frozen to whatever the env said when `next build` ran. Inside
 * an Arena/E2B preview the public origin is `https://{port}-{sandboxId}.e2b.app`
 * and it changes every time the sandbox is recycled — if the build happens with
 * the default instead, the site emits `http://localhost:3000` absolute URLs that
 * resolve against the *viewer's* machine and break the preview.
 *
 * This writes that origin into `.env.local` before the build. It is a no-op
 * outside a sandbox and never overwrites a real domain: only a value that is
 * itself an `*.e2b.app` preview host (i.e. one this script wrote earlier, from a
 * now-dead sandbox) is refreshed.
 */
import fs from "node:fs";
import path from "node:path";

const sandboxId = process.env.E2B_SANDBOX_ID;
if (!sandboxId) process.exit(0);

const port = process.env.PORT ?? "3000";
const wanted = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${port}-${sandboxId}.e2b.app`;
const file = path.resolve(".env.local");

let existing = "";
try {
  existing = fs.readFileSync(file, "utf8");
} catch {
  existing = "";
}

const current = /^\s*NEXT_PUBLIC_SITE_URL\s*=\s*(.+)\s*$/m.exec(existing)?.[1]?.trim();

const isPreviewHost = (value) => {
  try {
    return /(^|\.)e2b\.app$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
};

if (current && current === wanted) process.exit(0);
// A configured real domain wins; only refresh our own stale preview host.
if (current && !isPreviewHost(current)) {
  console.log(`[preview-env] keeping NEXT_PUBLIC_SITE_URL=${current}`);
  process.exit(0);
}

const rest = existing
  .split("\n")
  .filter((line) => !/^\s*NEXT_PUBLIC_SITE_URL\s*=/.test(line))
  .join("\n")
  .trim();

fs.writeFileSync(file, `${rest ? `${rest}\n` : ""}NEXT_PUBLIC_SITE_URL=${wanted}\n`);
console.log(`[preview-env] NEXT_PUBLIC_SITE_URL=${wanted}`);

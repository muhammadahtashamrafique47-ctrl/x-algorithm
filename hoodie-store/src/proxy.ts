import { NextResponse, type NextRequest } from "next/server";

/**
 * Network-boundary rules that have to be decided per request.
 *
 * 1. **Framing.** `X-Frame-Options` cannot allowlist another origin, and a
 *    static `frame-ancestors` list cannot know the host in advance: a preview,
 *    tunnel or staging wrapper embeds this app from a *different* origin than
 *    the one it is served on, and the browser then renders a blank frame even
 *    though every route returns 200. So the policy is derived from the host the
 *    request actually arrived on — permissive for sandbox/loopback hosts, where
 *    embedding is the whole point, and `'self'` (clickjacking-safe) on any real
 *    domain. `FRAME_ANCESTORS` overrides both; set it to `off` to omit the
 *    header entirely. Only `frame-ancestors` is sent: a full CSP with
 *    `script-src` would break Next.js inline hydration scripts.
 *
 * 2. **Probes.** Proxies and preview harnesses sometimes probe with `OPTIONS`.
 *    App Router *pages* answer that with a bare 400, which reads as a broken
 *    deployment, so it is answered here with 204 instead.
 */

const SANDBOX_HOST = /(^|\.)(e2b\.app|e2b\.dev|local-credentialless\.e2b\.app)$/i;
const LOOPBACK_HOST = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i;

const bareHost = (request: NextRequest) =>
  (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/:\d+$/, "")
    .replace(/\/$/, "");

export default function proxy(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204 });
  }

  const response = NextResponse.next();
  const host = bareHost(request);
  const embeddableByHost = SANDBOX_HOST.test(host) || LOOPBACK_HOST.test(host) ? "*" : "'self'";
  const frameAncestors = process.env.FRAME_ANCESTORS ?? embeddableByHost;

  if (frameAncestors !== "off") {
    response.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
  }

  return response;
}

export const config = {
  // Everything except build output, which never needs framing rules.
  matcher: ["/((?!_next/static/|_next/image/).*)"],
};

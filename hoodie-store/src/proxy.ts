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
 *    header. Only `frame-ancestors` is sent: a full CSP with `script-src` would
 *    break Next.js inline hydration scripts.
 *
 * 2. **CORS / probes.** A preview harness that proxies to the app with an access
 *    token (e.g. E2B's `e2b-traffic-access-token`) cannot attach that header to
 *    an iframe navigation, so it fetches instead — and a cross-origin fetch with
 *    a custom header triggers a preflight. App Router *pages* answer `OPTIONS`
 *    with a bare 400, and even a 204 without CORS headers fails that preflight,
 *    which surfaces as a blank preview. So `OPTIONS` is answered here with 204
 *    plus, on sandbox/loopback hosts or when `CORS_ORIGINS` allows the caller,
 *    the headers a preflight asks for. Credentials are never allowed, so this
 *    only ever exposes public catalogue data.
 */

const SANDBOX_HOST = /(^|\.)(e2b\.app|e2b\.dev)$/i;
const LOOPBACK_HOST = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i;

/** What a preflight may ask for when the caller is trusted to embed/preview. */
const ALLOW_HEADERS =
  "content-type, authorization, x-requested-with, x-forwarded-host, x-forwarded-proto, e2b-traffic-access-token";
const ALLOW_METHODS = "GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS";

const bareHost = (request: NextRequest) =>
  (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/:\d+$/, "")
    .replace(/\/$/, "");

/**
 * Is this caller allowed to make cross-origin requests? Preview/sandbox hosts
 * say yes (that is what they are for); a real domain says no unless
 * `CORS_ORIGINS` names it. `CORS_ORIGINS="*"` opens it everywhere.
 */
function corsAllows(request: NextRequest, host: string): boolean {
  const configured = (process.env.CORS_ORIGINS ?? "").trim();
  const origin = request.headers.get("origin");

  if (configured === "*") return true;
  if (configured) {
    if (!origin) return false;
    return configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .some((entry) => (entry.startsWith("*.") ? origin.endsWith(entry.slice(1)) : entry === origin));
  }
  return SANDBOX_HOST.test(host) || LOOPBACK_HOST.test(host);
}

export default function proxy(request: NextRequest) {
  const host = bareHost(request);
  const openCors = corsAllows(request, host);
  const origin = request.headers.get("origin");

  if (request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    if (openCors) {
      preflight.headers.set("Access-Control-Allow-Origin", origin ?? "*");
      preflight.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
      preflight.headers.set(
        "Access-Control-Allow-Headers",
        request.headers.get("access-control-request-headers") ?? ALLOW_HEADERS,
      );
      preflight.headers.set("Access-Control-Max-Age", "86400");
      if (origin) preflight.headers.append("Vary", "Origin");
    }
    return preflight;
  }

  const response = NextResponse.next();

  const embeddableByHost = SANDBOX_HOST.test(host) || LOOPBACK_HOST.test(host) ? "*" : "'self'";
  const frameAncestors = process.env.FRAME_ANCESTORS ?? embeddableByHost;
  if (frameAncestors !== "off") {
    response.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
  }

  if (openCors) {
    response.headers.set("Access-Control-Allow-Origin", origin ?? "*");
    response.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
    if (origin) response.headers.append("Vary", "Origin");
  }

  return response;
}

export const config = {
  // Everything except build output, which never needs framing or CORS rules.
  matcher: ["/((?!_next/static/|_next/image/).*)"],
};

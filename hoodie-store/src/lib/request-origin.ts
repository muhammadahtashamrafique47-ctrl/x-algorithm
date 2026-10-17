import { headers } from "next/headers";
import { SITE_URL } from "@/lib/i18n/markets";

const LOCAL_HOSTS = /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i;
const PRIVATE_HOSTS = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const ALLOW_HTTP = process.env.ALLOW_HTTP_ORIGIN === "1";

/**
 * The origin this request actually arrived on.
 *
 * `SITE_URL` is a deploy-time constant: right for a production domain, wrong
 * behind a proxy, a preview host or a staging tunnel. An absolute
 * `http://localhost:3000` in a canonical, hreflang or OG image resolves against
 * whoever is *viewing* the page, so it silently breaks previews and social
 * cards. Request-scoped surfaces (metadata, sitemap, robots, feeds, JSON-LD)
 * therefore prefer the forwarded host.
 *
 * Scheme rules, in order:
 *  1. a configured origin that already points at this host wins (it carries the
 *     scheme the operator intended);
 *  2. otherwise public hostnames are https — a bare `x-forwarded-proto: http`
 *     is usually the local hop between proxy and app, not the public scheme;
 *  3. `http` is only used for private/loopback hosts, or with ALLOW_HTTP_ORIGIN=1.
 *
 * Only call this while rendering a request (server component, route handler or
 * generateMetadata); outside one it falls back to SITE_URL.
 */
export async function requestOrigin(): Promise<string> {
  let host: string | null = null;
  let forwardedProto: string | null = null;

  try {
    const headerStore = await headers();
    host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
    forwardedProto = headerStore.get("x-forwarded-proto");
  } catch {
    /* outside a request scope */
  }

  const clean = (host ?? "")
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

  if (!clean || LOCAL_HOSTS.test(clean)) return SITE_URL;

  try {
    if (new URL(SITE_URL).host === clean) return SITE_URL;
  } catch {
    /* misconfigured SITE_URL — fall through to the request host */
  }

  const useHttp = forwardedProto === "http" && (ALLOW_HTTP || PRIVATE_HOSTS.test(clean));
  return `${useHttp ? "http" : "https"}://${clean}`;
}

/** Absolute URL for a path, against the origin this request arrived on. */
export async function absoluteUrl(path: string): Promise<string> {
  const siteOrigin = await requestOrigin();
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteOrigin}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Rewrite a stored absolute URL onto an origin.
 *
 * SEO profiles persist absolute hreflang/localization URLs when they are
 * generated, so a later host change (or a first run without env config) would
 * otherwise leak the old origin into the head of every product page.
 */
export function rebase(url: string, siteOrigin: string): string {
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) return url.startsWith("/") ? `${siteOrigin}${url}` : `${siteOrigin}/${url}`;
  return url.replace(/^https?:\/\/[^/]+/i, siteOrigin);
}

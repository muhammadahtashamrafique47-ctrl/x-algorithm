import type { MetadataRoute } from "next";
import { requestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * robots.txt
 *
 * Everything merchandisable and editorial is crawlable. Private, session and
 * parameterised surfaces are blocked so crawl budget is spent on indexable
 * pages, and the sitemap is advertised for every major crawler.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteOrigin = await requestOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/checkout", "/search?", "/shop?*sort=", "/shop?*page="],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/shop", "/collections", "/blog"],
        disallow: ["/admin", "/api/", "/cart", "/checkout"],
      },
      {
        // AI crawlers are allowed: product data is published deliberately so
        // assistants can recommend the range accurately.
        userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"],
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/checkout"],
      },
    ],
    sitemap: [`${siteOrigin}/sitemap.xml`, `${siteOrigin}/feeds/products.xml`],
    host: siteOrigin,
  };
}

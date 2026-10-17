import type { MetadataRoute } from "next";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, getCollections, getArticles } from "@/lib/store/db";
import { SERVED_LOCALES } from "@/lib/i18n/markets";
import { rebase, requestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * XML sitemap.
 *
 * Includes every published product with its hreflang cluster, all collection
 * hubs, the editorial guides and the utility pages that carry supporting
 * content. `lastmod` comes from the optimization timestamp so re-optimized
 * listings are recrawled first.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await ensureCatalogue();
  const siteOrigin = await requestOrigin();
  const products = getAllProducts().filter((p) => p.status === "published");
  const collections = getCollections();
  const articles = getArticles();

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteOrigin}/shop/${product.slug}`,
    lastModified: new Date(product.updatedAt || product.createdAt),
    changeFrequency: "weekly",
    priority: Math.min(1, 0.7 + (product.seo?.score?.total ?? 60) / 400),
    alternates: {
      languages: Object.fromEntries(
        (product.seo?.hreflang ?? [{ locale: SERVED_LOCALES[0] ?? "en-US", href: `${siteOrigin}/shop/${product.slug}` }]).map((entry) => [
          entry.locale,
          rebase(entry.href, siteOrigin),
        ]),
      ),
    },
  }));

  const collectionEntries: MetadataRoute.Sitemap = collections.map((collection) => ({
    url: `${siteOrigin}/collections/${collection.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${siteOrigin}/blog/${article.slug}`,
    lastModified: new Date(article.updatedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${siteOrigin}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${siteOrigin}/shop`, lastModified: new Date(), changeFrequency: "daily", priority: 0.95 },
    { url: `${siteOrigin}/size-guide`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteOrigin}/fabric-care`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteOrigin}/shipping-returns`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteOrigin}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteOrigin}/contact`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    { url: `${siteOrigin}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  return [...staticEntries, ...collectionEntries, ...productEntries, ...articleEntries];
}

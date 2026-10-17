import type { MetadataRoute } from "next";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts, getCollections, getArticles } from "@/lib/store/db";
import { SERVED_LOCALES, SITE_URL } from "@/lib/i18n/markets";

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
  const products = getAllProducts().filter((p) => p.status === "published");
  const collections = getCollections();
  const articles = getArticles();

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/shop/${product.slug}`,
    lastModified: new Date(product.updatedAt || product.createdAt),
    changeFrequency: "weekly",
    priority: Math.min(1, 0.7 + (product.seo?.score?.total ?? 60) / 400),
    alternates: {
      languages: Object.fromEntries(
        (product.seo?.hreflang ?? [{ locale: SERVED_LOCALES[0] ?? "en-US", href: `${SITE_URL}/shop/${product.slug}` }]).map((entry) => [
          entry.locale,
          entry.href,
        ]),
      ),
    },
  }));

  const collectionEntries: MetadataRoute.Sitemap = collections.map((collection) => ({
    url: `${SITE_URL}/collections/${collection.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${SITE_URL}/blog/${article.slug}`,
    lastModified: new Date(article.updatedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/shop`, lastModified: new Date(), changeFrequency: "daily", priority: 0.95 },
    { url: `${SITE_URL}/size-guide`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/fabric-care`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/shipping-returns`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  return [...staticEntries, ...collectionEntries, ...productEntries, ...articleEntries];
}

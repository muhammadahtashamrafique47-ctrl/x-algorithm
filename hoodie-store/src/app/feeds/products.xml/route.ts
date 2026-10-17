import { NextResponse } from "next/server";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getAllProducts } from "@/lib/store/db";
import { SITE_URL, BRAND_NAME } from "@/lib/i18n/markets";
import { inventoryHealth } from "@/lib/seo/internal";
import { priceBandFor } from "@/lib/seo/external";

export const dynamic = "force-dynamic";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * Google Merchant Center compatible product feed (RSS 2.0 + g: namespace).
 *
 * Titles and descriptions come from the AI-optimized SEO profile, so the feed
 * stays consistent with what the site and the SERP show. `custom_label_0-2`
 * carry the SEO score, the primary keyword target and the price band — useful
 * for structuring Shopping campaigns around listing quality.
 */
export async function GET() {
  await ensureCatalogue();
  const products = getAllProducts().filter((p) => p.status === "published");

  const items = products
    .map((product) => {
      const stock = inventoryHealth(product);
      const band = priceBandFor(product);
      const availability = stock.outOfStock ? "out of stock" : stock.lowStock ? "preorder" : "in stock";
      const images = product.images.map((image) => `${SITE_URL}${image.src}`);
      const primaryKeyword = product.seo?.keywords?.[0]?.term ?? "hoodie";

      return `    <item>
      <g:id>${escapeXml(product.sku)}</g:id>
      <g:item_group_id>${escapeXml(product.id)}</g:item_group_id>
      <title>${escapeXml(product.seo?.seoTitle || product.title)}</title>
      <g:description>${escapeXml(product.seo?.metaDescription || product.description)}</g:description>
      <link>${SITE_URL}/shop/${escapeXml(product.slug)}</link>
      <g:image_link>${escapeXml(images[0] ?? `${SITE_URL}/images/site/placeholder.jpg`)}</g:image_link>
${images.slice(1).map((image) => `      <g:additional_image_link>${escapeXml(image)}</g:additional_image_link>`).join("\n")}
      <g:availability>${availability}</g:availability>
      <g:price>${product.price.toFixed(2)} ${product.currency}</g:price>
${product.compareAtPrice ? `      <g:sale_price>${product.price.toFixed(2)} ${product.currency}</g:sale_price>\n      <g:sale_price_effective_date>${new Date().toISOString().slice(0, 10)}T00:00:00Z/${new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z</g:sale_price_effective_date>` : ""}
      <g:brand>${escapeXml(product.brand || BRAND_NAME)}</g:brand>
      <g:mpn>${escapeXml(product.sku.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}</g:mpn>
      <g:identifier_exists>TRUE</g:identifier_exists>
      <g:condition>new</g:condition>
      <g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Activewear &gt; Sweatshirts</g:google_product_category>
      <g:product_type>${escapeXml(`Hoodies > ${product.category.replace("-", " ")} > ${product.gender}`)}</g:product_type>
      <g:color>${escapeXml(product.colors.map((c) => c.name).join("/"))}</g:color>
      <g:size>${escapeXml(product.sizes.join("/"))}</g:size>
      <g:material>${escapeXml(product.material)}</g:material>
      <g:pattern>${escapeXml(product.fit ?? "solid")}</g:pattern>
      <g:age_group>${product.ageGroup === "kids" ? "kids" : "adult"}</g:age_group>
      <g:gender>${product.gender === "kids" ? "unisex" : product.gender}</g:gender>
      <g:shipping_weight>${((product.weightGsm ?? 380) / 1000 + 0.2).toFixed(2)} kg</g:shipping_weight>
      <g:shipping>
        <g:country>US</g:country>
        <g:service>Standard</g:service>
        <g:price>${product.price >= 75 ? "0.00" : "6.95"} USD</g:price>
      </g:shipping>
      <g:custom_label_0>seo_score:${product.seo?.score?.total ?? 0}</g:custom_label_0>
      <g:custom_label_1>kw:${escapeXml(primaryKeyword)}</g:custom_label_1>
      <g:custom_label_2>${escapeXml(band.band)}</g:custom_label_2>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(BRAND_NAME)} product feed</title>
    <link>${SITE_URL}</link>
    <description>AI-optimized hoodie catalogue with full product data for Merchant Center and Shopping campaigns.</description>
    <g:feed_label>US</g:feed_label>
    <g:content_language>en</g:content_language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

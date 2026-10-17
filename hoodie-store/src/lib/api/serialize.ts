import type { Product } from "@/lib/types";
import { issueSummary } from "@/lib/seo/scoring";
import { inventoryHealth } from "@/lib/seo/internal";

/** Compact product representations for API responses and admin tables. */

export function summarizeProduct(product: Product) {
  const primary = product.seo?.keywords?.find((k) => k.kind === "primary") ?? product.seo?.keywords?.[0];
  const stock = inventoryHealth(product);
  const metrics = product.metrics ?? { impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    title: product.title,
    brand: product.brand,
    category: product.category,
    collections: product.collections,
    gender: product.gender,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    currency: product.currency,
    weightGsm: product.weightGsm,
    material: product.material,
    image: product.images[0]?.src ?? "/images/site/placeholder.jpg",
    status: product.status,
    optimized: !!product.seo?.optimized,
    engine: product.seo?.engine ?? "local-nlp",
    version: product.seo?.version ?? 0,
    passes: product.seo?.passes ?? 0,
    score: product.seo?.score?.total ?? 0,
    grade: product.seo?.score?.grade ?? "F",
    previousScore: product.seo?.previousScore ?? 0,
    seoTitle: product.seo?.seoTitle ?? "",
    metaDescription: product.seo?.metaDescription ?? "",
    h1: product.seo?.h1 ?? "",
    primaryKeyword: primary?.term ?? "",
    keywordCount: product.seo?.keywords?.length ?? 0,
    wordCount: product.seo?.body?.wordCount ?? 0,
    markets: product.seo?.targetMarkets ?? [],
    locales: product.seo?.localizations?.length ?? 0,
    issues: issueSummary(product.seo?.issues ?? []),
    stock: { total: stock.total, inStock: stock.inStock, lowStock: stock.lowStock, coverage: stock.coverage },
    rating: product.rating,
    reviewCount: product.reviewCount,
    metrics: {
      impressions: metrics.impressions ?? 0,
      clicks: metrics.clicks ?? 0,
      ctr: metrics.impressions ? Math.round(((metrics.clicks ?? 0) / metrics.impressions) * 10000) / 100 : 0,
      purchases: metrics.purchases ?? 0,
      revenue: metrics.revenue ?? 0,
    },
    updatedAt: product.updatedAt,
    createdAt: product.createdAt,
  };
}

export type ProductSummary = ReturnType<typeof summarizeProduct>;

export function fullProduct(product: Product) {
  return {
    ...product,
    seo: product.seo
      ? {
          ...product.seo,
          keywords: product.seo.keywords.slice(0, 120),
          keywordTotal: product.seo.keywords.length,
        }
      : product.seo,
  };
}

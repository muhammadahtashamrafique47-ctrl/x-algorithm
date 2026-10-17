import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/Gallery";
import { BuyBox } from "@/components/BuyBox";
import { Tabs } from "@/components/Tabs";
import { ProductCard } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import {
  CareBlock, DescriptionBlock, FaqBlock, GlobalPricingBlock, ReviewsBlock, SizeBlock, SpecsBlock,
} from "@/components/ProductBlocks";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { findProduct, productCollections, relatedProducts } from "@/lib/commerce/catalog";
import { itemListSchema, productPageSchemas } from "@/lib/seo/schema";
import { SERVED_LOCALES, SITE_URL } from "@/lib/i18n/markets";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await ensureCatalogue();
  const product = findProduct(slug);
  if (!product) return { title: "Product not found", robots: { index: false, follow: false } };

  const seo = product.seo;
  const image = product.images[0]?.src ?? "/images/site/hero.jpg";
  const languages: Record<string, string> = {};
  for (const entry of seo?.hreflang ?? []) {
    languages[entry.locale] = entry.href;
  }
  if (!languages["x-default"]) languages["x-default"] = `${SITE_URL}/shop/${product.slug}`;

  return {
    title: seo?.seoTitle || product.title,
    description: seo?.metaDescription || product.description,
    keywords: (seo?.keywords ?? []).slice(0, 18).map((k) => k.term),
    alternates: {
      canonical: seo?.canonicalPath || `/shop/${product.slug}`,
      languages,
    },
    openGraph: {
      type: "website",
      url: `/shop/${product.slug}`,
      title: seo?.seoTitle || product.title,
      description: seo?.metaDescription || product.description,
      siteName: product.brand,
      locale: (SERVED_LOCALES[0] ?? "en-US").replace("-", "_"),
      images: [{ url: image, width: 1200, height: 1500, alt: seo?.imageAlt?.[0]?.alt || product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo?.seoTitle || product.title,
      description: seo?.metaDescription || product.description,
      images: [image],
    },
    robots: {
      index: product.status === "published",
      follow: true,
      googleBot: { index: product.status === "published", follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    other: {
      "product:price:amount": product.price.toFixed(2),
      "product:price:currency": product.currency,
      "product:availability": product.status === "published" ? "in stock" : "preorder",
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await ensureCatalogue();
  const product = findProduct(slug);
  if (!product || product.status === "archived") notFound();

  const related = relatedProducts(product, 4);
  const collections = productCollections(product);
  const seo = product.seo;
  const internalLinks = (seo?.internalLinks ?? []).filter((link) => !link.href.startsWith(`/shop/${product.slug}`));

  return (
    <>
      <JsonLd
        data={[
          ...productPageSchemas(product),
          related.length
            ? itemListSchema(
                `Related ${product.category.replace("-", " ")} hoodies`,
                related.map((item) => ({ name: item.title, href: `/shop/${item.slug}` })),
              )
            : null,
        ]}
      />

      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          {(seo?.breadcrumb ?? []).map((crumb, index, all) => (
            <span key={crumb.href} style={{ display: "flex", gap: 8 }}>
              {index === all.length - 1 ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <>
                  <Link href={crumb.href}>{crumb.name}</Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="container section-tight">
        <div className="pdp">
          <Gallery images={product.images} alt={seo?.imageAlt ?? []} title={product.title} />
          <BuyBox product={product} primaryKeyword={seo?.keywords?.[0]?.term} />
        </div>
      </div>

      <div className="container section">
        <Tabs
          items={[
            { id: "description", label: "Description", content: <DescriptionBlock product={product} /> },
            { id: "specs", label: "Fabric & specs", content: <SpecsBlock product={product} /> },
            { id: "size", label: "Size & fit", content: <SizeBlock product={product} /> },
            { id: "care", label: "Care", content: <CareBlock product={product} /> },
            { id: "reviews", label: "Reviews", count: product.reviewCount, content: <ReviewsBlock product={product} /> },
            { id: "faq", label: "FAQ", count: seo?.body?.faq?.length, content: <FaqBlock product={product} /> },
            {
              id: "global",
              label: "Global pricing",
              count: seo?.localizations?.length,
              content: <GlobalPricingBlock product={product} />,
            },
          ]}
        />
      </div>

      {collections.length > 0 && (
        <div className="container section-tight">
          <div className="panel row-between">
            <div>
              <strong>Shop the collection</strong>
              <p className="muted small" style={{ margin: "4px 0 0" }}>
                Every style in these collections shares the same fabric standards and size charts.
              </p>
            </div>
            <div className="chip-row">
              {collections.map((collection) => (
                <Link key={collection.slug} href={`/collections/${collection.slug}`} className="chip">
                  {collection.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {internalLinks.length > 0 && (
        <div className="container section-tight">
          <h3>More from {product.brand}</h3>
          <div className="pill-list">
            {internalLinks.map((link) => (
              <Link key={link.href + link.label} href={link.href} className="pill accent">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="container section">
          <div className="row-between" style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0 }}>You may also want</h2>
            <Link href="/shop" className="btn btn-outline btn-sm">
              All hoodies
            </Link>
          </div>
          <div className="product-grid">
            {related.map((item, index) => (
              <ProductCard key={item.id} product={item} position={index + 1} keyword={item.seo?.keywords?.[0]?.term} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import { requestOrigin } from "@/lib/request-origin";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { findCollection, publishedProducts, priceStats } from "@/lib/commerce/catalog";
import { getCollections } from "@/lib/store/db";
import { breadcrumbSchema, collectionPageSchema, faqSchema, itemListSchema, withOrigin } from "@/lib/seo/schema";
import { BRAND_NAME } from "@/lib/i18n/markets";
import { titleCase, unique } from "@/lib/seo/text";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await ensureCatalogue();
  const siteOrigin = await requestOrigin();
  const collection = findCollection(slug);
  if (!collection) return { title: "Collection not found", robots: { index: false, follow: false } };

  return {
    title: collection.seoTitle,
    description: collection.metaDescription,
    keywords: collection.keywords,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      title: collection.seoTitle,
      description: collection.metaDescription,
      url: `/collections/${collection.slug}`,
      type: "website",
      siteName: BRAND_NAME,
    },
    twitter: { card: "summary_large_image", title: collection.seoTitle, description: collection.metaDescription },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const siteOrigin = await requestOrigin();
  const { slug } = await params;
  await ensureCatalogue();
  const collection = findCollection(slug);
  if (!collection) notFound();

  const all = publishedProducts();
  const products = all.filter((p) => p.collections.includes(collection.slug) || p.category === collection.slug);
  const stats = priceStats(products);
  const others = getCollections().filter((c) => c.slug !== collection.slug).slice(0, 8);
  const weights = unique(products.map((p) => p.weightGsm ?? 0).filter(Boolean)).sort((a, b) => a - b);
  const materials = unique(products.flatMap((p) => p.material.split(",").map((m) => m.trim()))).slice(0, 4);
  const keywords = collection.keywords;

  const faq = [
    {
      q: `How many ${collection.name.toLowerCase()} do you stock?`,
      a: `${products.length} style${products.length === 1 ? "" : "s"}, priced ${stats.min ? `$${stats.min}–$${stats.max}` : "see each product"}, in ${unique(products.flatMap((p) => p.sizes)).length} sizes with live stock levels on every product page.`,
    },
    {
      q: `What fabric weights are available in ${collection.name.toLowerCase()}?`,
      a: weights.length
        ? `This collection runs from ${weights[0]} GSM to ${weights[weights.length - 1]} GSM. Fabric weight is listed on every product page so you can compare warmth directly.`
        : `Fabric weight in GSM is published on each product page.`,
    },
    {
      q: `Do ${collection.name.toLowerCase()} ship internationally?`,
      a: `Yes. Tracked worldwide delivery, free over $75, with 30-day free returns and prioritised size exchanges.`,
    },
    {
      q: `How should I size a ${titleCase(collection.name.replace(/'s$/, ""))}?`,
      a: `Each product page lists flat chest, body and sleeve measurements per size plus a fit recommendation for that specific block. If you are between sizes, size up for layering and down for a closer fit.`,
    },
  ];

  return (
    <>
      <JsonLd
        data={withOrigin(siteOrigin, () => [
          collectionPageSchema(collection, products),
          breadcrumbSchema([
            { name: "Home", href: "/" },
            { name: "Hoodies", href: "/shop" },
            { name: collection.name, href: `/collections/${collection.slug}` },
          ]),
          itemListSchema(collection.name, products.map((p) => ({ name: p.title, href: `/shop/${p.slug}` })), collection.description),
          faqSchema(faq),
        ])}
      />

      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <Link href="/shop">Hoodies</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">{collection.name}</span>
        </nav>
      </div>

      <div className="container section-tight">
        <div className="row-between" style={{ alignItems: "flex-end" }}>
          <div style={{ maxWidth: "62ch" }}>
            <p className="eyebrow">Collection</p>
            <h1 style={{ marginBottom: 8 }}>{collection.name}</h1>
            <p className="muted">{collection.description}</p>
          </div>
          <div className="badge-grid" style={{ maxWidth: 260 }}>
            <div className="stat">
              <div className="label">Styles</div>
              <div className="value">{products.length}</div>
            </div>
            <div className="stat">
              <div className="label">From</div>
              <div className="value">${stats.min || 0}</div>
            </div>
          </div>
        </div>

        <div className="chip-row" style={{ marginTop: 18 }}>
          {others.map((other) => (
            <Link key={other.slug} href={`/collections/${other.slug}`} className="chip">
              {other.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="container section-tight">
        {products.length === 0 ? (
          <div className="panel">
            <h3>No styles in this collection yet</h3>
            <p className="muted">
              <Link href="/shop">Browse the full range</Link> — new styles are added and auto-optimized continuously.
            </p>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} position={index + 1} keyword={keywords[0]} />
            ))}
          </div>
        )}
      </div>

      <div className="container section">
        <div className="prose">
          <h2>About our {collection.name.toLowerCase()}</h2>
          <p>
            {collection.description} Every listing in this collection publishes the same four numbers — fabric weight in
            GSM, fiber content, flat measurements per size, and country of origin — so you can compare{" "}
            {products.length} styles without guessing from photographs.
          </p>
          {materials.length > 0 && (
            <>
              <h3>Materials in this collection</h3>
              <p>{materials.join("; ")}.</p>
            </>
          )}
          {weights.length > 0 && (
            <>
              <h3>Fabric weights</h3>
              <p>
                {weights.map((w) => `${w} GSM`).join(", ")}. As a rule: under 320 GSM is a travel or gym layer,
                330–380 GSM is the everyday default, 400 GSM and above is a genuine cold-weather outer layer.
              </p>
            </>
          )}
          <h3>What shoppers search for in this collection</h3>
          <p>
            {keywords.map((keyword, index) => (
              <span key={keyword}>
                <Link href={`/search?q=${encodeURIComponent(keyword)}`}>{keyword}</Link>
                {index < keywords.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="container section" style={{ paddingTop: 0 }}>
        <div className="card card-pad">
          <h2 style={{ marginTop: 0 }}>{collection.name} FAQ</h2>
          <div className="grid grid-2" style={{ gap: 0 }}>
            {faq.map((entry) => (
              <div className="faq-item" key={entry.q}>
                <h4>{entry.q}</h4>
                <p>{entry.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

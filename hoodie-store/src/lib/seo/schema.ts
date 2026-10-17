import type { Article, Collection, FaqEntry, Product } from "@/lib/types";
import { BRAND_NAME, SITE_URL, SUPPORT_EMAIL, DEFAULT_LOCALE } from "@/lib/i18n/markets";
import { inventoryHealth } from "@/lib/seo/internal";

/**
 * JSON-LD builders.
 *
 * Targets every rich result a hoodie PDP is eligible for:
 *  - Merchant listing (Product + Offer + shippingDetails + hasMerchantReturnPolicy)
 *  - Review snippet (AggregateRating + Review)
 *  - FAQ (FAQPage)
 *  - Breadcrumbs (BreadcrumbList)
 *  - Collections / search results (ItemList + CollectionPage)
 *  - Sitelinks search box (WebSite + SearchAction)
 *  - Editorial (Article)
 */

const absolute = (href: string) => (href.startsWith("http") ? href : `${SITE_URL}${href}`);

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: BRAND_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/brand/logo.png`,
    description: `${BRAND_NAME} designs heavyweight hoodies and fleece layers sold worldwide.`,
    email: SUPPORT_EMAIL,
    sameAs: [
      "https://www.instagram.com/",
      "https://www.tiktok.com/",
      "https://www.pinterest.com/",
      "https://www.youtube.com/",
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: SUPPORT_EMAIL,
        availableLanguage: ["English", "German", "French", "Spanish", "Japanese", "Arabic"],
      },
    ],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: BRAND_NAME,
    description: "Heavyweight hoodies and fleece layers, shipped worldwide.",
    inLanguage: DEFAULT_LOCALE,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbSchema(items: { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute(item.href),
    })),
  };
}

export function faqSchema(faqs: FaqEntry[]) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function productSchema(product: Product) {
  const stock = inventoryHealth(product);
  const availability = stock.outOfStock
    ? "https://schema.org/OutOfStock"
    : stock.lowStock
      ? "https://schema.org/LimitedAvailability"
      : "https://schema.org/InStock";

  const offers = {
    "@type": "Offer",
    url: absolute(`/shop/${product.slug}`),
    priceCurrency: product.currency,
    price: product.price.toFixed(2),
    priceValidUntil: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10),
    availability,
    itemCondition: "https://schema.org/NewCondition",
    eligibleQuantity: { "@type": "QuantitativeValue", value: Math.max(1, stock.total) },
    seller: { "@id": `${SITE_URL}/#organization` },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: product.price >= 75 ? "0.00" : "6.95",
        currency: product.currency,
      },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: product.seo?.targetMarkets?.length ? product.seo.targetMarkets : ["US", "GB", "DE", "CA", "AU"] },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
        transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 9, unitCode: "DAY" },
      },
    },
    hasMerchantReturnPolicy: {
      "@type": "MerchantReturnPolicy",
      applicableCountry: product.seo?.targetMarkets?.length ? product.seo.targetMarkets : ["US", "GB", "DE", "CA", "AU"],
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 30,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/FreeReturn",
    },
  };

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": absolute(`/shop/${product.slug}#product`),
    name: product.seo?.h1 || product.title,
    productID: product.id,
    sku: product.sku,
    mpn: product.sku.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
    brand: { "@type": "Brand", name: product.brand },
    category: `Apparel > ${product.category.replace("-", " ")}`,
    description: product.seo?.metaDescription || product.description,
    url: absolute(`/shop/${product.slug}`),
    image: product.images.length
      ? product.images.map((img) => absolute(img.src))
      : [absolute("/images/site/placeholder.jpg")],
    color: product.colors.map((c) => c.name),
    size: product.sizes,
    material: product.material,
    audience: { "@type": "PeopleAudience", suggestedGender: product.gender, suggestedMinAge: product.ageGroup === "kids" ? 6 : 16 },
    weight: product.weightGsm ? { "@type": "QuantitativeValue", value: product.weightGsm, unitText: "GSM" } : undefined,
    additionalProperty: [
      { "@type": "PropertyValue", name: "Fabric weight", value: `${product.weightGsm ?? 380} GSM` },
      { "@type": "PropertyValue", name: "Fit", value: product.fit ?? "relaxed" },
      { "@type": "PropertyValue", name: "Material", value: product.material },
      ...(product.countryOfOrigin ? [{ "@type": "PropertyValue", name: "Country of origin", value: product.countryOfOrigin }] : []),
    ],
    offers,
    isRelatedTo: (product.seo?.internalLinks ?? [])
      .filter((l) => l.href.startsWith("/shop/"))
      .map((l) => ({ "@type": "Product", name: l.label, url: absolute(l.href) })),
  };

  if (product.rating > 0 && product.reviewCount > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  const reviews = product.reviews ?? [];
  if (reviews.length) {
    schema.review = reviews.slice(0, 5).map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.author },
      datePublished: review.date,
      reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5 },
      name: review.title,
      reviewBody: review.body,
    }));
  }

  return schema;
}

export function itemListSchema(name: string, items: { name: string; href: string }[], description?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absolute(item.href),
    })),
  };
}

export function collectionPageSchema(collection: Collection, products: Product[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.seoTitle || collection.name,
    description: collection.metaDescription || collection.description,
    url: absolute(`/collections/${collection.slug}`),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: collection.keywords.slice(0, 6).map((k) => ({ "@type": "Thing", name: k })),
    mainEntity: itemListSchema(collection.name, products.map((p) => ({ name: p.title, href: `/shop/${p.slug}` }))),
  };
}

export function articleSchema(article: Article) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    url: absolute(`/blog/${article.slug}`),
    dateModified: article.updatedAt,
    datePublished: article.updatedAt,
    author: { "@type": "Person", name: article.author },
    publisher: { "@id": `${SITE_URL}/#organization` },
    keywords: article.targetKeywords.join(", "),
    articleSection: "Hoodie guides",
    wordCount: article.body.reduce((s, b) => s + b.paragraphs.join(" ").split(/\s+/).length, 0),
    about: article.targetKeywords.slice(0, 5).map((k) => ({ "@type": "Thing", name: k })),
  };
}

/** Every JSON-LD block a product page emits, in render order. */
export function productPageSchemas(product: Product) {
  const blocks: Record<string, unknown>[] = [
    productSchema(product),
    breadcrumbSchema(product.seo?.breadcrumb ?? [{ name: "Home", href: "/" }, { name: product.title, href: `/shop/${product.slug}` }]),
  ];
  const faq = faqSchema(product.seo?.body?.faq ?? []);
  if (faq) blocks.push(faq);
  return blocks;
}

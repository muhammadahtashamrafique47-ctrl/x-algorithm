import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import { bestsellers, highestScored, publishedProducts } from "@/lib/commerce/catalog";
import { getCollections, getArticles } from "@/lib/store/db";
import { breadcrumbSchema, faqSchema, itemListSchema, websiteSchema } from "@/lib/seo/schema";
import { BRAND_NAME, MARKETS } from "@/lib/i18n/markets";
import { priceBandFor, upcomingEvents, marketOpportunities } from "@/lib/seo/external";
import { unique } from "@/lib/seo/text";

export const metadata: Metadata = {
  title: `Heavyweight Hoodies & Fleece Layers — ${BRAND_NAME}`,
  description: `Shop ${BRAND_NAME} hoodies in 280–500 GSM cotton, merino-blend and tech fleece. Oversized, cropped, zip-up and sherpa-lined fits with a true-to-size guide, free worldwide shipping over $75 and 30-day free returns.`,
  alternates: { canonical: "/" },
  openGraph: {
    title: `Heavyweight Hoodies & Fleece Layers — ${BRAND_NAME}`,
    description: "280–500 GSM hoodies built for real weather. Free worldwide shipping over $75.",
    url: "/",
    type: "website",
  },
};

const SITE_FAQ = [
  {
    q: "What GSM hoodie should I buy?",
    a: "GSM is the fabric weight in grams per square metre. 280–320 GSM is lightweight and best for travel, gym and mild climates. 350–400 GSM is the everyday mid-weight that works as an outer layer in autumn and a mid-layer in winter. 450 GSM and above is heavyweight, for real cold, especially when lined with sherpa.",
  },
  {
    q: "Do you ship internationally?",
    a: `Yes — we ship to ${MARKETS.length}+ markets with tracked delivery, typically 2–4 business days domestically and 5–9 internationally. Orders over $75 ship free, and duties are calculated at checkout so there are no surprises on delivery.`,
  },
  {
    q: "What is your returns policy?",
    a: "Returns are free for 30 days on unworn items with tags attached. Size exchanges are prioritised and ship as soon as the return is scanned, so you are not left without a hoodie during the swap. Every order includes a prepaid return label.",
  },
  {
    q: "How do your hoodies fit?",
    a: "Each style lists flat chest, body and sleeve measurements for every size. Regular and relaxed blocks are true to size; oversized and boxy blocks are cut with 12–16 cm of ease, so size down if you want a closer fit. Cropped styles land at the natural waist.",
  },
  {
    q: "Will my hoodie shrink in the wash?",
    a: "All cotton styles are pre-shrunk and garment-dyed, so shrinkage stays under 3% when you wash cold inside out and avoid high heat. Merino blends should be washed on a wool cycle and dried flat.",
  },
  {
    q: "Do you offer wholesale or blank hoodies?",
    a: "Yes. The Studio Blank Hoodie is a 320 GSM pre-shrunk pullover with a tear-away label, built for screen printing, embroidery and bulk orders, with volume pricing from 10 units.",
  },
];

export default function HomePage() {
  const products = publishedProducts();
  const best = bestsellers(4);
  const topRated = highestScored(4);
  const collections = getCollections();
  const articles = getArticles().slice(0, 3);
  const markets = unique(products.flatMap((p) => p.seo?.targetMarkets ?? [])).length || MARKETS.length;
  const keywordsTargeted = unique(products.flatMap((p) => (p.seo?.keywords ?? []).map((k) => k.normalized))).length;
  const events = upcomingEvents(new Date().getMonth(), 2).slice(0, 5);
  const flagship = products[0];
  const opportunities = flagship ? marketOpportunities(flagship, new Date().getMonth()).slice(0, 4) : [];
  const reviews = products.flatMap((p) => (p.reviews ?? []).map((r) => ({ ...r, product: p }))).sort((a, b) => b.rating - a.rating).slice(0, 3);
  const averageRating = products.length ? products.reduce((s, p) => s + p.rating, 0) / products.length : 0;
  const totalReviews = products.reduce((s, p) => s + p.reviewCount, 0);

  return (
    <>
      <JsonLd
        data={[
          websiteSchema(),
          breadcrumbSchema([{ name: "Home", href: "/" }]),
          itemListSchema(
            "Bestselling hoodies",
            best.map((p) => ({ name: p.title, href: `/shop/${p.slug}` })),
            "The four hoodies our customers buy most, ranked by verified purchases over the last 30 days.",
          ),
          faqSchema(SITE_FAQ),
        ]}
      />

      <section className="container section-tight" style={{ paddingTop: 26 }}>
        <div className="hero">
          <div className="hero-copy">
            <p className="eyebrow" style={{ color: "#9fc7b6" }}>
              {products.length} styles · {MARKETS.length} markets · 280–500 GSM
            </p>
            <h1>Heavyweight hoodies, built for every climate.</h1>
            <p>
              We publish the numbers other brands hide — fabric weight in GSM, flat measurements for every size, fiber
              content and country of origin. Then we build the hoodie around them.
            </p>
            <div className="hero-tags">
              <span className="badge">450 GSM loopback cotton</span>
              <span className="badge">Sherpa-lined to −5°C</span>
              <span className="badge">Pre-shrunk &lt;3%</span>
              <span className="badge">30-day free returns</span>
            </div>
            <div className="row wrap">
              <Link href="/shop" className="btn btn-accent btn-lg">
                Shop all hoodies
              </Link>
              <Link href="/collections/heavyweight" className="btn btn-outline btn-lg" style={{ borderColor: "rgba(255,255,255,.3)", color: "#fff" }}>
                Heavyweight 400+ GSM
              </Link>
            </div>
          </div>
          <div className="hero-media">
            <Image
              src="/images/site/hero.jpg"
              alt={`${BRAND_NAME} heavyweight hoodie collection on a rail, black and ecru pullovers in 450 GSM brushed loopback cotton`}
              width={1200}
              height={1200}
              priority
              sizes="(max-width: 980px) 100vw, 46vw"
            />
          </div>
        </div>
      </section>

      <section className="container section-tight">
        <div className="trust-bar">
          <div>
            <strong>Free shipping over $75</strong>
            <span>Tracked delivery to {markets}+ markets</span>
          </div>
          <div>
            <strong>30-day free returns</strong>
            <span>Prepaid label in every parcel</span>
          </div>
          <div>
            <strong>Published GSM</strong>
            <span>Fabric weight on every product page</span>
          </div>
          <div>
            <strong>{averageRating.toFixed(1)} / 5 average</strong>
            <span>From {totalReviews.toLocaleString()} verified reviews</span>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="row-between" style={{ marginBottom: 22 }}>
          <div>
            <p className="eyebrow">Most bought this month</p>
            <h2 style={{ margin: 0 }}>Bestselling hoodies</h2>
          </div>
          <Link href="/shop" className="btn btn-outline btn-sm">
            View all {products.length} styles
          </Link>
        </div>
        <div className="product-grid">
          {best.map((product, index) => (
            <ProductCard key={product.id} product={product} position={index + 1} keyword="hoodies" />
          ))}
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <p className="eyebrow">Shop by silhouette</p>
        <h2>Find the right block</h2>
        <div className="collection-grid">
          {collections.map((collection) => {
            const count = products.filter((p) => p.collections.includes(collection.slug) || p.category === collection.slug).length;
            return (
              <Link key={collection.slug} href={`/collections/${collection.slug}`} className="collection-card">
                <h3>{collection.name}</h3>
                <p>{collection.description}</p>
                <span className="count">{count} style{count === 1 ? "" : "s"}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="grid grid-2" style={{ alignItems: "center", gap: 40 }}>
          <div className="prose">
            <p className="eyebrow">Fabric intelligence</p>
            <h2>What GSM means, and why it changes everything</h2>
            <p>
              Most hoodie listings describe fabric with adjectives. We describe it with grams per square metre, because
              weight predicts warmth, drape and durability better than any word a brand can choose. Under 300 GSM is a
              travel layer. 350–400 GSM is the everyday hoodie that works as an outer layer in autumn and a mid-layer in
              winter. Above 450 GSM you are in serious cold-weather territory.
            </p>
            <ul className="bullet-list">
              <li>Brushed-back loopback traps still air — the reason cotton fleece feels warmer than its weight suggests.</li>
              <li>A lined hood and storm cuffs add more perceived warmth than an extra 50 GSM of fabric.</li>
              <li>Pre-shrunk, garment-dyed fabric keeps shrinkage under 3% and colour consistent between batches.</li>
            </ul>
            <div className="row wrap" style={{ marginTop: 16 }}>
              <Link href="/blog/hoodie-gsm-guide" className="btn btn-primary btn-sm">
                Read the GSM guide
              </Link>
              <Link href="/collections/heavyweight" className="btn btn-outline btn-sm">
                Shop heavyweight
              </Link>
            </div>
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Weight ladder</h3>
            <div className="stack">
              {[
                { label: "Lightweight", range: "280–320 GSM", use: "Travel, gym, mild climate", href: "/collections/lightweight" },
                { label: "Mid-weight", range: "330–380 GSM", use: "Everyday, all-season layering", href: "/collections/unisex" },
                { label: "Heavyweight", range: "400–450 GSM", use: "Autumn/winter outer layer", href: "/collections/heavyweight" },
                { label: "Extreme", range: "500 GSM + sherpa", use: "Sub-zero mid-layer", href: "/collections/winter" },
              ].map((tier) => (
                <Link key={tier.label} href={tier.href} className="panel" style={{ display: "grid", gap: 2 }}>
                  <div className="row-between">
                    <strong>{tier.label}</strong>
                    <span className="badge badge-accent">{tier.range}</span>
                  </div>
                  <span className="muted small">{tier.use}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="row-between" style={{ marginBottom: 20 }}>
          <div>
            <p className="eyebrow">Highest-scoring listings</p>
            <h2 style={{ margin: 0 }}>Optimized for the way people actually search</h2>
          </div>
          <span className="badge badge-accent">{keywordsTargeted.toLocaleString()} keyword targets mapped</span>
        </div>
        <div className="product-grid">
          {topRated.map((product, index) => (
            <ProductCard key={product.id} product={product} position={index + 1} keyword={product.seo?.keywords?.[0]?.term} />
          ))}
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="grid grid-2" style={{ gap: 28 }}>
          <div className="card card-pad">
            <p className="eyebrow">Global demand right now</p>
            <h3 style={{ marginTop: 0 }}>Where hoodies are peaking this month</h3>
            <div className="stack">
              {opportunities.map((opportunity) => (
                <div key={opportunity.country} className="panel">
                  <div className="row-between">
                    <strong>
                      {opportunity.market.name} · {opportunity.seasonNow}
                    </strong>
                    <span className="badge badge-accent">index {opportunity.score}</span>
                  </div>
                  <p className="small muted" style={{ margin: "6px 0 0" }}>
                    {opportunity.reasons[0]}
                  </p>
                </div>
              ))}
            </div>
            {events.length > 0 && (
              <div className="callout" style={{ marginTop: 14 }}>
                <strong>Retail calendar</strong>
                <span className="pill-list">
                  {events.map((event) => (
                    <span key={`${event.name}-${event.month}`} className="pill accent">
                      {event.name} · {event.countries.join(", ")}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>

          <div className="card card-pad">
            <p className="eyebrow">Verified reviews</p>
            <h3 style={{ marginTop: 0 }}>What shoppers say after 20+ wears</h3>
            <div className="stack">
              {reviews.map((review) => (
                <blockquote key={`${review.product.slug}-${review.author}`} className="panel" style={{ margin: 0 }}>
                  <div className="row-between">
                    <strong style={{ fontSize: "0.9rem" }}>{review.title}</strong>
                    <span className="stars" aria-label={`${review.rating} out of 5`}>
                      {"★".repeat(review.rating)}
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 6px" }}>{review.body}</p>
                  <span className="muted small">
                    {review.author} · <Link href={`/shop/${review.product.slug}`}>{review.product.title}</Link>
                  </span>
                </blockquote>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="row-between" style={{ marginBottom: 20 }}>
          <div>
            <p className="eyebrow">Guides</p>
            <h2 style={{ margin: 0 }}>Buy with better information</h2>
          </div>
          <Link href="/blog" className="btn btn-outline btn-sm">
            All guides
          </Link>
        </div>
        <div className="grid grid-3">
          {articles.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`} className="card card-pad">
              <span className="badge badge-accent">{article.readingMinutes} min read</span>
              <h3 style={{ margin: "10px 0 6px" }}>{article.title}</h3>
              <p className="small muted">{article.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="prose">
          <h2>Hoodies for men, women and everyone in between</h2>
          <p>
            A hoodie is the simplest garment to buy badly. The photos look identical, the descriptions all say “soft” and
            “premium”, and the sizing is a guess. We build the range around measurable differences: fabric weight, fiber
            content, block shape and construction. That is why a{" "}
            <Link href="/collections/heavyweight">heavyweight hoodie</Link> at 450 GSM, an{" "}
            <Link href="/collections/oversized">oversized hoodie</Link> with a dropped shoulder, a{" "}
            <Link href="/collections/lightweight">lightweight zip-up</Link> in 280 GSM french terry and a{" "}
            <Link href="/collections/sustainable">GOTS-certified organic cotton hoodie</Link> are four different products
            here rather than four colourways of the same one.
          </p>
          <h3>Which hoodie fits your climate?</h3>
          <p>
            If you live somewhere with a real winter — {opportunities.slice(0, 3).map((o) => o.market.name).join(", ") || "New York, London, Berlin"} and
            similar — start with a 380–450 GSM pullover and add a{" "}
            <Link href="/shop/basecamp-sherpa-lined-hoodie">sherpa-lined 500 GSM hoodie</Link> for the weeks below
            freezing. In warmer or subtropical markets a 280–320 GSM layer is the one you will wear year round, and a{" "}
            <Link href="/collections/zip-up">zip-up</Link> gives you ventilation without changing. For training and
            commuting, the <Link href="/shop/grid-tech-fleece-hoodie">bonded tech fleece</Link> moves sweat and blocks
            wind better than cotton at the same weight.
          </p>
          <h3>Sizing you can trust</h3>
          <p>
            Every product page publishes flat chest, body and sleeve measurements for each size, plus a recommendation
            for the specific block: size down in an oversized or boxy cut if you want it closer, stay true in a regular
            cut, and check the{" "}
            <Link href="/size-guide">hoodie size guide</Link> before you order. If it still does not fit, exchanges are
            free and prioritised — see <Link href="/shipping-returns">shipping &amp; returns</Link>.
          </p>
          <h3>Blank, wholesale and custom</h3>
          <p>
            Printers, brands and teams use our{" "}
            <Link href="/shop/studio-blank-hoodie">320 GSM blank hoodie</Link> because it is pre-shrunk, has a tear-away
            label and holds ink without twisting after wash. Volume pricing starts at 10 units;{" "}
            <Link href="/contact">contact us</Link> for quotes above 100.
          </p>
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="card card-pad">
          <p className="eyebrow">Questions shoppers ask</p>
          <h2 style={{ marginTop: 0 }}>Hoodie buying FAQ</h2>
          <div className="grid grid-2" style={{ gap: 0 }}>
            {SITE_FAQ.map((faq) => (
              <div className="faq-item" key={faq.q}>
                <h4>{faq.q}</h4>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <div className="panel center" style={{ padding: "40px 24px" }}>
          <h2 style={{ marginBottom: 8 }}>Find your weight</h2>
          <p className="muted" style={{ maxWidth: "52ch", margin: "0 auto 20px" }}>
            Answer three questions — climate, layering and fit — and we will point you at the exact GSM and block. Or
            browse the full range and compare the numbers side by side.
          </p>
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <Link href="/shop" className="btn btn-primary btn-lg">
              Shop the range
            </Link>
            <Link href="/size-guide" className="btn btn-outline btn-lg">
              Open the fit guide
            </Link>
          </div>
          <p className="muted small" style={{ marginTop: 18 }}>
            Price bands in this range:{" "}
            {products.length
              ? `$${Math.min(...products.map((p) => p.price))}–$${Math.max(...products.map((p) => p.price))} · ${unique(products.map((p) => priceBandFor(p).band)).join(", ")}`
              : "—"}
          </p>
        </div>
      </section>
    </>
  );
}

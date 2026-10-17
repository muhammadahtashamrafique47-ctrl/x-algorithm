import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { publishedProducts } from "@/lib/commerce/catalog";
import { breadcrumbSchema, organizationSchema } from "@/lib/seo/schema";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/i18n/markets";

export const metadata: Metadata = {
  title: `About ${BRAND_NAME} — How We Build and Test Hoodies`,
  description: `${BRAND_NAME} designs heavyweight hoodies with published fabric weights, flat measurements and country of origin on every page. This is how we develop, test and source the range — and the AI SEO system that writes every product listing.`,
  keywords: ["hoodie brand", "heavyweight hoodie brand", "ethical hoodie manufacturer", "hoodie fabric testing"],
  alternates: { canonical: "/about" },
  openGraph: { title: `About ${BRAND_NAME}`, description: "How we build and test hoodies.", url: "/about", type: "website" },
};

export default async function AboutPage() {
  await ensureCatalogue();
  const products = publishedProducts();
  const averageRating = products.length ? products.reduce((s, p) => s + p.rating, 0) / products.length : 0;
  const reviews = products.reduce((s, p) => s + p.reviewCount, 0);

  return (
    <>
      <JsonLd data={[organizationSchema(), breadcrumbSchema([{ name: "Home", href: "/" }, { name: "About", href: "/about" }])]} />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">About</span>
        </nav>
      </div>

      <div className="container section-tight">
        <p className="eyebrow">Our standards</p>
        <h1 style={{ maxWidth: "22ch" }}>We publish the numbers, then build the hoodie around them</h1>
        <p className="muted" style={{ maxWidth: "72ch" }}>
          {BRAND_NAME} started because buying a hoodie online was an exercise in guesswork: identical photographs,
          adjectives instead of specifications, and size charts that listed S/M/L with no measurements behind them. We do
          the opposite. Every product page publishes fabric weight in GSM, fiber content, flat measurements for every
          size, construction details, country of origin and live stock per size.
        </p>
      </div>

      <div className="container section-tight">
        <div className="trust-bar">
          <div>
            <strong>{products.length} styles in the range</strong>
            <span>280 to 500 GSM, six fit blocks</span>
          </div>
          <div>
            <strong>{averageRating.toFixed(1)} / 5 average</strong>
            <span>{reviews.toLocaleString()} verified reviews</span>
          </div>
          <div>
            <strong>20+ wear-hour test</strong>
            <span>Every style before it launches</span>
          </div>
          <div>
            <strong>Audited mills</strong>
            <span>Portugal, Türkiye, Italy, South Korea</span>
          </div>
        </div>
      </div>

      <div className="container section">
        <div className="prose">
          <h2>How a style gets made</h2>
          <p>
            Each style begins with a specification, not a sketch: target GSM, target block, fiber blend, and the climate
            it has to work in. We sample with our mill, wear the samples for a minimum of 20 hours outdoors across a
            temperature range, then wash them five times and re-measure chest and body length to record shrinkage and
            shape retention. Only styles that hold their measurements and their colour go into production.
          </p>
          <h2>Sourcing and manufacturing</h2>
          <p>
            Cotton fleece is produced in Portugal and Türkiye, where mills run closed-loop water systems and hold OEKO-TEX
            Standard 100 certification. Our organic range uses GOTS-certified cotton with low-impact reactive dyes. Merino
            blends are knitted in Italy. Tech fleece is bonded in South Korea. Every partner is audited, and we publish
            the country of origin on each product page rather than hiding it in a footer.
          </p>
          <h2>Sustainability, stated plainly</h2>
          <p>
            Recycled polyester content reduces virgin polymer demand. Packaging is plastic-free and fully recyclable.
            Pre-shrunk fabric means fewer returns from shrinkage complaints, and a durable garment means fewer replacements.
            We do not claim carbon neutrality we cannot evidence; where a style uses certified organic cotton or recycled
            content, that is stated on the product page and in the structured data.
          </p>
          <h2>The system that writes our product pages</h2>
          <p>
            Every listing on this site is generated and continuously re-optimized by our own AI SEO engine. When a product
            is uploaded, the pipeline extracts its attributes, researches keywords across{" "}
            <Link href="/admin/keywords">20 global markets</Link>, generates candidate titles and meta descriptions and
            selects the best one by SERP-level scoring, writes a unique 300+ word body with fabric, fit, styling and care
            sections, produces FAQ entries, writes alt text for every image, suggests internal links to the right
            collection hubs, emits complete JSON-LD, and then scores the result against a 19-factor rubric modelled on
            Google&rsquo;s ranking systems. Any issue it finds is auto-fixed and re-scored until the listing converges.
          </p>
          <p>
            That is why our pages carry published GSM, honest fit advice and structured data most apparel stores skip —
            the same signals that help a shopper decide also help a search engine understand what the page is about.
          </p>
          <h2>Get in touch</h2>
          <p>
            Customer service replies within one business day at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or use the <Link href="/contact">contact form</Link>.
            Wholesale and blank-hoodie enquiries are handled by the same team — volume pricing starts at 10 units.
          </p>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { requestOrigin } from "@/lib/request-origin";
import { breadcrumbSchema, organizationSchema, withOrigin } from "@/lib/seo/schema";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/i18n/markets";

export const metadata: Metadata = {
  title: `Contact ${BRAND_NAME} — Customer Service, Wholesale & Press`,
  description: `Contact ${BRAND_NAME} customer service: order help, size advice, returns, wholesale and blank-hoodie quotes from 10 units, and press enquiries. Replies within one business day.`,
  keywords: ["hoodie brand contact", "wholesale hoodies contact", "blank hoodie quote", "hoodie customer service"],
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const siteOrigin = await requestOrigin();
  return (
    <>
      <JsonLd data={withOrigin(siteOrigin, () => [organizationSchema(), breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Contact", href: "/contact" }])])} />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Contact</span>
        </nav>
      </div>

      <div className="container section-tight">
        <p className="eyebrow">We reply within one business day</p>
        <h1 style={{ maxWidth: "22ch" }}>Contact {BRAND_NAME}</h1>
        <p className="muted" style={{ maxWidth: "66ch" }}>
          Order help, size advice, returns, wholesale quotes and press enquiries all go to the same team. Include your
          order number for anything delivery-related and we can usually resolve it in the first reply.
        </p>
      </div>

      <div className="container section-tight">
        <div className="grid grid-2">
          <form className="card card-pad" action="/api/contact" method="post">
            <div className="form-grid">
              <label className="field span-2">
                Your name
                <input type="text" name="name" required autoComplete="name" placeholder="Alex Morgan" />
              </label>
              <label className="field">
                Email
                <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
              </label>
              <label className="field">
                Order number (optional)
                <input type="text" name="order" placeholder="NL-000000" />
              </label>
              <label className="field span-2">
                Topic
                <select name="topic" defaultValue="order">
                  <option value="order">Order & delivery</option>
                  <option value="returns">Returns & exchanges</option>
                  <option value="sizing">Size & fit advice</option>
                  <option value="wholesale">Wholesale / blank hoodies</option>
                  <option value="press">Press & partnerships</option>
                  <option value="other">Something else</option>
                </select>
              </label>
              <label className="field span-2">
                Message
                <textarea name="message" required placeholder="Tell us what you need — the more detail, the faster we can help." />
              </label>
            </div>
            <button className="btn btn-primary" type="submit" style={{ marginTop: 16 }}>
              Send message
            </button>
            <p className="help" style={{ marginTop: 10 }}>
              Prefer email? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </form>

          <div className="stack">
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Before you write</h3>
              <ul className="bullet-list">
                <li>
                  <Link href="/shipping-returns">Shipping & returns</Link> — delivery times by zone, free-return window
                  and how exchanges work.
                </li>
                <li>
                  <Link href="/size-guide">Size guide</Link> — flat measurements for every size and the sizing rule for
                  each fit block.
                </li>
                <li>
                  <Link href="/fabric-care">Fabric & care</Link> — GSM explained, wash routines and how to unshrink a
                  hoodie.
                </li>
                <li>
                  <Link href="/blog">Guides</Link> — buying advice written by the product team.
                </li>
              </ul>
            </div>
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Wholesale & blanks</h3>
              <p className="muted">
                The Studio Blank Hoodie is a 320 GSM pre-shrunk pullover with a tear-away label, built for screen printing
                and embroidery. Volume pricing starts at 10 units; tell us the quantity, colourway and print method and we
                will quote within one business day.
              </p>
              <Link href="/shop/studio-blank-hoodie" className="btn btn-outline btn-sm">
                See the blank hoodie
              </Link>
            </div>
            <div className="card card-pad">
              <h3 style={{ marginTop: 0 }}>Response times</h3>
              <dl className="kv">
                <dt>Order help</dt>
                <dd>Same business day</dd>
                <dt>Returns</dt>
                <dd>Within 1 business day</dd>
                <dt>Wholesale quotes</dt>
                <dd>Within 1 business day</dd>
                <dt>Press</dt>
                <dd>Within 2 business days</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

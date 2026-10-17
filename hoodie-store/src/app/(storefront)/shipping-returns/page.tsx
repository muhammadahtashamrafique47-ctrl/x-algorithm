import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";
import { MARKETS, SUPPORT_EMAIL } from "@/lib/i18n/markets";

export const metadata: Metadata = {
  title: "Shipping & Returns — Worldwide Delivery, 30-Day Free Returns",
  description:
    "Tracked worldwide delivery from 2 business days, free shipping over $75, 30-day free returns with a prepaid label, prioritised size exchanges and duties calculated at checkout for every market we serve.",
  keywords: ["hoodie free shipping", "international hoodie delivery", "30 day returns hoodie", "hoodie exchange size"],
  alternates: { canonical: "/shipping-returns" },
  openGraph: {
    title: "Shipping & Returns",
    description: "Worldwide tracked delivery and 30-day free returns.",
    url: "/shipping-returns",
    type: "article",
  },
};

const ZONES = [
  { zone: "Domestic (US)", standard: "2–4 business days · $6.95 (free over $75)", express: "1–2 business days · $18.00" },
  { zone: "Canada & Mexico", standard: "3–6 business days · $12.00 (free over $120)", express: "2–3 business days · $28.00" },
  { zone: "United Kingdom & EU", standard: "4–7 business days · $14.00 (free over $120)", express: "2–4 business days · $32.00" },
  { zone: "Australia, NZ & Asia-Pacific", standard: "5–9 business days · $18.00 (free over $150)", express: "3–5 business days · $42.00" },
  { zone: "Middle East & South Asia", standard: "5–9 business days · $16.00 (free over $150)", express: "3–5 business days · $38.00" },
  { zone: "Rest of world", standard: "7–14 business days · $24.00", express: "4–7 business days · $55.00" },
];

const FAQ = [
  {
    q: "Do you ship internationally?",
    a: `Yes — we ship to ${MARKETS.length}+ markets with tracked delivery on every order. Delivery times by zone are listed above, and every parcel includes a tracking number the moment it is scanned.`,
  },
  {
    q: "Who pays customs and duties?",
    a: "Duties and import taxes are calculated and collected at checkout for the markets where we can, so your parcel is not held at the border and you never pay a surprise fee on delivery. Where duties cannot be prepaid, they are the recipient's responsibility and are clearly flagged before you pay.",
  },
  {
    q: "How do returns work?",
    a: "Returns are free for 30 days on unworn items with tags attached. Every order includes a prepaid return label. Refunds are issued to the original payment method within 3 business days of the return being scanned.",
  },
  {
    q: "Can I exchange for a different size?",
    a: "Yes, and exchanges are prioritised: your replacement ships as soon as the carrier scans your return, so you are not waiting for the parcel to reach our warehouse. If your size sells out in the meantime, we refund in full.",
  },
  {
    q: "What if my order arrives damaged or wrong?",
    a: `Email ${SUPPORT_EMAIL} with your order number and a photo within 14 days. We send a replacement immediately — you do not need to return the damaged item.`,
  },
  {
    q: "Do you ship to PO boxes and parcel lockers?",
    a: "Yes for standard shipping in most markets. Express services require a physical address with a signature-capable recipient.",
  },
];

export default function ShippingReturnsPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Shipping & returns", href: "/shipping-returns" }]),
          faqSchema(FAQ),
        ]}
      />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Shipping & returns</span>
        </nav>
      </div>

      <div className="container section-tight">
        <p className="eyebrow">Delivery & returns</p>
        <h1 style={{ maxWidth: "24ch" }}>Shipping & returns</h1>
        <p className="muted" style={{ maxWidth: "70ch" }}>
          Tracked delivery to every market we serve, free over $75, with 30-day free returns and prioritised size
          exchanges. Orders placed before 14:00 UTC on a business day leave the warehouse the same day.
        </p>
      </div>

      <div className="container section-tight">
        <h2>Delivery times and costs</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Standard</th>
                <th>Express</th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map((zone) => (
                <tr key={zone.zone}>
                  <td>
                    <strong>{zone.zone}</strong>
                  </td>
                  <td>{zone.standard}</td>
                  <td>{zone.express}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Shipping cost, destination and delivery window are also emitted as <span className="mono">OfferShippingDetails</span>{" "}
          structured data on every product page so they can appear directly in the merchant listing rich result.
        </p>
      </div>

      <div className="container section-tight">
        <div className="grid grid-3">
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Returns in 3 steps</h3>
            <ol>
              <li>Start a return from your order confirmation email — no account needed.</li>
              <li>Print the prepaid label, or use the QR code at a drop-off point.</li>
              <li>Drop the parcel. Refund issued within 3 business days of the scan.</li>
            </ol>
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Size exchanges</h3>
            <p className="muted">
              Exchanges ship as soon as your return is scanned by the carrier, not when it reaches us. If your size has
              sold out, we refund in full and let you know before you post anything.
            </p>
            <Link href="/size-guide" className="btn btn-outline btn-sm">
              Check the size guide first
            </Link>
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Markets we serve</h3>
            <div className="pill-list">
              {MARKETS.map((market) => (
                <span key={market.country} className="pill">
                  {market.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container section">
        <h2>Shipping & returns FAQ</h2>
        <div className="grid grid-2" style={{ gap: 0 }}>
          {FAQ.map((item) => (
            <div className="faq-item" key={item.q}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 18 }}>
          Questions not covered here? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use the{" "}
          <Link href="/contact">contact form</Link> — replies within one business day.
        </p>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { publishedProducts } from "@/lib/commerce/catalog";
import { breadcrumbSchema, faqSchema } from "@/lib/seo/schema";

export const metadata: Metadata = {
  title: "Hoodie Size Guide — Fit Types, Measurements and How to Choose",
  description:
    "Flat chest, body and sleeve measurements for every size from XS to 3XL and kids 4Y–14Y, plus fit-type definitions (regular, relaxed, oversized, boxy, cropped, athletic) and when to size up or down.",
  keywords: ["hoodie size guide", "hoodie measurements chart", "how should a hoodie fit", "oversized hoodie sizing", "hoodie size chart cm"],
  alternates: { canonical: "/size-guide" },
  openGraph: { title: "Hoodie Size Guide", description: "Measurements, fit types and sizing rules.", url: "/size-guide", type: "article" },
};

const ADULT = [
  { size: "XS", chest: "48 cm / 19\"", body: "64 cm / 25\"", sleeve: "58 cm / 23\"", shoulder: "42 cm / 16.5\"" },
  { size: "S", chest: "52 cm / 20.5\"", body: "67 cm / 26.5\"", sleeve: "60 cm / 23.5\"", shoulder: "44 cm / 17.5\"" },
  { size: "M", chest: "56 cm / 22\"", body: "70 cm / 27.5\"", sleeve: "62 cm / 24.5\"", shoulder: "46 cm / 18\"" },
  { size: "L", chest: "60 cm / 23.5\"", body: "73 cm / 28.5\"", sleeve: "64 cm / 25\"", shoulder: "48 cm / 19\"" },
  { size: "XL", chest: "64 cm / 25\"", body: "76 cm / 30\"", sleeve: "66 cm / 26\"", shoulder: "50 cm / 19.5\"" },
  { size: "2XL", chest: "69 cm / 27\"", body: "79 cm / 31\"", sleeve: "68 cm / 26.5\"", shoulder: "52 cm / 20.5\"" },
  { size: "3XL", chest: "74 cm / 29\"", body: "82 cm / 32\"", sleeve: "70 cm / 27.5\"", shoulder: "54 cm / 21.5\"" },
];

const KIDS = [
  { size: "4Y", height: "104 cm", chest: "36 cm / 14\"", body: "46 cm / 18\"" },
  { size: "6Y", height: "116 cm", chest: "38 cm / 15\"", body: "50 cm / 19.5\"" },
  { size: "8Y", height: "128 cm", chest: "41 cm / 16\"", body: "54 cm / 21\"" },
  { size: "10Y", height: "140 cm", chest: "44 cm / 17.5\"", body: "58 cm / 23\"" },
  { size: "12Y", height: "152 cm", chest: "47 cm / 18.5\"", body: "62 cm / 24.5\"" },
  { size: "14Y", height: "164 cm", chest: "50 cm / 19.5\"", body: "65 cm / 25.5\"" },
];

const FITS = [
  { name: "Regular", ease: "5–7 cm chest ease", rule: "True to size. Shoulder seam sits on your natural shoulder.", styles: "Meridian 450, Basecamp Sherpa" },
  { name: "Relaxed", ease: "8–10 cm chest ease", rule: "True to size; straight body that skims rather than clings.", styles: "Terra Organic Cotton" },
  { name: "Oversized", ease: "12–16 cm chest ease", rule: "Take your usual size for the intended look, size down one for closer.", styles: "Atlas Oversized" },
  { name: "Boxy", ease: "Wide chest, short body", rule: "Square silhouette. Size down if you are tall and want length.", styles: "Nightshift Graphic" },
  { name: "Cropped", ease: "Hem at natural waist", rule: "High-low hem. Tall shoppers may prefer sizing up.", styles: "Nocturne Cropped" },
  { name: "Athletic", ease: "Close, with stretch", rule: "Cut for movement; size up only for layering over a base layer.", styles: "Grid Tech Fleece" },
];

const FAQ = [
  { q: "How do I measure myself for a hoodie?", a: "Measure a hoodie you already own that fits well, laid flat: chest armpit to armpit, body length from the high point of the shoulder to the hem, sleeve from the shoulder seam to the cuff. Compare those numbers to the chart rather than comparing to your body measurements — it is far more accurate." },
  { q: "Should I size up in an oversized hoodie?", a: "No. Oversized blocks already carry 12–16 cm of ease, so sizing up usually makes the garment look accidental rather than intentional. Size down one if you want a closer fit." },
  { q: "Are your unisex hoodies sized for men or women?", a: "The unisex block uses the men's measurement chart as its reference. If you normally shop women's sizing, take one size down from your usual women's size." },
  { q: "What if the size I want is sold out?", a: "Stock levels are shown per size on every product page. If your size is unavailable, join the waitlist on that page — restocks are prioritised for waitlist sign-ups and you will get an email the moment it lands." },
  { q: "Do hoodies stretch with wear?", a: "Cotton fleece relaxes slightly (around 1–2 cm across the chest) in the first few wears and returns after washing. Merino blends relax more, and elastane-containing cuffs and hems recover fully." },
];

export default async function SizeGuidePage() {
  await ensureCatalogue();
  const products = publishedProducts();

  return (
    <>
      <JsonLd data={[breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Size guide", href: "/size-guide" }]), faqSchema(FAQ)]} />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Size guide</span>
        </nav>
      </div>

      <div className="container section-tight">
        <p className="eyebrow">Fit & sizing</p>
        <h1 style={{ maxWidth: "24ch" }}>Hoodie size guide: measurements, fit types and how to choose</h1>
        <p className="muted" style={{ maxWidth: "70ch" }}>
          Every measurement below is taken flat on the finished garment, in centimetres and inches. Use them alongside
          the fit-type table — a size Medium in an oversized block is not the same garment as a Medium in a regular block.
        </p>
      </div>

      <div className="container section-tight">
        <h2>Adult sizes (XS–3XL)</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Size</th>
                <th>Chest (flat)</th>
                <th>Body length</th>
                <th>Sleeve</th>
                <th>Shoulder</th>
              </tr>
            </thead>
            <tbody>
              {ADULT.map((row) => (
                <tr key={row.size}>
                  <td>
                    <strong>{row.size}</strong>
                  </td>
                  <td>{row.chest}</td>
                  <td>{row.body}</td>
                  <td>{row.sleeve}</td>
                  <td>{row.shoulder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="container section-tight">
        <h2>Kids sizes (4Y–14Y)</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Size</th>
                <th>Height</th>
                <th>Chest (flat)</th>
                <th>Body length</th>
              </tr>
            </thead>
            <tbody>
              {KIDS.map((row) => (
                <tr key={row.size}>
                  <td>
                    <strong>{row.size}</strong>
                  </td>
                  <td>{row.height}</td>
                  <td>{row.chest}</td>
                  <td>{row.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Kids&rsquo; hoodies are manufactured without drawcords to comply with child-safety standards (EN 14682 / ASTM F1816).
        </p>
      </div>

      <div className="container section-tight">
        <h2>Fit types explained</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fit</th>
                <th>Ease</th>
                <th>Sizing rule</th>
                <th>Styles in this fit</th>
              </tr>
            </thead>
            <tbody>
              {FITS.map((fit) => (
                <tr key={fit.name}>
                  <td>
                    <strong>{fit.name}</strong>
                  </td>
                  <td>{fit.ease}</td>
                  <td>{fit.rule}</td>
                  <td className="muted">{fit.styles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="container section-tight">
        <h2>How to measure a hoodie you already own</h2>
        <ol>
          <li>Lay the hoodie flat on a hard surface, front side up, and smooth out any folds without stretching it.</li>
          <li><strong>Chest:</strong> measure straight across from armpit seam to armpit seam, then double it for a body circumference.</li>
          <li><strong>Body length:</strong> measure from the high point of the shoulder (next to the collar) straight down to the hem.</li>
          <li><strong>Sleeve:</strong> measure from the shoulder seam along the outside of the arm to the cuff edge.</li>
          <li><strong>Shoulder:</strong> measure across the back from one shoulder seam to the other — this tells you whether a block is dropped.</li>
        </ol>
      </div>

      <div className="container section">
        <h2>Sizing FAQ</h2>
        <div className="grid grid-2" style={{ gap: 0 }}>
          {FAQ.map((item) => (
            <div className="faq-item" key={item.q}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="container section" style={{ paddingTop: 0 }}>
        <div className="panel row-between">
          <div>
            <strong>Ready to find your size?</strong>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {products.length} styles publish per-size stock levels, so you can see exactly what is available before you order.
            </p>
          </div>
          <Link href="/shop" className="btn btn-primary">
            Shop all hoodies
          </Link>
        </div>
      </div>
    </>
  );
}

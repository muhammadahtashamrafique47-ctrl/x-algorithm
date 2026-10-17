import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { requestOrigin } from "@/lib/request-origin";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { publishedProducts } from "@/lib/commerce/catalog";
import { breadcrumbSchema, faqSchema, withOrigin } from "@/lib/seo/schema";
import { unique } from "@/lib/seo/text";

export const metadata: Metadata = {
  title: "Fabric & Care — GSM Explained, Fiber Guide and Wash Routines",
  description:
    "What GSM means for hoodies, how cotton, merino and polyester fleece behave, the wash routine that keeps shrinkage under 3%, and how to rescue a hoodie that already shrank.",
  keywords: ["hoodie fabric guide", "what is gsm hoodie", "how to wash a hoodie", "cotton vs polyester hoodie", "hoodie shrinkage"],
  alternates: { canonical: "/fabric-care" },
  openGraph: { title: "Fabric & Care Guide", description: "GSM, fibers and wash routines.", url: "/fabric-care", type: "article" },
};

const GSM_BANDS = [
  { band: "Lightweight", gsm: "240–320", feel: "Soft, drapes close, dries fast", use: "Travel, gym cover-up, mild climates, layering under a jacket", example: "Coastal Lightweight Zip-Up (280 GSM)" },
  { band: "Mid-weight", gsm: "330–390", feel: "Structured but not stiff, the everyday default", use: "All-season pullover, outer layer in autumn, mid-layer in winter", example: "Terra Organic Cotton (360 GSM)" },
  { band: "Heavyweight", gsm: "400–460", feel: "Dense, holds its shape, substantial in the hand", use: "Winter outer layer, replaces a light jacket to about 5°C", example: "Meridian 450 (450 GSM)" },
  { band: "Extreme", gsm: "470+", feel: "Very dense, usually lined", use: "Sub-zero mid-layer, wind-exposed commuting", example: "Basecamp Sherpa-Lined (500 GSM)" },
];

const FIBERS = [
  { name: "Cotton (ring-spun, combed)", warmth: "High when brushed", behaviour: "Absorbs moisture, feels heavier when damp, softens with every wash", care: "Cold wash inside out, low tumble or line dry", best: "Everyday pullovers, heavyweight fleece" },
  { name: "Recycled polyester", warmth: "Medium-high, wind resistant", behaviour: "Dries fast, holds colour, can retain odour and static", care: "Cold wash, no fabric softener, hang dry", best: "Tech fleece, blanks, blended fleece" },
  { name: "Merino wool blend", warmth: "High for its weight", behaviour: "Regulates temperature, resists odour, needs gentle handling", care: "Wool cycle 30°C, dry flat, wash rarely", best: "Half-zips, hiking and travel layers" },
  { name: "Organic cotton (GOTS)", warmth: "Same as conventional cotton", behaviour: "Grown without synthetic pesticides, usually low-impact dyed", care: "Cold wash, line dry in shade to protect the dye", best: "Sustainable ranges, sensitive skin" },
  { name: "Elastane (in cuffs/hems)", warmth: "None", behaviour: "Provides recovery so ribbing does not flare", care: "Never high heat — heat destroys elastane", best: "Cuffs, hems, athletic blocks" },
];

const FAQ = [
  { q: "What does GSM mean on a hoodie?", a: "GSM is grams per square metre — the weight of one square metre of the finished fabric. It is the most reliable predictor of warmth, drape and durability, which is why we publish it on every product page instead of describing fabric with adjectives." },
  { q: "Is a higher GSM always warmer?", a: "Not always. A brushed-back cotton loopback at 400 GSM can feel warmer than a 450 GSM unbrushed fleece, because brushing traps more still air. Lining matters more again: a sherpa-lined body adds far more warmth than extra grams of face fabric." },
  { q: "Will my hoodie shrink?", a: "All our cotton styles are pre-shrunk and garment-dyed, so shrinkage stays under 3% when you wash cold and avoid high heat. Shrinkage happens because heat and agitation let stretched cotton fibers relax back to their natural length." },
  { q: "Can I tumble dry a hoodie?", a: "Cotton fleece: yes, on low heat, and remove it while slightly damp. Merino blends: no — dry flat. Tech fleece with elastane: no — hang dry, because heat destroys the stretch." },
  { q: "How do I unshrink a hoodie?", a: "Soak it for 20 minutes in lukewarm water with a tablespoon of hair conditioner to relax the fibers, then gently stretch it back to shape on a towel and dry flat. You can usually recover one full size, rarely two." },
  { q: "Should I use fabric softener?", a: "No. Softener coats brushed fleece and the wicking surface of tech fleece, reducing breathability and moisture transport. Wash with a mild detergent only." },
];

export default async function FabricCarePage() {
  await ensureCatalogue();
  const siteOrigin = await requestOrigin();
  const products = publishedProducts();
  const weights = unique(products.map((p) => p.weightGsm ?? 0).filter(Boolean)).sort((a, b) => a - b);

  return (
    <>
      <JsonLd data={withOrigin(siteOrigin, () => [breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Fabric & care", href: "/fabric-care" }]), faqSchema(FAQ)])} />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Fabric & care</span>
        </nav>
      </div>

      <div className="container section-tight">
        <p className="eyebrow">Materials</p>
        <h1 style={{ maxWidth: "26ch" }}>Fabric & care: GSM explained, fibers compared, wash routines that work</h1>
        <p className="muted" style={{ maxWidth: "72ch" }}>
          Our range currently spans {weights[0]}–{weights[weights.length - 1]} GSM. This page explains what those numbers
          mean in wear, how each fiber behaves, and exactly how to wash each one so the garment lasts years rather than a
          season.
        </p>
      </div>

      <div className="container section-tight">
        <h2>Fabric weight bands</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Band</th>
                <th>GSM</th>
                <th>How it feels</th>
                <th>Best for</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {GSM_BANDS.map((row) => (
                <tr key={row.band}>
                  <td>
                    <strong>{row.band}</strong>
                  </td>
                  <td className="mono">{row.gsm}</td>
                  <td>{row.feel}</td>
                  <td>{row.use}</td>
                  <td className="muted">{row.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="container section-tight">
        <h2>Fiber behaviour guide</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fiber</th>
                <th>Warmth</th>
                <th>Behaviour</th>
                <th>Care</th>
                <th>Used in</th>
              </tr>
            </thead>
            <tbody>
              {FIBERS.map((fiber) => (
                <tr key={fiber.name}>
                  <td>
                    <strong>{fiber.name}</strong>
                  </td>
                  <td>{fiber.warmth}</td>
                  <td>{fiber.behaviour}</td>
                  <td>{fiber.care}</td>
                  <td className="muted">{fiber.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="container section-tight">
        <div className="grid grid-2">
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>The universal wash routine</h3>
            <ul className="bullet-list">
              <li>Turn the hoodie inside out before it goes in the machine.</li>
              <li>Wash cold (30°C maximum) on a gentle cycle with like colours.</li>
              <li>Use a mild detergent. No bleach, no fabric softener.</li>
              <li>Tumble dry low, or line dry away from direct sun to protect dye.</li>
              <li>Remove while slightly damp and reshape the hem and cuffs.</li>
              <li>Iron on the reverse side only, never over a print.</li>
            </ul>
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Construction details we publish</h3>
            <ul className="bullet-list">
              <li>Double-needle stitching at stress points on every cotton style.</li>
              <li>Twill-taped shoulder seams so the neckline does not stretch out.</li>
              <li>Bar-tacked pocket corners — the first place a cheap hoodie fails.</li>
              <li>Lined hoods, not single-layer jersey, on all 400 GSM+ styles.</li>
              <li>Ribbed cuffs and hem with 5% elastane for recovery.</li>
              <li>Self-fabric drawcord channels with reinforced eyelets.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="container section">
        <h2>Fabric & care FAQ</h2>
        <div className="grid grid-2" style={{ gap: 0 }}>
          {FAQ.map((item) => (
            <div className="faq-item" key={item.q}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
        <div className="panel row-between" style={{ marginTop: 24 }}>
          <div>
            <strong>Read the full GSM guide</strong>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              How to compare two hoodies when one brand publishes weight and the other does not.
            </p>
          </div>
          <Link href="/blog/hoodie-gsm-guide" className="btn btn-outline">
            Open the guide
          </Link>
        </div>
      </div>
    </>
  );
}

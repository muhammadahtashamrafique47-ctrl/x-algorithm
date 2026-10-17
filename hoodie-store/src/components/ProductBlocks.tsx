import type { Product } from "@/lib/types";
import { inventoryHealth } from "@/lib/seo/internal";
import { priceBandFor } from "@/lib/seo/external";
import { formatPrice, MARKET_BY_COUNTRY } from "@/lib/i18n/markets";

/** Server-rendered content blocks for the product detail tabs. */

export function DescriptionBlock({ product }: { product: Product }) {
  const seo = product.seo;
  return (
    <div className="prose">
      <p style={{ fontSize: "1.02rem" }}>{seo?.body?.intro || product.description}</p>
      {seo?.body?.sections?.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
          {section.bullets?.length ? (
            <ul className="bullet-list">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {seo?.body?.cta ? (
        <p>
          <strong>{seo.body.cta}</strong>
        </p>
      ) : null}
    </div>
  );
}

export function SpecsBlock({ product }: { product: Product }) {
  const stock = inventoryHealth(product);
  const band = priceBandFor(product);
  return (
    <div>
      <dl className="kv">
        <dt>Fabric</dt>
        <dd>{product.material}</dd>
        <dt>Fabric weight</dt>
        <dd>{product.weightGsm ?? "—"} GSM</dd>
        <dt>Fit</dt>
        <dd>
          {product.fit} · {product.category.replace("-", " ")}
        </dd>
        <dt>Sizes</dt>
        <dd>{product.sizes.join(", ")}</dd>
        <dt>Colours</dt>
        <dd>
          <span className="row" style={{ gap: 8 }}>
            {product.colors.map((color) => (
              <span key={color.hex} className="row" style={{ gap: 5 }}>
                <span className="swatch" style={{ background: color.hex }} />
                {color.name}
              </span>
            ))}
          </span>
        </dd>
        <dt>Construction</dt>
        <dd>{product.features.join(" · ")}</dd>
        <dt>Made in</dt>
        <dd>{product.countryOfOrigin ?? "—"}</dd>
        <dt>SKU</dt>
        <dd className="mono">{product.sku}</dd>
        <dt>Availability</dt>
        <dd>
          {stock.inStock ? `${stock.total} units across ${stock.inStockSizes.length} sizes` : "Currently sold out"}
        </dd>
        <dt>Price band</dt>
        <dd>
          {band.band} (${band.range[0]}–${band.range[1]} for {product.category})
        </dd>
      </dl>
    </div>
  );
}

const SIZE_CHART: Record<string, { chest: string; body: string; sleeve: string }> = {
  XS: { chest: "48 cm / 19\"", body: "64 cm / 25\"", sleeve: "58 cm / 23\"" },
  S: { chest: "52 cm / 20.5\"", body: "67 cm / 26.5\"", sleeve: "60 cm / 23.5\"" },
  M: { chest: "56 cm / 22\"", body: "70 cm / 27.5\"", sleeve: "62 cm / 24.5\"" },
  L: { chest: "60 cm / 23.5\"", body: "73 cm / 28.5\"", sleeve: "64 cm / 25\"" },
  XL: { chest: "64 cm / 25\"", body: "76 cm / 30\"", sleeve: "66 cm / 26\"" },
  "2XL": { chest: "69 cm / 27\"", body: "79 cm / 31\"", sleeve: "68 cm / 26.5\"" },
  "3XL": { chest: "74 cm / 29\"", body: "82 cm / 32\"", sleeve: "70 cm / 27.5\"" },
  "4Y": { chest: "36 cm / 14\"", body: "46 cm / 18\"", sleeve: "41 cm / 16\"" },
  "6Y": { chest: "38 cm / 15\"", body: "50 cm / 19.5\"", sleeve: "45 cm / 17.5\"" },
  "8Y": { chest: "41 cm / 16\"", body: "54 cm / 21\"", sleeve: "49 cm / 19\"" },
  "10Y": { chest: "44 cm / 17.5\"", body: "58 cm / 23\"", sleeve: "53 cm / 21\"" },
  "12Y": { chest: "47 cm / 18.5\"", body: "62 cm / 24.5\"", sleeve: "57 cm / 22.5\"" },
  "14Y": { chest: "50 cm / 19.5\"", body: "65 cm / 25.5\"", sleeve: "60 cm / 23.5\"" },
};

export function SizeBlock({ product }: { product: Product }) {
  const oversized = product.collections.includes("oversized") || product.fit === "oversized" || product.fit === "boxy";
  return (
    <div>
      <p>
        Measurements are taken flat, in centimetres and inches. Chest is measured armpit to armpit, body length from the
        high point of the shoulder to the hem.
      </p>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Size</th>
              <th>Chest (flat)</th>
              <th>Body length</th>
              <th>Sleeve</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {product.sizes.map((size) => {
              const chart = SIZE_CHART[size];
              const qty = product.inventory?.[size] ?? 0;
              return (
                <tr key={size}>
                  <td>
                    <strong>{size}</strong>
                  </td>
                  <td>{chart?.chest ?? "—"}</td>
                  <td>{chart?.body ?? "—"}</td>
                  <td>{chart?.sleeve ?? "—"}</td>
                  <td>{qty > 12 ? "In stock" : qty > 0 ? `Only ${qty} left` : "Sold out"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="seo-note">
        <strong>Fit advice for this block</strong>
        {oversized
          ? " This is an oversized cut with 12–16 cm of ease and a dropped shoulder. Take your usual size for the intended look, or size down one for a closer fit."
          : ` This is a ${product.fit} cut and runs true to size. Size up only if you plan to layer a knit underneath.`}
        {product.gender === "unisex" ? " The block is unisex — use these measurements as the reference regardless of how you shop." : ""}
      </div>
    </div>
  );
}

export function CareBlock({ product }: { product: Product }) {
  return (
    <div className="prose">
      <p>{product.careInstructions}</p>
      <ul className="bullet-list">
        <li>Wash cold and inside out — heat and agitation are what shrink cotton fibers.</li>
        <li>Skip fabric softener: it coats brushed fleece and reduces breathability.</li>
        <li>Tumble dry low or line dry; remove while slightly damp to protect elastane in the cuffs.</li>
        <li>Never iron a print directly — turn the garment inside out and use a warm iron.</li>
        <li>Merino blends: wool cycle at 30°C, dry flat, and wash far less often than cotton.</li>
      </ul>
      <p className="muted small">
        Because this fabric is pre-shrunk and garment-dyed, expect less than 3% shrinkage when you follow the routine
        above. Read the full guide in <a href="/fabric-care">fabric &amp; care</a>.
      </p>
    </div>
  );
}

export function ReviewsBlock({ product }: { product: Product }) {
  const reviews = product.reviews ?? [];
  if (!reviews.length) {
    return (
      <p className="muted">
        No reviews yet. Verified reviews appear here after delivery — they are also emitted as Review structured data so
        star ratings show in search results.
      </p>
    );
  }
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));
  const total = reviews.length;

  return (
    <div>
      <div className="row wrap" style={{ gap: 28, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: "2.4rem", fontWeight: 700, letterSpacing: "-0.03em" }}>{product.rating.toFixed(1)}</div>
          <div className="stars" aria-hidden="true">
            {"★".repeat(Math.round(product.rating))}
          </div>
          <div className="muted small">{product.reviewCount} verified reviews</div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          {breakdown.map((row) => (
            <div key={row.star} className="row" style={{ gap: 10, marginBottom: 4 }}>
              <span className="small muted" style={{ width: 26 }}>
                {row.star}★
              </span>
              <span className="bar" style={{ flex: 1 }}>
                <span style={{ width: `${total ? (row.count / total) * 100 : 0}%` }} />
              </span>
              <span className="small muted" style={{ width: 24 }}>
                {row.count}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="stack">
        {reviews.map((review) => (
          <article key={`${review.author}-${review.date}`} className="panel">
            <div className="row-between">
              <strong>{review.title}</strong>
              <span className="stars" aria-label={`${review.rating} out of 5`}>
                {"★".repeat(review.rating)}
              </span>
            </div>
            <p style={{ margin: "8px 0 6px" }}>{review.body}</p>
            <span className="muted small">
              {review.author} · verified purchase · {new Date(review.date).toLocaleDateString("en-US", { year: "numeric", month: "long" })}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}

export function FaqBlock({ product }: { product: Product }) {
  const faqs = product.seo?.body?.faq ?? [];
  if (!faqs.length) return <p className="muted">No FAQ generated for this listing yet.</p>;
  return (
    <div>
      {faqs.map((faq) => (
        <div className="faq-item" key={faq.q}>
          <h4>{faq.q}</h4>
          <p>{faq.a}</p>
        </div>
      ))}
    </div>
  );
}

export function GlobalPricingBlock({ product }: { product: Product }) {
  const localizations = (product.seo?.localizations ?? []).slice(0, 8);
  if (!localizations.length) return null;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Market</th>
            <th>Locale</th>
            <th>Local price</th>
            <th>Localized title</th>
            <th>Market signal</th>
          </tr>
        </thead>
        <tbody>
          {localizations.map((entry) => (
            <tr key={`${entry.country}-${entry.locale}`}>
              <td>
                <strong>{MARKET_BY_COUNTRY[entry.country]?.name ?? entry.country}</strong>
              </td>
              <td className="mono">{entry.locale}</td>
              <td>{entry.localizedPrice || formatPrice(product.price, MARKET_BY_COUNTRY[entry.country])}</td>
              <td style={{ maxWidth: 320 }}>{entry.seoTitle}</td>
              <td className="small muted">{entry.marketNotes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

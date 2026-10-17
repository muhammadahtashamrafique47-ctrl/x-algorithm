import Link from "next/link";
import { getCollections, getArticles } from "@/lib/store/db";
import { BRAND_NAME, BRAND_TAGLINE, MARKETS, SUPPORT_EMAIL } from "@/lib/i18n/markets";

export function Footer() {
  const collections = getCollections().slice(0, 8);
  const articles = getArticles().slice(0, 4);

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="brand" style={{ color: "#fff", marginBottom: 10 }}>
              <span className="brand-mark">NL</span>
              {BRAND_NAME}
            </div>
            <p style={{ maxWidth: "38ch", color: "#9aa0a8" }}>{BRAND_TAGLINE}</p>
            <p className="small" style={{ color: "#868c95" }}>
              Every product page on this store is generated, scored and continuously re-optimized by our in-house AI SEO
              engine — keyword research, structured data, hreflang and internal linking included.
            </p>
            <form className="newsletter" action="/api/subscribe" method="post">
              <input type="email" name="email" placeholder="Email for restocks & guides" aria-label="Email address" required />
              <button className="btn btn-accent btn-sm" type="submit">
                Join
              </button>
            </form>
          </div>

          <div>
            <h4>Shop</h4>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              <li>
                <Link href="/shop">All hoodies</Link>
              </li>
              {collections.map((collection) => (
                <li key={collection.slug}>
                  <Link href={`/collections/${collection.slug}`}>{collection.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Guides</h4>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              {articles.map((article) => (
                <li key={article.slug}>
                  <Link href={`/blog/${article.slug}`}>{article.title}</Link>
                </li>
              ))}
              <li>
                <Link href="/size-guide">Hoodie size guide</Link>
              </li>
              <li>
                <Link href="/fabric-care">Fabric & care</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Help</h4>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              <li>
                <Link href="/shipping-returns">Shipping & returns</Link>
              </li>
              <li>
                <Link href="/about">About us</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
              <li>
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
              </li>
              <li>
                <Link href="/admin">Merchant admin</Link>
              </li>
            </ul>
            <h4 style={{ marginTop: 22 }}>Markets</h4>
            <div className="pill-list">
              {MARKETS.slice(0, 10).map((market) => (
                <span key={market.country} className="pill" style={{ background: "#212429", borderColor: "#2f343b", color: "#9aa0a8" }}>
                  {market.country}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
          </span>
          <span>
            Prices in USD. Duties calculated at checkout for international orders. Visa · Mastercard · Amex · PayPal · Apple Pay · Klarna
          </span>
        </div>
      </div>
    </footer>
  );
}

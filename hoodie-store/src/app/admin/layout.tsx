import Link from "next/link";
import type { ReactNode } from "react";
import { catalogueStats, ensureCatalogue } from "@/lib/store/bootstrap";
import { aiStatus } from "@/lib/seo/ai/provider";
import { BRAND_NAME } from "@/lib/i18n/markets";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Dashboard", hint: "Health, revenue, AI engine" },
  { href: "/admin/products", label: "Products", hint: "Upload, import, optimize" },
  { href: "/admin/keywords", label: "Keyword research", hint: "Global demand modelling" },
  { href: "/admin/seo", label: "SEO audit", hint: "Site-wide technical report" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await ensureCatalogue();
  const ai = aiStatus();
  const stats = catalogueStats();

  return (
    <div className="admin-shell">
      <nav className="admin-nav">
        <div className="brand">
          <span className="brand-mark">NL</span>
          <div>
            <strong>{BRAND_NAME}</strong>
            <div className="small" style={{ opacity: 0.7 }}>
              Merchant console
            </div>
          </div>
        </div>

        {NAV.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
            <span className="small" style={{ display: "block", opacity: 0.55 }}>
              {item.hint}
            </span>
          </Link>
        ))}

        <div className="stack" style={{ gap: 8, marginTop: 26, padding: "0 8px" }}>
          <div className="small" style={{ opacity: 0.6 }}>
            AI engine
          </div>
          <div className="pill" style={{ background: ai.enabled ? "#1f4d3f" : "#2b2f36", color: "#fff", borderColor: "transparent" }}>
            {ai.enabled ? `hybrid · ${ai.provider}` : "local-nlp (offline)"}
          </div>
          <p className="small" style={{ opacity: 0.6, margin: 0, lineHeight: 1.5 }}>
            {ai.note}
          </p>
          <div className="small" style={{ opacity: 0.6, marginTop: 10 }}>
            {stats.total} products · {stats.published} live · {stats.optimized} AI-optimized · avg score {stats.averageScore}
          </div>
          <Link href="/" className="small" style={{ marginTop: 14, opacity: 0.75 }}>
            ← View storefront
          </Link>
        </div>
      </nav>

      <main className="admin-main">{children}</main>
    </div>
  );
}

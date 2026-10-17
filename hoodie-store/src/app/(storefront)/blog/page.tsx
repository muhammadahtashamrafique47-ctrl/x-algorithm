import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getArticles } from "@/lib/store/db";
import { breadcrumbSchema, itemListSchema } from "@/lib/seo/schema";
import { BRAND_NAME } from "@/lib/i18n/markets";

export const metadata: Metadata = {
  title: "Hoodie Guides — Fabric Weight, Fit, Care and Winter Layering",
  description: `Practical hoodie buying guides from ${BRAND_NAME}: GSM explained, fit types compared, wash routines that prevent shrinkage, and cold-weather layering tested in real conditions.`,
  alternates: { canonical: "/blog" },
  openGraph: { title: "Hoodie Guides", description: "Fabric weight, fit, care and layering guides.", url: "/blog", type: "website" },
};

export default async function BlogIndex() {
  await ensureCatalogue();
  const articles = getArticles().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Guides", href: "/blog" }]),
          itemListSchema("Hoodie buying guides", articles.map((a) => ({ name: a.title, href: `/blog/${a.slug}` }))),
        ]}
      />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Guides</span>
        </nav>
      </div>

      <div className="container section-tight">
        <p className="eyebrow">Editorial hub</p>
        <h1 style={{ maxWidth: "22ch" }}>Hoodie guides that answer the question before the sale</h1>
        <p className="muted" style={{ maxWidth: "68ch" }}>
          These guides exist to capture the informational searches that happen before someone buys a hoodie — GSM, fit,
          shrinkage, layering — and to give our product pages the topical support they need to rank. Each guide links to
          the exact styles it discusses.
        </p>
      </div>

      <div className="container section-tight">
        <div className="grid grid-2">
          {articles.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`} className="card card-pad">
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <span className="badge badge-accent">{article.readingMinutes} min read</span>
                <span className="badge">Updated {new Date(article.updatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
              </div>
              <h2 style={{ fontSize: "1.25rem", margin: "0 0 8px" }}>{article.title}</h2>
              <p className="muted small">{article.description}</p>
              <div className="pill-list" style={{ marginTop: 12 }}>
                {article.targetKeywords.slice(0, 4).map((keyword) => (
                  <span key={keyword} className="pill">
                    {keyword}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

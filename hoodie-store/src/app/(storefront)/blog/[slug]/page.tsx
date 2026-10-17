import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { ProductCard } from "@/components/ProductCard";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { getArticles } from "@/lib/store/db";
import { findProduct } from "@/lib/commerce/catalog";
import type { Product } from "@/lib/types";
import { articleSchema, breadcrumbSchema } from "@/lib/seo/schema";
import { BRAND_NAME } from "@/lib/i18n/markets";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await ensureCatalogue();
  const article = getArticles().find((a) => a.slug === slug);
  if (!article) return { title: "Guide not found", robots: { index: false, follow: false } };
  return {
    title: article.title,
    description: article.description,
    keywords: article.targetKeywords,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${article.slug}`,
      title: article.title,
      description: article.description,
      publishedTime: article.updatedAt,
      modifiedTime: article.updatedAt,
      authors: [article.author],
      siteName: BRAND_NAME,
    },
    twitter: { card: "summary_large_image", title: article.title, description: article.description },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await ensureCatalogue();
  const article = getArticles().find((a) => a.slug === slug);
  if (!article) notFound();

  const related = article.productSlugs
    .map((slug) => findProduct(slug))
    .filter((product): product is Product => Boolean(product))
    .slice(0, 4);
  const others = getArticles().filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <>
      <JsonLd data={[articleSchema(article), breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Guides", href: "/blog" }, { name: article.title, href: `/blog/${article.slug}` }])]} />

      <article className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 18 }}>
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <Link href="/blog">Guides</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">{article.title}</span>
        </nav>

        <header style={{ maxWidth: "72ch" }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <span className="badge badge-accent">{article.readingMinutes} min read</span>
            <span className="badge">By {article.author}</span>
            <span className="badge">
              Updated{" "}
              {new Date(article.updatedAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
          <h1>{article.title}</h1>
          <p className="muted" style={{ fontSize: "1.05rem" }}>
            {article.description}
          </p>
        </header>

        <div className="divider" />

        <div className="prose">
          {article.body.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          ))}

          <h2>Target questions this guide answers</h2>
          <ul>
            {article.targetKeywords.map((keyword) => (
              <li key={keyword}>
                <Link href={`/search?q=${encodeURIComponent(keyword)}`}>{keyword}</Link>
              </li>
            ))}
          </ul>
        </div>
      </article>

      {related.length > 0 && (
        <div className="container section">
          <h2>Styles mentioned in this guide</h2>
          <div className="product-grid">
            {related.map((product, index) => (
              <ProductCard key={product.id} product={product} position={index + 1} keyword={article.targetKeywords[0]} />
            ))}
          </div>
        </div>
      )}

      <div className="container section" style={{ paddingTop: 0 }}>
        <h3>Keep reading</h3>
        <div className="grid grid-3">
          {others.map((other) => (
            <Link key={other.slug} href={`/blog/${other.slug}`} className="card card-pad">
              <strong style={{ fontSize: "0.95rem" }}>{other.title}</strong>
              <p className="muted small" style={{ margin: "6px 0 0" }}>
                {other.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

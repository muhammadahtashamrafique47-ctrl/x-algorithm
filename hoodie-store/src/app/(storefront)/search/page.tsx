import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { SearchAttribution } from "@/components/SearchAttribution";
import { JsonLd } from "@/components/JsonLd";
import { requestOrigin } from "@/lib/request-origin";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { searchEverything } from "@/lib/commerce/catalog";
import { logSearch } from "@/lib/store/db";
import { suggestKeywords } from "@/lib/seo/keywords";
import { getSearchLog } from "@/lib/store/db";
import { breadcrumbSchema, itemListSchema, withOrigin } from "@/lib/seo/schema";

type Search = { q?: string };

export const metadata: Metadata = {
  title: "Search hoodies",
  description: "Search the full hoodie catalogue by style, fabric weight, fit, colour or use case.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/search" },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { q } = await searchParams;
  await ensureCatalogue();
  const siteOrigin = await requestOrigin();
  const query = (q ?? "").trim();

  if (query.length >= 3) {
    // First-party demand capture: every on-site search feeds the keyword engine
    // and the content-gap report. /search is disallowed in robots.txt so crawlers
    // do not pollute the signal.
    logSearch(query);
  }

  const results = query ? searchEverything(query, 24) : { products: [], collections: [], articles: [] };
  const searchLog = getSearchLog();
  const popular = Object.entries(searchLog)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const suggestions = suggestKeywords(query || "hoodie", {
    limit: 10,
    onsiteSearches: searchLog,
    corpus: results.products.map((p) => p.title),
  });

  return (
    <>
      {query ? <SearchAttribution query={query} /> : null}
      <JsonLd
        data={
          results.products.length
            ? breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Search", href: "/search" }])
            : null
        }
      />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Search</span>
        </nav>
      </div>

      <div className="container section-tight">
        <h1>{query ? `Results for “${query}”` : "Search the catalogue"}</h1>
        <form action="/search" method="get" className="row" style={{ maxWidth: 560, marginBottom: 8 }}>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Try “400 gsm oversized hoodie” or “sherpa lined”"
            aria-label="Search"
          />
          <button className="btn btn-primary" type="submit">
            Search
          </button>
        </form>
        {query && (
          <p className="muted small">
            {results.products.length} product{results.products.length === 1 ? "" : "s"} · {results.collections.length}{" "}
            collection{results.collections.length === 1 ? "" : "s"} · {results.articles.length} guide
            {results.articles.length === 1 ? "" : "s"}
          </p>
        )}
        <JsonLd
          data={
            results.products.length
              ? itemListSchema(
                  `Search results for ${query}`,
                  results.products.map((p) => ({ name: p.title, href: `/shop/${p.slug}` })),
                )
              : null
          }
        />
      </div>

      {query && results.products.length === 0 && (
        <div className="container section-tight">
          <div className="panel">
            <h3>We could not find “{query}”</h3>
            <p className="muted">
              That demand has been logged for our merchandising team. Meanwhile, these searches are close to what you
              typed:
            </p>
            <div className="pill-list">
              {suggestions.map((suggestion) => (
                <Link key={suggestion.term} href={`/search?q=${encodeURIComponent(suggestion.term)}`} className="pill accent">
                  {suggestion.term}
                </Link>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 14 }}>
              Or browse <Link href="/shop">all hoodies</Link>.
            </p>
          </div>
        </div>
      )}

      {results.collections.length > 0 && (
        <div className="container section-tight">
          <h3>Collections</h3>
          <div className="chip-row">
            {results.collections.map((collection) => (
              <Link key={collection.slug} href={`/collections/${collection.slug}`} className="chip">
                {collection.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {results.products.length > 0 && (
        <div className="container section-tight">
          <div className="product-grid">
            {results.products.map((product, index) => (
              <ProductCard key={product.id} product={product} position={index + 1} keyword={query} />
            ))}
          </div>
        </div>
      )}

      {results.articles.length > 0 && (
        <div className="container section-tight">
          <h3>Guides that answer this</h3>
          <div className="grid grid-3">
            {results.articles.map((article) => (
              <Link key={article.slug} href={`/blog/${article.slug}`} className="card card-pad">
                <strong>{article.title}</strong>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="container section">
        <div className="grid grid-2">
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Popular searches this month</h3>
            <div className="pill-list">
              {popular.map(([term, count]) => (
                <Link key={term} href={`/search?q=${encodeURIComponent(term)}`} className="pill">
                  {term} <span className="muted">· {count}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="card card-pad">
            <h3 style={{ marginTop: 0 }}>Suggested queries</h3>
            <div className="pill-list">
              {suggestions.map((suggestion) => (
                <Link key={suggestion.term} href={`/search?q=${encodeURIComponent(suggestion.term)}`} className="pill accent">
                  {suggestion.term}
                </Link>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Suggestions blend our keyword model with real on-site search demand — the same list powers the merchant
              keyword tool in <Link href="/admin/keywords">/admin/keywords</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

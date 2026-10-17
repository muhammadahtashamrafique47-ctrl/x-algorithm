import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { SearchAttribution } from "@/components/SearchAttribution";
import { JsonLd } from "@/components/JsonLd";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { facetCounts, filterProducts, paginate, priceStats, publishedProducts, type SortKey } from "@/lib/commerce/catalog";
import { breadcrumbSchema, itemListSchema } from "@/lib/seo/schema";
import { getCollections } from "@/lib/store/db";
import { BRAND_NAME, SITE_URL } from "@/lib/i18n/markets";
import { suggestKeywords } from "@/lib/seo/keywords";
import { getSearchLog } from "@/lib/store/db";

type Search = {
  q?: string;
  collection?: string;
  sort?: string;
  page?: string;
  min?: string;
  max?: string;
  size?: string;
  color?: string;
  stock?: string;
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const params = await searchParams;
  await ensureCatalogue();
  const collection = params.collection ? getCollections().find((c) => c.slug === params.collection) : undefined;
  const products = publishedProducts();
  const stats = priceStats(products);

  const title = collection
    ? collection.seoTitle
    : params.q
      ? `Search: ${params.q} — Hoodies`
      : `Shop All Hoodies — ${products.length} Styles from ${stats.min} to ${stats.max}`;

  const description = collection
    ? collection.metaDescription
    : `Browse ${products.length} hoodies from ${BRAND_NAME}: ${stats.min}–${stats.max} USD, 280 to 500 GSM cotton, merino and tech fleece. Filter by fit, weight, colour, size and price. Free worldwide shipping over $75.`;

  return {
    title,
    description,
    keywords: collection?.keywords ?? ["hoodies", "shop hoodies", "buy hoodies online", "heavyweight hoodie", "oversized hoodie"],
    // Filtered and paginated views canonicalise to the clean catalogue URL.
    alternates: { canonical: collection ? `/collections/${collection.slug}` : "/shop" },
    openGraph: { title, description, url: "/shop", type: "website" },
    robots: { index: !params.q, follow: true },
  };
}

function withParams(current: Search, patch: Partial<Search>): string {
  const next = new URLSearchParams();
  const merged = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    next.set(key, String(value));
  }
  if (patch.page === undefined) next.delete("page");
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "seo", label: "Top rated pages" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "rating", label: "Customer rating" },
  { key: "newest", label: "Newest" },
];

export default async function ShopPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  await ensureCatalogue();

  const all = publishedProducts();
  const facets = facetCounts(all);
  const stats = priceStats(all);
  const activeCollection = params.collection ? getCollections().find((c) => c.slug === params.collection) : undefined;

  const filtered = filterProducts({
    q: params.q,
    collection: params.collection,
    sort: (params.sort as SortKey) ?? "featured",
    minPrice: params.min ? Number(params.min) : undefined,
    maxPrice: params.max ? Number(params.max) : undefined,
    sizes: params.size ? params.size.split(",") : undefined,
    colors: params.color ? params.color.split(",") : undefined,
    inStockOnly: params.stock === "in",
  });

  const perPage = 12;
  const page = Number(params.page ?? 1) || 1;
  const result = paginate(filtered, page, perPage);

  const suggestions = suggestKeywords(params.q ?? "hoodie", {
    limit: 8,
    onsiteSearches: getSearchLog(),
    corpus: all.flatMap((p) => [p.title, ...(p.seo?.keywords ?? []).slice(0, 4).map((k) => k.term)]),
  });

  const h1 = activeCollection
    ? activeCollection.name
    : params.q
      ? `Hoodies matching “${params.q}”`
      : "Shop all hoodies";

  return (
    <>
      {params.q ? <SearchAttribution query={params.q} /> : null}
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: "Home", href: "/" },
            ...(activeCollection ? [{ name: "Hoodies", href: "/shop" }, { name: activeCollection.name, href: `/collections/${activeCollection.slug}` }] : [{ name: "Hoodies", href: "/shop" }]),
          ]),
          itemListSchema(
            h1,
            filtered.map((product) => ({ name: product.title, href: `/shop/${product.slug}` })),
            activeCollection?.description ?? `All ${filtered.length} hoodie styles from ${BRAND_NAME}.`,
          ),
        ]}
      />

      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          {activeCollection ? (
            <>
              <Link href="/shop">Hoodies</Link> <span aria-hidden="true">/</span>
              <span aria-current="page">{activeCollection.name}</span>
            </>
          ) : (
            <span aria-current="page">Hoodies</span>
          )}
        </nav>
      </div>

      <div className="container section-tight">
        <div className="row-between">
          <div>
            <h1 style={{ marginBottom: 6 }}>{h1}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {result.total} style{result.total === 1 ? "" : "s"} · ${stats.min}–${stats.max} · 280–500 GSM · free
              worldwide shipping over $75
            </p>
          </div>
          <div className="row wrap">
            <span className="small muted">Sort</span>
            <SortLinks params={params} />
          </div>
        </div>
      </div>

      <div className="container section-tight">
        <div className="chip-row" style={{ marginBottom: 18 }}>
          <Link href="/shop" className="chip" aria-pressed={!params.collection}>
            All
          </Link>
          {facets.collections.slice(0, 10).map((facet) => (
            <Link
              key={facet.value}
              href={`/shop${withParams(params, { collection: facet.value })}`}
              className="chip"
              aria-pressed={params.collection === facet.value}
            >
              {facet.value.replace(/-/g, " ")} ({facet.count})
            </Link>
          ))}
        </div>

        <div className="catalog-layout">
          <aside aria-label="Filters">
            <div className="filter-group">
              <h4>Price</h4>
              {[
                { label: `Under $60`, min: "0", max: "60" },
                { label: `$60 – $90`, min: "60", max: "90" },
                { label: `$90 – $120`, min: "90", max: "120" },
                { label: `Over $120`, min: "120", max: "9999" },
              ].map((band) => {
                const active = params.min === band.min && params.max === band.max;
                return (
                  <Link
                    key={band.label}
                    className="filter-option"
                    data-active={active}
                    href={`/shop${withParams(params, active ? { min: undefined, max: undefined } : { min: band.min, max: band.max })}`}
                  >
                    <span>{band.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="filter-group">
              <h4>Size</h4>
              {facets.sizes.slice(0, 8).map((facet) => {
                const selected = (params.size ?? "").split(",").filter(Boolean);
                const active = selected.includes(facet.value);
                const next = active ? selected.filter((s) => s !== facet.value) : [...selected, facet.value];
                return (
                  <Link
                    key={facet.value}
                    className="filter-option"
                    data-active={active}
                    href={`/shop${withParams(params, { size: next.join(",") || undefined })}`}
                  >
                    <span>{facet.value}</span>
                    <span className="count">{facet.count}</span>
                  </Link>
                );
              })}
            </div>

            <div className="filter-group">
              <h4>Colour</h4>
              {facets.colors.slice(0, 8).map((facet) => {
                const selected = (params.color ?? "").split(",").filter(Boolean);
                const active = selected.includes(facet.value);
                const next = active ? selected.filter((c) => c !== facet.value) : [...selected, facet.value];
                return (
                  <Link
                    key={facet.value}
                    className="filter-option"
                    data-active={active}
                    href={`/shop${withParams(params, { color: next.join(",") || undefined })}`}
                  >
                    <span>{facet.value}</span>
                    <span className="count">{facet.count}</span>
                  </Link>
                );
              })}
            </div>

            <div className="filter-group">
              <h4>Availability</h4>
              <Link
                className="filter-option"
                data-active={params.stock === "in"}
                href={`/shop${withParams(params, { stock: params.stock === "in" ? undefined : "in" })}`}
              >
                <span>In stock only</span>
              </Link>
            </div>

            {(params.collection || params.size || params.color || params.min || params.max || params.stock || params.q) && (
              <Link href="/shop" className="btn btn-outline btn-sm btn-block">
                Clear all filters
              </Link>
            )}
          </aside>

          <div>
            {result.items.length === 0 ? (
              <div className="panel">
                <h3>No hoodies match those filters</h3>
                <p className="muted">
                  Try clearing a filter, or search one of these terms other shoppers used this month:
                </p>
                <div className="pill-list">
                  {suggestions.map((suggestion) => (
                    <Link key={suggestion.term} href={`/search?q=${encodeURIComponent(suggestion.term)}`} className="pill accent">
                      {suggestion.term}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="product-grid">
                  {result.items.map((product, index) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      position={(result.page - 1) * perPage + index + 1}
                      keyword={params.q || product.seo?.keywords?.[0]?.term}
                    />
                  ))}
                </div>

                {result.pages > 1 && (
                  <nav className="row wrap" style={{ justifyContent: "center", marginTop: 28, gap: 8 }} aria-label="Pagination">
                    {result.page > 1 && (
                      <Link className="btn btn-outline btn-sm" href={`/shop${withParams(params, { page: String(result.page - 1) })}`}>
                        ← Previous
                      </Link>
                    )}
                    {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => (
                      <Link
                        key={n}
                        className="chip"
                        aria-pressed={n === result.page}
                        href={`/shop${withParams(params, { page: String(n) })}`}
                      >
                        {n}
                      </Link>
                    ))}
                    {result.page < result.pages && (
                      <Link className="btn btn-outline btn-sm" href={`/shop${withParams(params, { page: String(result.page + 1) })}`}>
                        Next →
                      </Link>
                    )}
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container section">
        <div className="prose">
          <h2>How to choose a hoodie in this range</h2>
          <p>
            Every style here is published with its fabric weight in GSM, its fiber content, its block shape and its flat
            measurements, so you can compare a 280 GSM french terry zip-up against a 500 GSM sherpa-lined pullover on
            numbers rather than adjectives. Start with the climate you live in, then the fit you want, then the fabric.
          </p>
          <h3>By silhouette</h3>
          <p>
            <Link href="/collections/oversized">Oversized and boxy hoodies</Link> carry a dropped shoulder and 12–16 cm of
            ease. <Link href="/collections/men">Regular men&rsquo;s blocks</Link> sit on the natural shoulder with 5–7 cm of
            chest ease. <Link href="/collections/women">Women&rsquo;s cropped styles</Link> land at the natural waist with a
            high-low hem. <Link href="/collections/zip-up">Zip-ups</Link> run the gamut from lightweight travel layers to
            bonded tech fleece with four-way stretch.
          </p>
          <h3>By fabric weight</h3>
          <p>
            Under 320 GSM suits travel, training and warm markets. 330–380 GSM is the all-season default. 400–450 GSM is a
            genuine outer layer for autumn and winter, and 500 GSM with a sherpa lining handles sub-zero days as a
            mid-layer. See the <Link href="/blog/hoodie-gsm-guide">GSM guide</Link> for the full breakdown, or the{" "}
            <Link href="/size-guide">size guide</Link> for how each block measures.
          </p>
          <p className="muted small">
            Canonical URL for this catalogue: {SITE_URL}/shop · {all.length} indexable product pages · updated{" "}
            {new Date().toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
    </>
  );
}

/** Progressive-enhancement sort control: real links, no JS required. */
function SortLinks({ params }: { params: Search }) {
  return (
    <span className="row hide-sm" style={{ gap: 4 }}>
      {SORTS.slice(0, 4).map((sort) => (
        <Link
          key={sort.key}
          href={`/shop${withParams(params, { sort: sort.key === "featured" ? undefined : sort.key })}`}
          className="chip"
          aria-pressed={(params.sort ?? "featured") === sort.key}
          title={sort.label}
        >
          {sort.label.split(":")[0]}
        </Link>
      ))}
    </span>
  );
}

import Link from "next/link";
import { getCollections } from "@/lib/store/db";
import { BRAND_NAME } from "@/lib/i18n/markets";

export default function NotFound() {
  const collections = getCollections().slice(0, 6);
  return (
    <div className="container section">
      <p className="eyebrow">404 — page not found</p>
      <h1 style={{ maxWidth: "20ch" }}>That page has been discontinued or moved</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        The link may be old, or the style may have sold through its run. Every current {BRAND_NAME} hoodie is listed in the
        catalogue below — or search for the exact style you remember.
      </p>
      <div className="row wrap" style={{ marginTop: 18 }}>
        <Link href="/shop" className="btn btn-primary btn-lg">
          Shop all hoodies
        </Link>
        <Link href="/search" className="btn btn-outline btn-lg">
          Search the catalogue
        </Link>
      </div>
      <div className="divider" />
      <h2>Popular collections</h2>
      <div className="collection-grid">
        {collections.map((collection) => (
          <Link key={collection.slug} href={`/collections/${collection.slug}`} className="collection-card">
            <h3>{collection.name}</h3>
            <p>{collection.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

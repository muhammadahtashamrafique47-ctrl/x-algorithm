"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { track, useCart } from "@/components/CartProvider";

type Suggestion = { term: string; volume: number; difficulty: number; priority: number };
type SearchHit = { slug: string; title: string; price: number; image: string };

const NAV = [
  { href: "/shop", label: "All hoodies" },
  { href: "/collections/men", label: "Men" },
  { href: "/collections/women", label: "Women" },
  { href: "/collections/heavyweight", label: "Heavyweight" },
  { href: "/collections/oversized", label: "Oversized" },
  { href: "/blog", label: "Guides" },
];

export function Header({ brandName, locales }: { brandName: string; locales: { locale: string; name: string }[] }) {
  const pathname = usePathname();
  const { count, setOpen } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [locale, setLocale] = useState("en-US");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (value: string) => {
    const q = value.trim();
    if (!q) {
      setSuggestions([]);
      setHits([]);
      return;
    }
    try {
      const [suggestRes, searchRes] = await Promise.all([
        fetch(`/api/keywords/suggest?q=${encodeURIComponent(q)}&limit=6`),
        fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`),
      ]);
      const suggestJson = (await suggestRes.json()) as { suggestions?: Suggestion[] };
      const searchJson = (await searchRes.json()) as { products?: SearchHit[] };
      setSuggestions(suggestJson.suggestions ?? []);
      setHits(searchJson.products ?? []);
    } catch {
      /* keep the UI usable if the API is unavailable */
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(query), 180);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, runSearch]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
      if (event.key === "/" && !searchOpen && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const submit = (term?: string) => {
    const q = (term ?? query).trim();
    if (!q) return;
    track("search", { keyword: q.toLowerCase() });
    setSearchOpen(false);
    window.location.href = `/search?q=${encodeURIComponent(q)}`;
  };

  return (
    <>
      <div className="promo-bar">
        Free worldwide shipping over $75 · 30-day free returns · Tracked delivery to {locales.length}+ markets
      </div>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link href="/" className="brand" aria-label={`${brandName} home`}>
            <span className="brand-mark">NL</span>
            <span className="hide-sm">{brandName}</span>
          </Link>

          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} data-active={pathname?.startsWith(item.href)} className="hide-sm">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setSearchOpen(true)} aria-label="Search products">
              🔍 <span className="hide-sm">Search</span>
            </button>
            <select
              aria-label="Select market"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              style={{ width: "auto", padding: "7px 10px", fontSize: "0.8rem" }}
              className="hide-sm"
            >
              {locales.map((option) => (
                <option key={option.locale} value={option.locale}>
                  {option.name}
                </option>
              ))}
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)} aria-label={`Open bag, ${count} items`}>
              Bag <span className="cart-count">{count}</span>
            </button>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search">
            <div className="search-input-row">
              <span aria-hidden="true">🔍</span>
              <input
                ref={inputRef}
                type="search"
                value={query}
                placeholder="Search hoodies, fabrics, fits…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                aria-label="Search query"
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setSearchOpen(false)}>
                Esc
              </button>
            </div>

            {hits.length > 0 && (
              <div className="search-results">
                {hits.map((hit) => (
                  <Link
                    key={hit.slug}
                    href={`/shop/${hit.slug}`}
                    className="search-result"
                    onClick={() => {
                      track("click", { productSlug: hit.slug, keyword: query, source: "site-search" });
                      setSearchOpen(false);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={hit.image} alt="" width={44} height={54} />
                    <span style={{ flex: 1 }}>
                      <strong style={{ fontSize: "0.9rem" }}>{hit.title}</strong>
                    </span>
                    <span className="muted small">${hit.price.toFixed(2)}</span>
                  </Link>
                ))}
              </div>
            )}

            {suggestions.length > 0 && (
              <div className="suggest-list">
                <div className="label">Trending searches · keyword data</div>
                {suggestions.map((suggestion) => (
                  <div key={suggestion.term} className="suggest-item" onClick={() => submit(suggestion.term)} role="button" tabIndex={0}>
                    <span>{suggestion.term}</span>
                    <span className="muted mono">
                      {suggestion.volume >= 1000 ? `${Math.round(suggestion.volume / 1000)}K` : suggestion.volume} · KD {suggestion.difficulty}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {query && hits.length === 0 && suggestions.length === 0 && (
              <div style={{ padding: 22 }} className="muted small">
                No matches yet — keep typing, or press Enter to search the full catalogue.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

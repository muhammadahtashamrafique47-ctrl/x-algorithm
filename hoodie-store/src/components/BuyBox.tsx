"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { lastKeyword, queryKeywordFromUrl, rememberKeyword, track, useCart } from "@/components/CartProvider";
import { discountPct, stockState } from "@/lib/commerce/product-utils";
import { Rating } from "@/components/Rating";

export function BuyBox({ product, primaryKeyword }: { product: Product; primaryKeyword?: string }) {
  const { add } = useCart();
  const [size, setSize] = useState<string>(product.sizes[Math.min(2, product.sizes.length - 1)] ?? "");
  const [color, setColor] = useState(product.colors[0]?.name ?? "");
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const stock = stockState(product);
  const discount = discountPct(product);

  // Attribution chain: the query in the URL wins, then anything remembered
  // earlier in the session, then the listing's own primary target.
  const [attributed, setAttributed] = useState("");
  useEffect(() => {
    const fromUrl = queryKeywordFromUrl();
    const keyword = fromUrl || lastKeyword() || primaryKeyword || "";
    if (fromUrl) rememberKeyword(fromUrl);
    setAttributed(keyword);
    track("view", { productSlug: product.slug, keyword });
  }, [product.slug, primaryKeyword]);

  const delivery = useMemo(() => {
    const from = new Date(Date.now() + 2 * 86_400_000);
    const to = new Date(Date.now() + 5 * 86_400_000);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    return `${fmt(from)} – ${fmt(to)}`;
  }, []);

  const addToCart = () => {
    add({
      slug: product.slug,
      title: product.title,
      image: product.images[0]?.src ?? "/images/site/placeholder.jpg",
      price: product.price,
      size,
      color,
      qty,
    });
    if (attributed) rememberKeyword(attributed);
    track("add_to_cart", { productSlug: product.slug, value: product.price * qty, keyword: attributed || primaryKeyword });
    setAdded(true);
    setTimeout(() => setAdded(false), 2400);
  };

  return (
    <div className="buy-box">
      <div>
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          <span className="badge badge-accent">{product.weightGsm} GSM</span>
          <span className="badge">{product.fit} fit</span>
          {product.collections.slice(0, 2).map((collection) => (
            <Link key={collection} href={`/collections/${collection}`} className="badge">
              {collection.replace(/-/g, " ")}
            </Link>
          ))}
          {discount > 0 && <span className="badge badge-highlight">Save {discount}%</span>}
        </div>
        <h1 style={{ fontSize: "clamp(1.5rem, 1rem + 1.6vw, 2.2rem)", margin: "0 0 8px" }}>{product.seo?.h1 || product.title}</h1>
        <Rating rating={product.rating} count={product.reviewCount} />
      </div>

      <div className="buy-price">
        <span className="now">${product.price.toFixed(2)}</span>
        {product.compareAtPrice ? <span className="price-was">${product.compareAtPrice.toFixed(2)}</span> : null}
        <span className={`badge ${stock.tone === "in" ? "badge-good" : stock.tone === "low" ? "badge-warn" : "badge-bad"}`}>{stock.label}</span>
      </div>

      <div>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: "0.85rem" }}>Colour: {color}</strong>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {product.colors.map((option) => (
            <button
              key={option.hex}
              className="swatch swatch-lg"
              style={{ background: option.hex }}
              aria-pressed={option.name === color}
              aria-label={`Select colour ${option.name}`}
              title={option.name}
              onClick={() => setColor(option.name)}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: "0.85rem" }}>Size</strong>
          <Link href="/size-guide" className="small" style={{ color: "var(--accent)", fontWeight: 650 }}>
            Size guide & fit advice →
          </Link>
        </div>
        <div className="size-grid">
          {product.sizes.map((option) => {
            const available = (product.inventory?.[option] ?? 0) > 0;
            return (
              <button
                key={option}
                className="size-btn"
                aria-pressed={option === size}
                disabled={!available}
                onClick={() => setSize(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
        {!size && <p className="small" style={{ color: "var(--bad)", marginTop: 8 }}>Select a size to continue.</p>}
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <span className="qty">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
            −
          </button>
          <span>{qty}</span>
          <button onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="Increase quantity">
            +
          </button>
        </span>
        <button className="btn btn-primary btn-lg" style={{ flex: 1, minWidth: 200 }} onClick={addToCart} disabled={stock.tone === "out"}>
          {stock.tone === "out" ? "Join waitlist" : added ? "Added to bag ✓" : `Add to bag · $${(product.price * qty).toFixed(2)}`}
        </button>
      </div>

      <div className="assurance">
        <div>
          <span aria-hidden="true">🚚</span>
          <span>
            <strong>Free worldwide shipping</strong> over $75 — arrives {delivery} with tracking.
          </span>
        </div>
        <div>
          <span aria-hidden="true">↩️</span>
          <span>
            <strong>30-day free returns</strong> and prioritised size exchanges with a prepaid label.
          </span>
        </div>
        <div>
          <span aria-hidden="true">🧵</span>
          <span>
            <strong>{product.material}</strong>, made in {product.countryOfOrigin}. Pre-shrunk to under 3%.
          </span>
        </div>
        <div>
          <span aria-hidden="true">🔒</span>
          <span>
            <strong>Secure checkout</strong> — Visa, Mastercard, Amex, PayPal, Apple Pay and Klarna instalments.
          </span>
        </div>
      </div>

      {product.seo?.bullets?.length ? (
        <ul className="bullet-list">
          {product.seo.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

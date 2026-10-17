"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Product } from "@/lib/types";
import { Rating } from "@/components/Rating";
import { track } from "@/components/CartProvider";
import { discountPct, stockState } from "@/lib/commerce/product-utils";

/**
 * Storefront product card.
 *
 * Emits first-party `impression` and `click` events (IntersectionObserver +
 * click) so the SEO engine can measure CTR per listing and per keyword — the
 * signal that closes the optimization loop.
 */
export function ProductCard({ product, keyword, position }: { product: Product; keyword?: string; position?: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const fired = useRef(false);
  const image = product.images[0]?.src ?? "/images/site/placeholder.jpg";
  const alt = product.seo?.imageAlt?.[0]?.alt || product.images[0]?.alt || product.title;
  const discount = discountPct(product);
  const stock = stockState(product);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !fired.current) {
            fired.current = true;
            track("impression", { productSlug: product.slug, keyword, position });
            observer.disconnect();
          }
        }
      },
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [product.slug, keyword, position]);

  return (
    <Link
      ref={ref}
      href={`/shop/${product.slug}`}
      className="product-card"
      onClick={() => track("click", { productSlug: product.slug, keyword, source: "product-card" })}
    >
      <div className="product-media">
        <Image
          src={image}
          alt={alt}
          width={product.images[0]?.width ?? 1200}
          height={product.images[0]?.height ?? 1500}
          sizes="(max-width: 620px) 46vw, (max-width: 980px) 30vw, 23vw"
          loading="lazy"
        />
        <div className="media-badges">
          {discount > 0 && <span className="badge badge-highlight">−{discount}%</span>}
          {product.rating >= 4.8 && product.reviewCount >= 200 && <span className="badge badge-solid">Bestseller</span>}
          {stock.tone === "low" && <span className="badge badge-warn">Low stock</span>}
          {stock.tone === "out" && <span className="badge badge-bad">Sold out</span>}
        </div>
      </div>

      <div className="product-body">
        <div className="product-meta">
          {product.weightGsm} GSM · {product.category.replace("-", " ")}
        </div>
        <h3 className="product-title">{product.title}</h3>
        <Rating rating={product.rating} count={product.reviewCount} />
        <div className="swatches" aria-label={`Available colours: ${product.colors.map((c) => c.name).join(", ")}`}>
          {product.colors.slice(0, 5).map((color) => (
            <span key={color.hex} className="swatch" style={{ background: color.hex }} title={color.name} />
          ))}
        </div>
        <div className="product-price">
          <span className="price-now">${product.price.toFixed(2)}</span>
          {product.compareAtPrice ? <span className="price-was">${product.compareAtPrice.toFixed(2)}</span> : null}
        </div>
      </div>
    </Link>
  );
}

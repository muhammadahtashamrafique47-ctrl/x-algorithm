"use client";

import Link from "next/link";
import { useEffect } from "react";
import { track, useCart } from "@/components/CartProvider";

export function CartDrawer() {
  const { lines, open, setOpen, subtotal, count, remove, setQty, clear } = useCart();
  const freeShippingThreshold = 75;
  const remaining = Math.max(0, freeShippingThreshold - subtotal);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="drawer-backdrop" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className="drawer" data-open={open} aria-label="Shopping bag" aria-hidden={!open}>
        <div className="drawer-header">
          <strong>Your bag ({count})</strong>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close bag">
            Close ✕
          </button>
        </div>

        <div className="drawer-body">
          {lines.length === 0 ? (
            <div className="stack center" style={{ paddingTop: 40 }}>
              <p className="muted">Your bag is empty.</p>
              <Link href="/shop" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>
                Browse hoodies
              </Link>
            </div>
          ) : (
            <>
              {remaining > 0 ? (
                <div className="seo-note" style={{ marginBottom: 14 }}>
                  Add <strong>${remaining.toFixed(2)}</strong> more for free worldwide shipping.
                  <div className="progress" style={{ marginTop: 8 }}>
                    <span style={{ width: `${Math.min(100, (subtotal / freeShippingThreshold) * 100)}%` }} />
                  </div>
                </div>
              ) : (
                <div className="seo-note" style={{ marginBottom: 14 }}>
                  🎉 You have unlocked <strong>free worldwide shipping</strong>.
                </div>
              )}

              {lines.map((line) => (
                <div className="cart-line" key={line.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={line.image} alt={line.title} width={64} height={80} loading="lazy" />
                  <div>
                    <Link href={`/shop/${line.slug}`} onClick={() => setOpen(false)} style={{ fontWeight: 620, fontSize: "0.9rem" }}>
                      {line.title}
                    </Link>
                    <div className="muted small">
                      {line.color} · Size {line.size}
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="qty">
                        <button onClick={() => setQty(line.id, line.qty - 1)} aria-label={`Decrease quantity of ${line.title}`}>
                          −
                        </button>
                        <span>{line.qty}</span>
                        <button onClick={() => setQty(line.id, line.qty + 1)} aria-label={`Increase quantity of ${line.title}`}>
                          +
                        </button>
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(line.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>${(line.price * line.qty).toFixed(2)}</div>
                </div>
              ))}
            </>
          )}
        </div>

        {lines.length > 0 && (
          <div className="drawer-footer">
            <div className="row-between">
              <span className="muted small">Subtotal</span>
              <strong style={{ fontSize: "1.15rem" }}>${subtotal.toFixed(2)}</strong>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Taxes and shipping calculated at checkout. 30-day free returns.
            </p>
            <Link
              href="/checkout"
              className="btn btn-primary btn-block btn-lg"
              onClick={() => {
                track("add_to_cart", { value: subtotal, source: "drawer-checkout" });
                setOpen(false);
              }}
            >
              Checkout · ${subtotal.toFixed(2)}
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={clear}>
              Empty bag
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

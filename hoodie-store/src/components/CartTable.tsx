"use client";

import Image from "next/image";
import Link from "next/link";
import { track, useCart } from "@/components/CartProvider";

export function CartTable() {
  const { lines, subtotal, count, setQty, remove, clear } = useCart();
  const shipping = subtotal >= 75 || subtotal === 0 ? 0 : 6.95;
  const total = subtotal + shipping;

  if (lines.length === 0) {
    return (
      <div className="panel center" style={{ padding: 48 }}>
        <h2>Your bag is empty</h2>
        <p className="muted">Browse the range — every style publishes its GSM, measurements and per-size stock.</p>
        <Link href="/shop" className="btn btn-primary btn-lg">
          Shop all hoodies
        </Link>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 320px", gap: 28, alignItems: "start" }}>
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: "1.05rem" }}>Your bag ({count})</h2>
          <button className="btn btn-ghost btn-sm" onClick={clear}>
            Empty bag
          </button>
        </div>
        {lines.map((line) => (
          <div key={line.id} style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 16, padding: 18, borderBottom: "1px solid var(--line)" }}>
            <Link href={`/shop/${line.slug}`}>
              <Image src={line.image} alt={line.title} width={92} height={115} style={{ borderRadius: 8, objectFit: "cover" }} />
            </Link>
            <div>
              <Link href={`/shop/${line.slug}`} style={{ fontWeight: 620 }}>
                {line.title}
              </Link>
              <div className="muted small">
                {line.color} · Size {line.size}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <span className="qty">
                  <button onClick={() => setQty(line.id, line.qty - 1)} aria-label="Decrease quantity">
                    −
                  </button>
                  <span>{line.qty}</span>
                  <button onClick={() => setQty(line.id, line.qty + 1)} aria-label="Increase quantity">
                    +
                  </button>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(line.id)}>
                  Remove
                </button>
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>${(line.price * line.qty).toFixed(2)}</div>
          </div>
        ))}
      </div>

      <aside className="card card-pad" style={{ position: "sticky", top: 92 }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Summary</h2>
        <dl className="kv">
          <dt>Subtotal</dt>
          <dd>${subtotal.toFixed(2)}</dd>
          <dt>Shipping</dt>
          <dd>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</dd>
          <dt style={{ fontWeight: 700 }}>Total</dt>
          <dd style={{ fontWeight: 700, fontSize: "1.1rem" }}>${total.toFixed(2)}</dd>
        </dl>
        {shipping > 0 && (
          <div className="seo-note" style={{ margin: "14px 0" }}>
            Add <strong>${(75 - subtotal).toFixed(2)}</strong> for free worldwide shipping.
            <div className="progress" style={{ marginTop: 8 }}>
              <span style={{ width: `${Math.min(100, (subtotal / 75) * 100)}%` }} />
            </div>
          </div>
        )}
        <Link
          href="/checkout"
          className="btn btn-primary btn-block btn-lg"
          onClick={() => track("add_to_cart", { value: total, source: "cart-page" })}
        >
          Proceed to checkout
        </Link>
        <p className="muted small" style={{ marginTop: 12 }}>
          30-day free returns · prioritised size exchanges · duties calculated at checkout
        </p>
      </aside>
    </div>
  );
}

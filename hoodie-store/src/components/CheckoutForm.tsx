"use client";

import Link from "next/link";
import { useState } from "react";
import { track, useCart } from "@/components/CartProvider";
import { MARKETS } from "@/lib/i18n/markets";

type Status = "idle" | "submitting" | "done" | "error";

export function CheckoutForm() {
  const { lines, subtotal, count, clear } = useCart();
  const [status, setStatus] = useState<Status>("idle");
  const [order, setOrder] = useState<{ id: string; total: number; market: string } | null>(null);
  const [message, setMessage] = useState("");

  const shipping = subtotal >= 75 ? 0 : 6.95;
  const total = subtotal + shipping;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lines.length) return;
    setStatus("submitting");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      name: String(form.get("name") ?? ""),
      country: String(form.get("country") ?? "US"),
      address: String(form.get("address") ?? ""),
      city: String(form.get("city") ?? ""),
      postcode: String(form.get("postcode") ?? ""),
      method: String(form.get("method") ?? "card"),
      lines: lines.map((line) => ({ slug: line.slug, title: line.title, size: line.size, color: line.color, qty: line.qty, price: line.price })),
      source: sessionStorage.getItem("northloop.lastKeyword") ?? "direct",
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { orderId?: string; total?: number; market?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Checkout failed");
      setOrder({ id: json.orderId ?? "NL-000000", total: json.total ?? total, market: json.market ?? payload.country });
      track("purchase", { value: total, source: "checkout" });
      setStatus("done");
      clear();
    } catch (error) {
      setStatus("error");
      setMessage((error as Error).message);
    }
  };

  if (status === "done" && order) {
    return (
      <div className="panel center" style={{ padding: 44 }}>
        <span className="badge badge-good">Order confirmed</span>
        <h2 style={{ marginTop: 14 }}>Thank you — {order.id}</h2>
        <p className="muted" style={{ maxWidth: "52ch", margin: "0 auto 18px" }}>
          A confirmation email is on its way with tracking. Your order ships to {order.market} and totals $
          {order.total.toFixed(2)}. Returns are free for 30 days and size exchanges are prioritised.
        </p>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <Link href="/shop" className="btn btn-primary">
            Continue shopping
          </Link>
          <Link href="/shipping-returns" className="btn btn-outline">
            Delivery & returns
          </Link>
        </div>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="panel center" style={{ padding: 44 }}>
        <h2>Nothing to check out yet</h2>
        <p className="muted">Add a hoodie to your bag first.</p>
        <Link href="/shop" className="btn btn-primary">
          Shop all hoodies
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 320px", gap: 28, alignItems: "start" }}>
      <div className="card card-pad">
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Contact & delivery</h2>
        <div className="form-grid">
          <label className="field span-2">
            Email
            <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
          </label>
          <label className="field span-2">
            Full name
            <input type="text" name="name" required autoComplete="name" placeholder="Alex Morgan" />
          </label>
          <label className="field span-2">
            Address
            <input type="text" name="address" required autoComplete="street-address" placeholder="123 Example Street" />
          </label>
          <label className="field">
            City
            <input type="text" name="city" required autoComplete="address-level2" placeholder="Berlin" />
          </label>
          <label className="field">
            Postcode
            <input type="text" name="postcode" autoComplete="postal-code" placeholder="10115" />
          </label>
          <label className="field span-2">
            Country / market
            <select name="country" defaultValue="US" autoComplete="country">
              {MARKETS.map((market) => (
                <option key={market.country} value={market.country}>
                  {market.name} ({market.currency})
                </option>
              ))}
            </select>
            <span className="help">Duties for this market are calculated at checkout, so nothing is due on delivery.</span>
          </label>
        </div>

        <h3 style={{ marginTop: 24 }}>Payment method</h3>
        <div className="chip-row">
          {["card", "paypal", "applepay", "klarna"].map((method) => (
            <label key={method} className="chip" style={{ cursor: "pointer" }}>
              <input type="radio" name="method" value={method} defaultChecked={method === "card"} style={{ marginRight: 6 }} />
              {method === "card" ? "Card" : method === "paypal" ? "PayPal" : method === "applepay" ? "Apple Pay" : "Klarna (3 instalments)"}
            </label>
          ))}
        </div>
        <p className="help" style={{ marginTop: 12 }}>
          This is a demonstration checkout — no payment is taken and no card details are collected. Orders are recorded so
          conversion data can feed the SEO engine.
        </p>
      </div>

      <aside className="card card-pad" style={{ position: "sticky", top: 92 }}>
        <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Order summary</h2>
        {lines.map((line) => (
          <div key={line.id} className="row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: "0.85rem" }}>
            <span>
              {line.title} <span className="muted">× {line.qty}</span>
              <div className="muted small">
                {line.color} · {line.size}
              </div>
            </span>
            <strong>${(line.price * line.qty).toFixed(2)}</strong>
          </div>
        ))}
        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>Items</dt>
          <dd>{count}</dd>
          <dt>Subtotal</dt>
          <dd>${subtotal.toFixed(2)}</dd>
          <dt>Shipping</dt>
          <dd>{shipping === 0 ? "Free" : `$${shipping.toFixed(2)}`}</dd>
          <dt style={{ fontWeight: 700 }}>Total</dt>
          <dd style={{ fontWeight: 700, fontSize: "1.15rem" }}>${total.toFixed(2)}</dd>
        </dl>
        <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={status === "submitting"} style={{ marginTop: 14 }}>
          {status === "submitting" ? "Placing order…" : `Place order · $${total.toFixed(2)}`}
        </button>
        {status === "error" && (
          <p className="small" style={{ color: "var(--bad)", marginTop: 10 }}>
            {message}
          </p>
        )}
        <p className="muted small" style={{ marginTop: 12 }}>
          Secure checkout · 30-day free returns · tracked worldwide delivery
        </p>
      </aside>
    </form>
  );
}

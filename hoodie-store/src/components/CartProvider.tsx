"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartLine = {
  id: string;
  slug: string;
  title: string;
  image: string;
  price: number;
  size: string;
  color: string;
  qty: number;
};

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (line: Omit<CartLine, "id">) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "northloop.cart.v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, [lines, hydrated]);

  const add = useCallback((line: Omit<CartLine, "id">) => {
    const id = `${line.slug}:${line.size}:${line.color}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.id === id);
      if (existing) return prev.map((l) => (l.id === id ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l));
      return [...prev, { ...line, id }];
    });
    setOpen(true);
  }, []);

  const remove = useCallback((id: string) => setLines((prev) => prev.filter((l) => l.id !== id)), []);
  const setQty = useCallback(
    (id: string, qty: number) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(99, qty)) } : l))),
    [],
  );
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    return { lines, count, subtotal, open, setOpen, add, remove, setQty, clear };
  }, [lines, open, add, remove, setQty, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/** Fire-and-forget analytics beacon used by storefront interactions. */
const KEYWORD_KEY = "northloop.lastKeyword";

/**
 * Remember the query that brought this shopper in so the checkout can attribute
 * the order to it. Session-scoped, no cookies, no consent banner required.
 */
export function rememberKeyword(term?: string | null): void {
  try {
    const value = (term ?? "").trim().toLowerCase();
    if (value.length >= 3) sessionStorage.setItem(KEYWORD_KEY, value);
  } catch {
    /* private mode — attribution simply stays "direct" */
  }
}

export function lastKeyword(): string {
  try {
    return sessionStorage.getItem(KEYWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Pull the `q`/`kw` param off the current URL, if there is one. */
export function queryKeywordFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("q") ?? params.get("kw") ?? params.get("keyword") ?? "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export function track(
  type: "impression" | "click" | "view" | "add_to_cart" | "purchase" | "search" | "keyword_rank",
  payload: Record<string, unknown> = {},
) {
  try {
    const body = JSON.stringify({ type, ...payload });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  } catch {
    /* analytics must never break the shopping experience */
  }
}

import type { Product } from "@/lib/types";

/**
 * Pure product helpers shared by server and client components.
 *
 * This module must never import the datastore (node:fs) — client components
 * such as the product card and buy box depend on it.
 */

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function discountPct(product: Pick<Product, "price" | "compareAtPrice">): number {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return 0;
  return Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
}

export function inventoryHealth(product: Pick<Product, "inventory">) {
  const entries = Object.entries(product.inventory ?? {});
  const total = entries.reduce((sum, [, qty]) => sum + qty, 0);
  const inStockSizes = entries.filter(([, qty]) => qty > 0).map(([size]) => size);
  const coverage = entries.length ? Math.round((inStockSizes.length / entries.length) * 100) : 0;
  return {
    total,
    inStock: total > 0,
    lowStock: total > 0 && total <= 12,
    outOfStock: total === 0,
    coverage,
    inStockSizes,
  };
}

export function stockState(product: Pick<Product, "inventory">): { label: string; tone: "in" | "low" | "out" } {
  const stock = inventoryHealth(product);
  if (stock.outOfStock) return { label: "Sold out", tone: "out" };
  if (stock.lowStock) return { label: `Low stock — ${stock.total} left`, tone: "low" };
  return { label: "In stock", tone: "in" };
}

export function priceStats(products: Pick<Product, "price">[]) {
  if (!products.length) return { min: 0, max: 0, average: 0, median: 0 };
  const prices = products.map((p) => p.price).sort((a, b) => a - b);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  return {
    min: prices[0],
    max: prices[prices.length - 1],
    average: Math.round(average * 100) / 100,
    median: prices[Math.floor(prices.length / 2)],
  };
}

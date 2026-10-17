"use client";

import { useEffect } from "react";
import { rememberKeyword } from "@/components/CartProvider";

/**
 * Records the on-site query in the session so downstream events (add to cart,
 * purchase) are attributed to it. The search itself is logged server-side;
 * this only carries the intent forward through the funnel.
 */
export function SearchAttribution({ query }: { query: string }) {
  useEffect(() => {
    rememberKeyword(query);
  }, [query]);

  return null;
}

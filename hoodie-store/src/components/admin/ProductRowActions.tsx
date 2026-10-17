"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Per-row engine controls in the product table. */
export function ProductRowActions({
  id,
  slug,
  status,
  optimized,
}: {
  id: string;
  slug: string;
  status: string;
  optimized: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function act(action: "optimize" | "toggle" | "delete") {
    if (action === "delete" && !window.confirm(`Delete ${slug}? This removes the listing and its SEO profile.`)) return;
    setBusy(action);
    setMessage(null);
    try {
      if (action === "optimize") {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}/optimize`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passes: 3 }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Optimization failed");
        setMessage({ text: `Score ${data.before} → ${data.after} (${data.grade})`, tone: "ok" });
      } else if (action === "toggle") {
        const next = status === "published" ? "draft" : "published";
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: next, reoptimize: false }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Update failed");
        setMessage({ text: `Now ${next}`, tone: "ok" });
      } else {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Delete failed");
        setMessage({ text: `Deleted ${data.slug}`, tone: "ok" });
      }
      router.refresh();
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      setMessage({ text: (error as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-outline btn-sm" type="button" disabled={!!busy} onClick={() => void act("optimize")}>
          {busy === "optimize" ? "…" : optimized ? "Re-optimize" : "Optimize"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void act("toggle")}>
          {status === "published" ? "Unpublish" : "Publish"}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={!!busy} onClick={() => void act("delete")} title="Delete listing">
          ✕
        </button>
      </div>
      {message ? (
        <span className="small" style={{ color: message.tone === "ok" ? "var(--good)" : "var(--bad)" }}>
          {message.text}
        </span>
      ) : null}
    </div>
  );
}

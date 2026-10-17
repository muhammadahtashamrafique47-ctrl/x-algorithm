"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ items }: { items: { id: string; label: string; content: ReactNode; count?: number }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const current = items.find((item) => item.id === active) ?? items[0];

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Product information">
        {items.map((item) => (
          <button
            key={item.id}
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={item.id === current?.id}
            aria-controls={`panel-${item.id}`}
            className="tab"
            onClick={() => setActive(item.id)}
          >
            {item.label}
            {typeof item.count === "number" ? ` (${item.count})` : ""}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${current?.id}`} aria-labelledby={`tab-${current?.id}`}>
        {current?.content}
      </div>
    </div>
  );
}

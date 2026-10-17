import type { ReactNode } from "react";

/** Renders one or more JSON-LD blocks in the document head-adjacent body. */
export function JsonLd({ data }: { data: unknown | unknown[] }) {
  const blocks: unknown[] = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.filter(Boolean).map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          // JSON-LD must be emitted verbatim; Next escapes string children in <script>.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}

export function SeoComment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

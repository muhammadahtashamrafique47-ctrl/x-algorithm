"use client";

import Image from "next/image";
import { useState } from "react";
import type { ProductImage } from "@/lib/types";

export function Gallery({ images, alt, title }: { images: ProductImage[]; alt: { src: string; alt: string }[]; title: string }) {
  const [active, setActive] = useState(0);
  const list = images.length ? images : [{ src: "/images/site/placeholder.jpg", alt: title, width: 1200, height: 1500 }];
  const current = list[active];
  const currentAlt = alt.find((a) => a.src === current.src)?.alt || current.alt || title;

  return (
    <div className="pdp-gallery">
      <div className="pdp-hero">
        <Image
          src={current.src}
          alt={currentAlt}
          width={current.width ?? 1200}
          height={current.height ?? 1500}
          priority
          sizes="(max-width: 980px) 100vw, 52vw"
        />
      </div>
      {list.length > 1 && (
        <div className="pdp-thumbs">
          {list.map((image, index) => (
            <button
              key={`${image.src}-${index}`}
              className="pdp-thumb"
              aria-current={index === active}
              aria-label={`View image ${index + 1}: ${alt.find((a) => a.src === image.src)?.alt ?? image.alt ?? title}`}
              onClick={() => setActive(index)}
            >
              <Image src={image.src} alt="" width={160} height={160} sizes="80px" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

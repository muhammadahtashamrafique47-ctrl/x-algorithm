import type { MetadataRoute } from "next";
import { BRAND_NAME, SITE_URL } from "@/lib/i18n/markets";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND_NAME} — Heavyweight Hoodies`,
    short_name: BRAND_NAME,
    description: "280–500 GSM hoodies with published fabric weights, flat measurements and worldwide delivery.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fbfaf8",
    theme_color: "#14161a",
    categories: ["shopping", "lifestyle"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Shop all hoodies", url: "/shop", description: "Browse the full range" },
      { name: "Heavyweight 400+ GSM", url: "/collections/heavyweight" },
      { name: "Size guide", url: "/size-guide" },
    ],
    related_applications: [],
    prefer_related_applications: false,
    id: SITE_URL,
  };
}

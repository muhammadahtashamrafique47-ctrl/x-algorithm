import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { JsonLd } from "@/components/JsonLd";
import { requestOrigin } from "@/lib/request-origin";
import { withOrigin } from "@/lib/seo/schema";
import { ensureCatalogue } from "@/lib/store/bootstrap";
import { organizationSchema, websiteSchema } from "@/lib/seo/schema";
import { BRAND_NAME, BRAND_TAGLINE, DEFAULT_LOCALE, MARKET_BY_LOCALE, SERVED_LOCALES, SITE_URL, SUPPORT_EMAIL } from "@/lib/i18n/markets";

/**
 * The catalogue is file-backed and mutable from the admin, so the whole app is
 * rendered per request. Crawlers therefore always see the latest optimized
 * listing, and `dateModified`, the sitemap and JSON-LD never drift apart.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const siteOrigin = await requestOrigin();

  return {
    metadataBase: new URL(siteOrigin),
    title: {
      default: `${BRAND_NAME} — Heavyweight Hoodies, Built for Every Climate`,
      template: `%s | ${BRAND_NAME}`,
    },
  description: `Shop ${BRAND_NAME} hoodies: 280–500 GSM cotton, merino-blend and tech fleece in oversized, cropped, zip-up and heavyweight fits. Free worldwide shipping over $75, 30-day free returns and a true-to-size fit guide for every style.`,
  keywords: [
    "hoodie", "hoodies", "heavyweight hoodie", "oversized hoodie", "zip up hoodie", "organic cotton hoodie",
    "sherpa lined hoodie", "400 gsm hoodie", "mens hoodies", "womens hoodies", "blank hoodies wholesale",
    "winter hoodie", "tech fleece hoodie", "cropped hoodie", "merino hoodie",
  ],
  applicationName: BRAND_NAME,
    authors: [{ name: BRAND_NAME, url: siteOrigin }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  category: "shopping",
  alternates: {
    canonical: "/",
    languages: Object.fromEntries(
      SERVED_LOCALES.filter((locale) => MARKET_BY_LOCALE[locale]).map((locale) => [locale, `/?hl=${locale}`]),
    ),
  },
  openGraph: {
    type: "website",
      url: siteOrigin,
      siteName: BRAND_NAME,
    title: `${BRAND_NAME} — Heavyweight Hoodies, Built for Every Climate`,
    description: BRAND_TAGLINE,
    locale: DEFAULT_LOCALE.replace("-", "_"),
      images: [{ url: `${siteOrigin}/images/site/hero.jpg`, width: 1200, height: 1500, alt: `${BRAND_NAME} heavyweight hoodie collection` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} — Heavyweight Hoodies`,
    description: BRAND_TAGLINE,
      images: [`${siteOrigin}/images/site/hero.jpg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/brand/logo.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/brand/logo.png" }],
  },
  manifest: "/manifest.webmanifest",
    other: { "contact-email": SUPPORT_EMAIL },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14161a",
  colorScheme: "light",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await ensureCatalogue();
  const siteOrigin = await requestOrigin();

  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <JsonLd data={withOrigin(siteOrigin, () => [organizationSchema(), websiteSchema()])} />
        <div id="main">{children}</div>
      </body>
    </html>
  );
}

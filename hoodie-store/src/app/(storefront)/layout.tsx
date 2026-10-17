import type { ReactNode } from "react";
import { CartProvider } from "@/components/CartProvider";
import { CartDrawer } from "@/components/CartDrawer";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BRAND_NAME, MARKET_BY_LOCALE, SERVED_LOCALES } from "@/lib/i18n/markets";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  const locales = SERVED_LOCALES.map((locale) => ({ locale, name: MARKET_BY_LOCALE[locale]?.name ?? locale }));

  return (
    <CartProvider>
      <Header brandName={BRAND_NAME} locales={locales} />
      {children}
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}

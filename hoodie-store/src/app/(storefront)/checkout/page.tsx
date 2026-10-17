import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/components/CheckoutForm";
import { JsonLd } from "@/components/JsonLd";
import { requestOrigin } from "@/lib/request-origin";
import { breadcrumbSchema, withOrigin } from "@/lib/seo/schema";

export const metadata: Metadata = {
  title: "Secure checkout",
  description: "Complete your hoodie order with tracked worldwide delivery, duties calculated at checkout and 30-day free returns.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/checkout" },
};

export default async function CheckoutPage() {
  const siteOrigin = await requestOrigin();
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Bag", href: "/cart" }, { name: "Checkout", href: "/checkout" }])} />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <Link href="/cart">Bag</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Checkout</span>
        </nav>
        <div className="row-between" style={{ marginTop: 14, marginBottom: 20 }}>
          <h1 style={{ margin: 0 }}>Checkout</h1>
          <span className="badge badge-accent">🔒 Encrypted · no card details stored</span>
        </div>
        <CheckoutForm />
      </div>
    </>
  );
}

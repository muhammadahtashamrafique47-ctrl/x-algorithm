import type { Metadata } from "next";
import Link from "next/link";
import { CartTable } from "@/components/CartTable";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";

export const metadata: Metadata = {
  title: "Your bag",
  description: "Review the hoodies in your bag, adjust quantities and proceed to secure checkout with 30-day free returns.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/cart" },
};

export default function CartPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: "Home", href: "/" }, { name: "Bag", href: "/cart" }])} />
      <div className="container section-tight">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> <span aria-hidden="true">/</span>
          <span aria-current="page">Bag</span>
        </nav>
        <h1 style={{ marginTop: 14 }}>Your bag</h1>
      </div>
      <div className="container section-tight">
        <CartTable />
      </div>
    </>
  );
}

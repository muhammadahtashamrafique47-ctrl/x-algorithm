import type { NextConfig } from "next";

/**
 * Next.js configuration tuned for a globally-targeted commerce storefront.
 *
 * - `allowedDevOrigins` whitelists the sandbox preview host so dev asset
 *   requests are not blocked as cross-origin.
 * - Security + caching headers are applied at the edge of the Node server so
 *   the storefront passes common technical-SEO / site-audit checks.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 96, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: ["@/components"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      {
        // Long-lived caching for the product catalogue feed used by Merchant Center style crawlers.
        source: "/feeds/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { ProductDraft } from "@/lib/types";

/**
 * CSV import/export for the product pipeline.
 *
 * Import accepts the columns merchants actually have in a spreadsheet export
 * (Shopify/Woo/Excel style), tolerates missing columns and coerces types, then
 * hands the result to the same normalize → optimize path as a manual upload.
 */

export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? "").trim()])));
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const ALIASES: Record<string, string[]> = {
  title: ["title", "product_title", "name", "product_name"],
  sku: ["sku", "handle", "variant_sku", "id"],
  slug: ["slug", "url", "url_handle", "permalink"],
  brand: ["brand", "vendor"],
  category: ["category", "product_type", "type"],
  collections: ["collections", "tags_collection", "category_path"],
  gender: ["gender", "target_gender", "audience"],
  price: ["price", "sale_price", "price_usd"],
  compareAtPrice: ["compare_at_price", "was_price", "original_price", "msrp"],
  cost: ["cost", "cost_per_item", "cogs"],
  currency: ["currency", "price_currency"],
  material: ["material", "fabric", "composition"],
  weightGsm: ["weight_gsm", "gsm", "fabric_weight"],
  fit: ["fit", "fit_type"],
  sizes: ["sizes", "size", "available_sizes"],
  colors: ["colors", "color", "colour", "colorways"],
  features: ["features", "bullets", "highlights"],
  description: ["description", "body_html", "product_description", "long_description"],
  images: ["images", "image", "image_src", "image_url", "photos"],
  inventory: ["inventory", "stock", "quantity", "inventory_quantity"],
  tags: ["tags", "keywords"],
  rating: ["rating", "avg_rating"],
  reviewCount: ["review_count", "reviews", "number_of_reviews"],
  careInstructions: ["care", "care_instructions"],
  countryOfOrigin: ["country_of_origin", "origin", "made_in"],
  status: ["status", "published", "state"],
};

function pick(row: Record<string, string>, field: string): string {
  for (const alias of ALIASES[field] ?? [field]) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
  }
  return "";
}

function splitList(value: string): string[] {
  return value
    .split(/[;|]|\s{2,}|,(?=\s)/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter(Boolean);
}

export function csvRowsToDrafts(rows: Record<string, string>[]): ProductDraft[] {
  return rows
    .filter((row) => pick(row, "title"))
    .map((row) => {
      const colors = splitList(pick(row, "colors")).map((name) => ({ name, hex: colorHex(name) }));
      const sizes = splitList(pick(row, "sizes"));
      const inventoryRaw = pick(row, "inventory");
      const totalStock = Number(inventoryRaw.replace(/[^0-9]/g, "")) || 0;

      const draft: ProductDraft = {
        title: pick(row, "title"),
        sku: pick(row, "sku") || undefined,
        slug: pick(row, "slug") || undefined,
        brand: pick(row, "brand") || undefined,
        category: pick(row, "category") || undefined,
        collections: splitList(pick(row, "collections")),
        gender: (["men", "women", "unisex", "kids"].includes(pick(row, "gender").toLowerCase())
          ? pick(row, "gender").toLowerCase()
          : undefined) as ProductDraft["gender"],
        price: Number(pick(row, "price").replace(/[^0-9.]/g, "")) || 0,
        compareAtPrice: pick(row, "compareAtPrice") ? Number(pick(row, "compareAtPrice").replace(/[^0-9.]/g, "")) : undefined,
        cost: pick(row, "cost") ? Number(pick(row, "cost").replace(/[^0-9.]/g, "")) : undefined,
        currency: pick(row, "currency") || "USD",
        colors: colors.length ? colors : undefined,
        sizes: sizes.length ? sizes : undefined,
        material: pick(row, "material") || undefined,
        weightGsm: pick(row, "weightGsm") ? Number(pick(row, "weightGsm").replace(/[^0-9]/g, "")) : undefined,
        fit: pick(row, "fit") || undefined,
        features: splitList(pick(row, "features")),
        description: pick(row, "description") || undefined,
        images: splitList(pick(row, "images")).map((src) => ({ src, alt: "", width: 1200, height: 1500 })),
        inventory: sizes.length && totalStock
          ? Object.fromEntries(sizes.map((size, index) => [size, Math.max(0, Math.round(totalStock / sizes.length) + (index === 0 ? totalStock % sizes.length : 0))]))
          : undefined,
        tags: splitList(pick(row, "tags")),
        careInstructions: pick(row, "careInstructions") || undefined,
        countryOfOrigin: pick(row, "countryOfOrigin") || undefined,
        rating: pick(row, "rating") ? Number(pick(row, "rating")) : undefined,
        reviewCount: pick(row, "reviewCount") ? Number(pick(row, "reviewCount")) : undefined,
        status: pick(row, "status").toLowerCase() === "draft" ? "draft" : "published",
      };
      return draft;
    });
}

const COLOR_HEX: Record<string, string> = {
  black: "#14151a", white: "#f4f4f2", grey: "#9a9a9c", gray: "#9a9a9c", navy: "#22304a",
  beige: "#d9c9ae", sand: "#d9c9ae", cream: "#e9e0cd", ecru: "#e8e2d6", bone: "#efe9dd",
  olive: "#5c6142", sage: "#8a9a7b", green: "#3f6b4a", teal: "#2f6f6a", burgundy: "#6b2233",
  brown: "#6b4f3a", mocha: "#6b4f3a", pink: "#d99aa6", blue: "#3b5f8a", red: "#a3262a",
  charcoal: "#33363b", graphite: "#4b4e54", slate: "#4a5460", stone: "#b9b3a7", forest: "#2c4034",
  pine: "#2c4438", clay: "#b07a5a", undyed: "#e6dfd2", heather: "#9a9a9c", sunset: "#d1663f",
};

export function colorHex(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (COLOR_HEX[key]) return COLOR_HEX[key];
  for (const [match, hex] of Object.entries(COLOR_HEX)) if (key.includes(match)) return hex;
  // Deterministic fallback so swatches are always distinct per colourway name.
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return `#${hash.toString(16).padStart(6, "0").slice(0, 6)}`;
}

export function toCsv(rows: Record<string, string | number>[], columns?: string[]): string {
  if (!rows.length) return "";
  const headers = columns ?? Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
}

/** Detects whether an upload payload is CSV or JSON. */
export function detectFormat(text: string): "csv" | "json" {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
  return "csv";
}

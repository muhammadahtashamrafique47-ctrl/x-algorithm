import { buildKeywordContext, selectKeywords } from "../src/lib/seo/optimizer";
import { getAllProducts } from "../src/lib/store/db";
import { expandKeywords } from "../src/lib/seo/keywords";

const slug = process.argv[2] ?? "studio-blank-hoodie";
const product = getAllProducts().find((p) => p.slug.includes(slug));
if (!product) throw new Error("not found");
const ctx = buildKeywordContext(product, new Date().getMonth(), ["US", "GB", "DE"]);

const expanded = expandKeywords(ctx, { limit: 400 });
const interesting = expanded
  .filter((k) => /blank|kids|essential/.test(k.term))
  .sort((a, b) => b.priority - a.priority)
  .slice(0, 14);
console.log("--- candidates matching blank/kids/essential ---");
for (const k of interesting) {
  console.log(k.term.padEnd(30), "vol", String(k.volume).padStart(8), "P", String(k.priority).padStart(3), "sal", String(k.salience ?? "-"), "rel", String(k.relevance).padEnd(5), k.intent, "|", k.kind);
}

console.log("\n--- selected primary + top 6 ---");
const selected = selectKeywords(product, ctx);
for (const k of selected.slice(0, 7)) {
  console.log(k.kind.padEnd(10), k.term.padEnd(30), "vol", String(k.volume).padStart(8), "P", String(k.priority).padStart(3), "sal", String(k.salience ?? "-"), k.intent);
}

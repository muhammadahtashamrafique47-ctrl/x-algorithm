import { attributeSalience } from "../src/lib/seo/optimizer";
import { getAllProducts } from "../src/lib/store/db";
import { extractAttributes } from "../src/lib/seo/keywords";

for (const slug of process.argv.slice(2)) {
  const product = getAllProducts().find((p) => p.slug.includes(slug));
  if (!product) continue;
  const attrs = extractAttributes(product);
  const sal = attributeSalience(product, attrs);
  console.log("=".repeat(70));
  console.log(product.slug, "|", product.title, "| category:", product.category, "| gender:", product.gender);
  console.log("material:", product.material, "| fit:", product.fit, "| gsm:", product.weightGsm);
  console.log("features:", (product.features ?? []).slice(0, 8).join(" / "));
  console.log("attributes:", JSON.stringify(attrs));
  console.log("salience:", JSON.stringify(Object.entries(sal).sort((a, b) => b[1] - a[1]).slice(0, 18)));
}

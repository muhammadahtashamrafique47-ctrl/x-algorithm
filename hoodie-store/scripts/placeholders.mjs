// Renders branded JPEG placeholders for assets still pending real photography.
// Overwritten when the generated imagery lands.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const targets = [
  { file: "public/images/site/placeholder.jpg", label: "Image pending", sub: "Northloop Supply Co." },
  { file: "public/images/site/hero.jpg", label: "Heavyweight collection", sub: "280-500 GSM - free worldwide shipping" },
  { file: "public/images/detail/brushed-fleece.jpg", label: "Brushed fleece detail", sub: "Macro shot pending" },
  { file: "public/images/detail/hood-drawcord.jpg", label: "Hood and drawcord detail", sub: "Macro shot pending" },
  { file: "public/images/products/junior-kids-teal.jpg", label: "Junior Explorer Kids Hoodie", sub: "Teal - product shot pending" },
  { file: "public/images/products/summit-half-zip-burgundy.jpg", label: "Summit Half-Zip Hoodie", sub: "Burgundy - product shot pending" },
  { file: "public/images/detail/ribbed-cuff.jpg", label: "Ribbed cuff detail", sub: "Macro shot pending" },
];

// Non-destructive by default: real photography that lands later must survive a
// re-run of this script. Pass --force to overwrite.
const FORCE = process.argv.includes("--force");

const svgFor = (label, sub) => `
<svg width="1200" height="1500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6f4f0"/>
      <stop offset="100%" stop-color="#e2ded6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1500" fill="url(#g)"/>
  <g transform="translate(600,620)">
    <path d="M-180 380 V-60 a180 180 0 0 1 360 0 V380 h-110 V20 a70 70 0 0 0-140 0 v360 z" fill="#cfcac0"/>
    <circle cx="0" cy="-120" r="46" fill="#1f4d3f" opacity="0.85"/>
  </g>
  <text x="600" y="1180" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="600" fill="#4a4f57" text-anchor="middle">${label}</text>
  <text x="600" y="1250" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#8b8f96" text-anchor="middle">${sub}</text>
</svg>`;

for (const target of targets) {
  fs.mkdirSync(path.dirname(target.file), { recursive: true });
  if (!FORCE && fs.existsSync(target.file)) {
    console.log("skip (exists)", target.file);
    continue;
  }
  await sharp(Buffer.from(svgFor(target.label, target.sub))).jpeg({ quality: 82 }).toFile(target.file);
  console.log("wrote", target.file);
}

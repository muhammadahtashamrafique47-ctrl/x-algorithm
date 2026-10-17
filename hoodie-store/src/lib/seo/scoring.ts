import type { Product, ScoreFactor, SeoIssue, SeoProfile, SeoScore } from "@/lib/types";
import {
  avgSentenceLength, density, hashString, readingEase, sentences, slugify, stem, tokenize, wordCount, round, contentWords,
} from "@/lib/seo/text";
import { getAllProducts } from "@/lib/store/db";
import { plausibility } from "@/lib/seo/keywords";
import { cannibalizationRisks, clickDepth } from "@/lib/seo/internal";
import { priceBandFor } from "@/lib/seo/external";

/**
 * On-page SEO scoring engine.
 *
 * Every factor is modelled on a documented Google ranking system (see
 * external.ts → ALGORITHM_FACTORS) and produces a numeric score plus a
 * human-readable diagnosis and an actionable fix. The optimizer loop consumes
 * the fixes, applies them, and re-scores until the listing converges.
 */

export const MIN_CONTENT_WORDS = Number(process.env.SEO_MIN_CONTENT_WORDS ?? 320);

export type ScoringContext = {
  /** Similarity to the closest competing listing in the catalogue (0..1) */
  maxSimilarity: number;
  duplicateTitles: string[];
  duplicateDescriptions: string[];
  sharedPrimaryKeywords: { slug: string; terms: string[] }[];
};

export function buildScoringContext(product: Product): ScoringContext {
  const others = getAllProducts().filter((p) => p.id !== product.id && p.status !== "archived");
  const risks = cannibalizationRisks(product, { threshold: 0.45 });
  return {
    maxSimilarity: risks[0]?.similarity ?? 0,
    duplicateTitles: others.filter((p) => p.seo?.seoTitle === product.seo?.seoTitle).map((p) => p.slug),
    duplicateDescriptions: others.filter((p) => p.seo?.metaDescription === product.seo?.metaDescription).map((p) => p.slug),
    sharedPrimaryKeywords: risks
      .filter((r) => r.sharedPrimary.length)
      .map((r) => ({ slug: r.slug, terms: r.sharedPrimary })),
  };
}

function factor(
  id: string,
  group: ScoreFactor["group"],
  label: string,
  weight: number,
  ratio: number,
  detail: string,
  fix?: string,
): ScoreFactor {
  const clamped = Math.max(0, Math.min(1, ratio));
  return { id, group, label, weight, score: round(clamped * weight, 2), detail, fix: clamped < 0.999 ? fix : undefined };
}

export function bodyText(profile: SeoProfile): string {
  return [
    profile.body.intro,
    ...profile.body.sections.map((s) => `${s.heading} ${s.body} ${(s.bullets ?? []).join(" ")}`),
    ...profile.body.faq.map((f) => `${f.q} ${f.a}`),
    profile.bullets.join(" "),
    profile.body.cta,
  ].join(" ");
}

export function scoreListing(product: Product, profile: SeoProfile, ctx: ScoringContext = buildScoringContext(product)): SeoScore {
  const factors: ScoreFactor[] = [];
  const issues: SeoIssue[] = [];
  const primary = profile.keywords.find((k) => k.kind === "primary") ?? profile.keywords[0];
  const primaryTerm = primary?.term ?? "";
  const secondary = profile.keywords.filter((k) => k.kind === "secondary" || k.kind === "longtail").slice(0, 12);
  const text = bodyText(profile);
  const words = wordCount(text);
  const title = profile.seoTitle;
  const meta = profile.metaDescription;

  const addIssue = (issue: Omit<SeoIssue, "id">) => issues.push({ id: `${issue.field}:${hashString(issue.message)}`, ...issue });

  // 1 — Title tag ------------------------------------------------------------------
  const titleLen = title.length;
  const titleHasKeyword = primaryTerm ? title.toLowerCase().includes(primaryTerm.split(" ")[0]) : false;
  const titleKeywordEarly = primaryTerm ? title.toLowerCase().indexOf(primaryTerm.split(" ")[0]) < 24 : false;
  const titleLenScore = titleLen >= 45 && titleLen <= 62 ? 1 : titleLen >= 30 && titleLen <= 70 ? 0.6 : 0.2;
  factors.push(
    factor(
      "title",
      "onpage",
      "Title tag",
      9,
      titleLenScore * 0.5 + (titleHasKeyword ? 0.3 : 0) + (titleKeywordEarly ? 0.2 : 0),
      `${titleLen} characters (target 45-62). Primary keyword ${titleHasKeyword ? "present" : "missing"}${titleKeywordEarly ? " and front-loaded" : ""}.`,
      titleLen > 62
        ? "Shorten the title — Google truncates around 580px (~60 characters)."
        : !titleHasKeyword
          ? `Rewrite the title to include “${primaryTerm}” within the first 5 words.`
          : "Move the primary keyword closer to the start of the title.",
    ),
  );
  if (titleLen > 65 || titleLen < 30) addIssue({ severity: "critical", field: "seoTitle", message: `Title length ${titleLen} is outside the 30-65 character safe range.`, fix: "Regenerate the title within 45-62 characters." });
  if (!titleHasKeyword) addIssue({ severity: "critical", field: "seoTitle", message: "Title does not contain the primary keyword.", fix: `Include “${primaryTerm}”.` });
  if (ctx.duplicateTitles.length) addIssue({ severity: "critical", field: "seoTitle", message: `Identical title used by ${ctx.duplicateTitles.join(", ")}.`, fix: "Make the title unique per listing." });

  // 2 — Meta description -----------------------------------------------------------
  const metaLen = meta.length;
  const metaHasKeyword = primaryTerm ? meta.toLowerCase().includes(primaryTerm.split(" ")[0]) : false;
  const metaHasCta = /(shop|buy|order|discover|explore|free shipping|free returns|add to|get yours|secure)/i.test(meta);
  const metaLenScore = metaLen >= 140 && metaLen <= 165 ? 1 : metaLen >= 110 && metaLen <= 180 ? 0.65 : 0.25;
  factors.push(
    factor("meta", "onpage", "Meta description", 7, metaLenScore * 0.5 + (metaHasKeyword ? 0.25 : 0) + (metaHasCta ? 0.25 : 0),
      `${metaLen} characters (target 140-165). Keyword ${metaHasKeyword ? "included" : "missing"}, CTA ${metaHasCta ? "present" : "missing"}.`,
      metaLen > 165 ? "Trim to ~155 characters to avoid truncation in the SERP." : !metaHasCta ? "Add a conversion-oriented CTA (free shipping / free returns / shop now)." : "Include the primary keyword to trigger query-term bolding."),
  );
  if (ctx.duplicateDescriptions.length) addIssue({ severity: "warning", field: "metaDescription", message: `Duplicate meta description shared with ${ctx.duplicateDescriptions.join(", ")}.`, fix: "Write a unique meta description." });

  // 3 — URL / slug ------------------------------------------------------------------
  const slug = profile.slug;
  const slugTokens = tokenize(slug);
  const slugLen = slug.length;
  const nameTokens = new Set(tokenize(product.title).map(stem));
  const slugHasKeyword = primaryTerm
    ? slugTokens.some((token) => token === stem(primaryTerm.split(" ")[0]) || nameTokens.has(token))
    : true;
  const slugClean = !/\d{4}|--|_|\?|=/.test(slug);
  factors.push(
    factor("url", "technical", "URL structure", 4,
      (slugLen <= 60 ? 0.4 : slugLen <= 80 ? 0.2 : 0) + (slugHasKeyword ? 0.3 : 0) + (slugClean ? 0.3 : 0),
      `/${slug} — ${slugTokens.length} tokens, ${slugLen} characters, ${slugHasKeyword ? "keyword/name-bearing" : "no keyword or product name"}.`,
      "Use a short hyphenated slug derived from the product name — no IDs, dates, colourways or stop words."),
  );
  if (slug !== slugify(slug)) addIssue({ severity: "warning", field: "slug", message: "Slug is not canonical (lowercase, hyphenated).", fix: `Change to “${slugify(slug)}”.` });

  // 4 — H1 ---------------------------------------------------------------------------
  const h1 = profile.h1;
  const h1HasKeyword = primaryTerm ? h1.toLowerCase().includes(primaryTerm.split(" ")[0]) : true;
  factors.push(
    factor("h1", "onpage", "H1 relevance", 4,
      (h1 && h1.length <= 78 ? 0.4 : 0.15) + (h1HasKeyword ? 0.4 : 0) + (h1 !== title ? 0.2 : 0.1),
      h1 ? `Single H1 (${h1.length} chars), keyword ${h1HasKeyword ? "present" : "absent"}.` : "No H1 generated.",
      "Give the page exactly one H1 that states the product and its primary keyword in user language."),
  );
  if (!h1) addIssue({ severity: "critical", field: "h1", message: "Missing H1.", fix: "Generate an H1 from the product name + primary attribute." });

  // 5 — Heading structure --------------------------------------------------------------
  const h2Count = profile.body.sections.length;
  const h2WithKeyword = profile.body.sections.filter((s) => secondary.some((k) => s.heading.toLowerCase().includes(k.term.split(" ")[0]))).length;
  const hasFaq = profile.body.faq.length >= 3;
  factors.push(
    factor("headings", "content", "Heading hierarchy", 5,
      (h2Count >= 4 ? 0.4 : h2Count / 4 * 0.4) + Math.min(0.3, (h2WithKeyword / Math.max(1, h2Count)) * 0.3) + (hasFaq ? 0.3 : 0),
      `${h2Count} H2 sections, ${h2WithKeyword} contain secondary keywords, FAQ block ${hasFaq ? "present" : "missing"}.`,
      hasFaq ? "Add secondary keywords to more H2 headings." : "Add at least three FAQ entries to qualify for FAQ rich results and People-Also-Ask."),
  );

  // 6 — Content depth --------------------------------------------------------------------
  const depthRatio = words / MIN_CONTENT_WORDS;
  const introWords = wordCount(profile.body.intro);
  factors.push(
    factor("depth", "content", "Content depth", 10,
      Math.min(1, depthRatio) * 0.7 + (introWords >= 35 && introWords <= 90 ? 0.3 : 0.12),
      `${words} words (target ${MIN_CONTENT_WORDS}+). Intro ${introWords} words.`,
      words < MIN_CONTENT_WORDS ? `Expand with fabric, fit, care and styling sections to reach ${MIN_CONTENT_WORDS}+ words.` : "Tighten the intro to 40-80 words so the key information is above the fold."),
  );
  if (words < MIN_CONTENT_WORDS) addIssue({ severity: "critical", field: "body", message: `Body copy is ${words} words, below the ${MIN_CONTENT_WORDS}-word thin-content threshold.`, fix: "Auto-expand with structured sections." });

  // 7 — Keyword targeting ------------------------------------------------------------------
  const intentMix = new Set(profile.keywords.map((k) => k.intent)).size;
  const hasQuestions = profile.keywords.some((k) => k.kind === "question");
  const hasSeasonal = profile.keywords.some((k) => k.kind === "seasonal");
  const topPriority = primary?.priority ?? 0;
  factors.push(
    factor("targeting", "semantic", "Keyword targeting", 9,
      (profile.keywords.length >= 12 ? 0.25 : profile.keywords.length / 12 * 0.25) +
      Math.min(0.25, topPriority / 100 * 0.25) +
      (intentMix >= 3 ? 0.2 : intentMix / 3 * 0.2) +
      (hasQuestions ? 0.15 : 0) + (hasSeasonal ? 0.15 : 0),
      `${profile.keywords.length} targets, top priority ${topPriority}/100, ${intentMix} intent types, questions ${hasQuestions ? "yes" : "no"}, seasonal ${hasSeasonal ? "yes" : "no"}.`,
      hasQuestions ? "Broaden the long-tail set to at least 12 targets across transactional, commercial and informational intent." : "Add question-form keywords to capture People-Also-Ask traffic."),
  );

  // 8 — Keyword density --------------------------------------------------------------------
  const primaryDensity = primaryTerm ? density(text, primaryTerm) : 0;
  const stuffed = primaryDensity > 3.5;
  const densityScore = primaryDensity >= 0.4 && primaryDensity <= 2.8 ? 1 : primaryDensity > 0 ? 0.5 : 0.15;
  factors.push(
    factor("density", "content", "Keyword density", 4, stuffed ? 0.2 : densityScore,
      `Primary density ${round(primaryDensity, 2)}% (ideal 0.4-2.8%). ${stuffed ? "Risk of stuffing penalty." : ""}`,
      stuffed ? "Replace repeated exact matches with variants and pronouns." : primaryDensity < 0.4 ? "Use the primary keyword phrase naturally one or two more times." : "Balanced."),
  );
  if (stuffed) addIssue({ severity: "warning", field: "body", message: `Keyword density ${round(primaryDensity, 2)}% exceeds the 3.5% stuffing threshold.`, fix: "Diversify phrasing." });

  // 9 — Semantic / entity coverage -----------------------------------------------------------
  const entityGroups = ["construction", "fabric", "fit", "care", "trust", "sustainability", "commerce"];
  const lowerText = text.toLowerCase();
  const hitGroups = entityGroups.filter((g) => ENTITY_PROBES[g].some((probe) => lowerText.includes(probe)));
  factors.push(
    factor("semantic", "semantic", "Semantic & entity coverage", 8, hitGroups.length / entityGroups.length,
      `${hitGroups.length}/${entityGroups.length} entity groups covered (${hitGroups.join(", ") || "none"}).`,
      `Add copy covering: ${entityGroups.filter((g) => !hitGroups.includes(g)).join(", ")}.`),
  );

  // 10 — Readability ------------------------------------------------------------------------
  const ease = readingEase(text);
  const asl = avgSentenceLength(text);
  factors.push(
    factor("readability", "experience", "Readability", 4,
      (ease >= 55 && ease <= 85 ? 0.6 : ease >= 40 ? 0.35 : 0.15) + (asl <= 22 ? 0.4 : 0.15),
      `Flesch reading ease ${ease} (target 55-85), average sentence ${asl} words.`,
      ease < 55 ? "Break long sentences and swap jargon for plain language — apparel copy should read at grade 6-8." : "Keep sentence length under 22 words for mobile scannability."),
  );

  // 11 — Image SEO ----------------------------------------------------------------------------
  const images = product.images ?? [];
  const alts = profile.imageAlt.length ? profile.imageAlt : images.map((i) => ({ src: i.src, alt: i.alt }));
  const withAlt = alts.filter((a) => a.alt && a.alt.length >= 20);
  const altUnique = new Set(withAlt.map((a) => a.alt.toLowerCase())).size;
  const dimensions = images.filter((i) => i.width && i.height).length;
  factors.push(
    factor("images", "technical", "Image SEO & CLS safety", 7,
      (images.length >= 3 ? 0.25 : images.length / 3 * 0.25) +
      (images.length ? (withAlt.length / images.length) * 0.4 : 0) +
      (withAlt.length ? (altUnique / withAlt.length) * 0.2 : 0) +
      (images.length ? (dimensions / images.length) * 0.15 : 0),
      `${images.length} images, ${withAlt.length} with descriptive alt, ${altUnique} unique alt strings, ${dimensions} with explicit dimensions.`,
      images.length < 3 ? "Add at least three images (front, back, detail/lifestyle) — image pack traffic requires depth." : "Write unique, descriptive alt text per image using keyword variants, and set width/height to prevent CLS."),
  );
  if (images.length && withAlt.length < images.length) addIssue({ severity: "warning", field: "images", message: `${images.length - withAlt.length} image(s) missing descriptive alt text.`, fix: "Auto-generate alt text from attributes." });

  // 12 — Structured data -------------------------------------------------------------------------
  const required = ["Product", "Offer", "AggregateRating", "BreadcrumbList", "FAQPage"];
  const present = required.filter((t) => profile.structuredData.includes(t));
  factors.push(
    factor("structured-data", "technical", "Structured data eligibility", 9, present.length / required.length,
      `${present.length}/${required.length} required schema types emitted${profile.structuredData.includes("Review") ? " + Review" : ""}.`,
      `Add missing types: ${required.filter((t) => !present.includes(t)).join(", ") || "none"}.`),
  );
  if (present.length < required.length) addIssue({ severity: "critical", field: "structuredData", message: `Missing schema types: ${required.filter((t) => !present.includes(t)).join(", ")}.`, fix: "Re-run optimization to emit complete JSON-LD." });

  // 13 — Internal linking ------------------------------------------------------------------------
  const links = profile.internalLinks;
  const anchors = new Set(links.map((l) => l.label.toLowerCase())).size;
  const hasHub = links.some((l) => l.href.startsWith("/collections/"));
  const hasRelated = links.some((l) => l.href.startsWith("/shop/"));
  const depth = clickDepth(profile.canonicalPath);
  factors.push(
    factor("internal-links", "internal", "Internal linking", 7,
      (links.length >= 5 ? 0.3 : links.length / 5 * 0.3) +
      (hasHub ? 0.25 : 0) + (hasRelated ? 0.2 : 0) +
      (depth <= 2 ? 0.15 : depth === 3 ? 0.08 : 0) +
      (links.length ? Math.min(0.1, (anchors / links.length) * 0.1) : 0),
      `${links.length} internal links (hub ${hasHub ? "yes" : "no"}, related ${hasRelated ? "yes" : "no"}), click depth ${depth}, ${anchors} unique anchors.`,
      !hasHub ? "Link to the parent collection hub to concentrate topical authority." : links.length < 5 ? "Add related-product and utility links (size guide, care, shipping)." : "Vary anchor text to avoid an over-optimized internal profile."),
  );
  if (!hasHub) addIssue({ severity: "warning", field: "internalLinks", message: "No link to a collection hub.", fix: "Add the parent collection link." });

  // 14 — Uniqueness / cannibalization ---------------------------------------------------------------
  const similarity = ctx.maxSimilarity;
  const sharedPrimary = ctx.sharedPrimaryKeywords;
  factors.push(
    factor("uniqueness", "internal", "Uniqueness & cannibalization", 5,
      (similarity < 0.5 ? 0.6 : similarity < 0.62 ? 0.4 : similarity < 0.75 ? 0.2 : 0.05) + (sharedPrimary.length ? 0 : 0.4),
      `Closest listing similarity ${round(similarity * 100, 1)}%${sharedPrimary.length ? `, ${sharedPrimary.length} listing(s) share a primary keyword` : ", no shared primary keywords"}.`,
      similarity >= 0.62 ? "Differentiate the copy and re-target a distinct long-tail cluster to avoid competing with your own page." : "Healthy separation from the rest of the catalogue."),
  );
  for (const shared of sharedPrimary) {
    addIssue({ severity: "warning", field: "keywords", message: `Shares primary keyword(s) “${shared.terms.join(", ")}” with /shop/${shared.slug}.`, fix: "Re-target one of the listings to a different long-tail cluster." });
  }

  // 15 — Localization --------------------------------------------------------------------------------
  const hreflang = profile.hreflang;
  const hasDefault = hreflang.some((h) => h.locale === "x-default");
  const localizations = profile.localizations;
  const localizedComplete = localizations.filter((l) => l.seoTitle && l.metaDescription && l.keywords.length).length;
  factors.push(
    factor("localization", "technical", "International targeting", 4,
      (hreflang.length >= 3 ? 0.35 : hreflang.length / 3 * 0.35) + (hasDefault ? 0.2 : 0) +
      (localizations.length ? (localizedComplete / localizations.length) * 0.45 : 0),
      `${hreflang.length} hreflang alternates (x-default ${hasDefault ? "yes" : "no"}), ${localizedComplete}/${localizations.length} localized variants complete.`,
      !hasDefault ? "Add an x-default alternate so unmatched locales fall back correctly." : "Complete localized titles, descriptions and keywords for the top markets."),
  );

  // 16 — Market & season alignment ---------------------------------------------------------------------
  const markets = profile.targetMarkets;
  const seasonalNow = new Date().getMonth();
  const aligned = profile.keywords.filter((k) => k.seasonality?.[seasonalNow]?.index >= 120).length;
  factors.push(
    factor("market-season", "external", "Market & season alignment", 3,
      (markets.length >= 3 ? 0.5 : markets.length / 3 * 0.5) + Math.min(0.5, aligned / 5 * 0.5),
      `${markets.length} target markets, ${aligned} keyword(s) peaking in the current month.`,
      "Add seasonal keyword variants for markets currently in peak demand."),
  );

  // 17 — Page experience ---------------------------------------------------------------------------------
  const heavyImages = images.filter((i) => /\.png$/i.test(i.src)).length;
  const cta = !!profile.body.cta && profile.body.cta.length > 20;
  factors.push(
    factor("page-experience", "experience", "Page experience", 3,
      (heavyImages === 0 ? 0.4 : 0.2) + (dimensions === images.length && images.length > 0 ? 0.3 : 0.1) + (cta ? 0.3 : 0),
      `${images.length - heavyImages}/${images.length} modern-format images, dimensions ${dimensions === images.length ? "complete" : "incomplete"}, CTA ${cta ? "present" : "missing"}.`,
      heavyImages ? "Serve AVIF/WebP instead of PNG to protect LCP." : "Ensure every image declares dimensions and keep a visible CTA above the fold."),
  );

  // 18 — Trust / E-E-A-T -----------------------------------------------------------------------------------
  const trustChecks = [
    product.rating > 0 && product.reviewCount > 0,
    !!product.material,
    !!product.careInstructions,
    !!product.countryOfOrigin,
    (product.reviews?.length ?? 0) > 0,
    profile.bullets.length >= 4,
  ];
  const trustHits = trustChecks.filter(Boolean).length;
  const band = priceBandFor(product);
  factors.push(
    factor("trust", "trust", "E-E-A-T & merchant trust", 3, trustHits / trustChecks.length,
      `${trustHits}/${trustChecks.length} trust signals present. Price band: ${band.band} (competitiveness ${band.competitiveness}/100).`,
      "Add reviews, fabric composition, care instructions and country of origin — these are explicit product-review system signals."),
  );
  if (!product.rating || !product.reviewCount) addIssue({ severity: "warning", field: "reviews", message: "No reviews — AggregateRating markup cannot be emitted.", fix: "Collect reviews or remove rating markup to avoid a manual action." });

  // 19 — Keyword quality --------------------------------------------------------------------------------
  const tokenCount = primaryTerm ? contentWords(primaryTerm).length : 9;
  const plausibilityScore = primaryTerm ? plausibility(primaryTerm) : 0;
  const transactionalInTop5 = profile.keywords.slice(0, 5).some((k) => k.intent === "transactional");
  const implausibleVolume = (primary?.volume ?? 0) > 1_400_000;
  factors.push(
    factor("keyword-quality", "semantic", "Keyword target quality", 6,
      plausibilityScore * 0.4 +
      (tokenCount <= 4 ? 0.2 : 0.05) +
      ((primary?.relevance ?? 0) >= 0.35 ? 0.2 : (primary?.relevance ?? 0) * 0.4) +
      (transactionalInTop5 ? 0.1 : 0) +
      (implausibleVolume ? 0 : 0.1),
      `Primary target “${primaryTerm || "none"}” — plausibility ${round(plausibilityScore * 100)}%, ${tokenCount} tokens, relevance ${primary?.relevance ?? 0}, ${transactionalInTop5 ? "transactional intent in top 5" : "no transactional intent in top 5"}.`,
      plausibilityScore < 0.85 || tokenCount > 4
        ? "Re-target a shorter, more plausible query — combinatorial long-tails do not earn clicks and dilute the title."
        : !transactionalInTop5
          ? "Promote a purchase-intent variant into the top five targets."
          : "Healthy target set."),
  );
  if (plausibilityScore < 0.7) {
    addIssue({ severity: "warning", field: "keywords", message: `Primary keyword “${primaryTerm}” scores ${round(plausibilityScore * 100)}% on the human-plausibility model.`, fix: "Re-run optimization with plausibility guardrails enabled." });
  }

  // 20 — CTR evidence ---------------------------------------------------------------------------------
  const impressions = product.metrics?.impressions ?? 0;
  const clicks = product.metrics?.clicks ?? 0;
  const observedCtr = impressions ? clicks / impressions : 0;
  const ctrBenchmark = 0.028;
  factors.push(
    factor("ctr-evidence", "external", "Observed CTR vs benchmark", 3,
      impressions < 25 ? 0.5 : Math.min(1, observedCtr / ctrBenchmark),
      impressions < 25
        ? `Only ${impressions} impressions recorded — not enough data to judge the title yet.`
        : `Observed CTR ${round(observedCtr * 100, 2)}% against a ${round(ctrBenchmark * 100, 1)}% benchmark for this position band.`,
      impressions >= 25 && observedCtr < ctrBenchmark
        ? "Rewrite the title with a numeric differentiator (GSM, colourway count, price band) and add a trust hook to the meta description."
        : "Titles are earning their impressions."),
  );
  if (impressions >= 25 && observedCtr < ctrBenchmark * 0.7) {
    addIssue({ severity: "warning", field: "seoTitle", message: `CTR ${round(observedCtr * 100, 2)}% is well below the ${round(ctrBenchmark * 100, 1)}% benchmark despite ${impressions} impressions.`, fix: "A/B a new title with a concrete differentiator." });
  }

  // 19 — Freshness --------------------------------------------------------------------------------------------
  const daysSince = Math.floor((Date.now() - new Date(product.updatedAt).getTime()) / 86_400_000);
  factors.push(
    factor("freshness", "external", "Freshness", 2, daysSince <= 30 ? 1 : daysSince <= 90 ? 0.7 : daysSince <= 180 ? 0.4 : 0.15,
      `Last updated ${daysSince} day(s) ago.`,
      "Re-run optimization or refresh seasonal copy; dateModified feeds the sitemap and JSON-LD."),
  );

  const weightTotal = factors.reduce((s, f) => s + f.weight, 0);
  const rawTotal = factors.reduce((s, f) => s + f.score, 0);
  const total = Math.round((rawTotal / weightTotal) * 1000) / 10;
  const grade = total >= 92 ? "A+" : total >= 85 ? "A" : total >= 75 ? "B" : total >= 62 ? "C" : total >= 45 ? "D" : "F";

  return { total, grade, factors, evaluatedAt: new Date().toISOString() };
}

/** Probes used to detect entity-group coverage in generated copy. */
const ENTITY_PROBES: Record<string, string[]> = {
  construction: ["stitch", "ribbed", "kangaroo pocket", "drawstring", "hood", "seam", "cuff", "hem"],
  fabric: ["gsm", "cotton", "fleece", "terry", "brushed", "breathable", "fabric", "yarn"],
  fit: ["fit", "size", "true to size", "drop shoulder", "chest", "length", "relaxed", "oversized"],
  care: ["wash", "dry", "shrink", "care", "iron", "bleach"],
  trust: ["return", "warranty", "shipping", "delivery", "secure", "guarantee"],
  sustainability: ["organic", "recycled", "certified", "sustainab", "dye", "packaging"],
  commerce: ["in stock", "price", "bundle", "add to", "checkout", "limited", "restock", "bestseller"],
};

export function scoreFromFactors(factors: ScoreFactor[]): SeoScore {
  const weightTotal = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const rawTotal = factors.reduce((s, f) => s + f.score, 0);
  const total = Math.round((rawTotal / weightTotal) * 1000) / 10;
  const grade = total >= 92 ? "A+" : total >= 85 ? "A" : total >= 75 ? "B" : total >= 62 ? "C" : total >= 45 ? "D" : "F";
  return { total, grade, factors, evaluatedAt: new Date().toISOString() };
}

/** Quick content-hash for duplicate detection. */
export function contentFingerprint(profile: SeoProfile): string {
  const tokens = contentWords(bodyText(profile)).map(stem).sort();
  const signature = tokens.slice(0, 120).join("|");
  return hashString(signature).toString(36);
}

export function issueSummary(issues: SeoIssue[]) {
  return {
    critical: issues.filter((i) => i.severity === "critical").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    notice: issues.filter((i) => i.severity === "notice").length,
    autoFixed: issues.filter((i) => i.autoFixed).length,
  };
}

export { sentences, tokenize };

import type { Product, SeoProfile } from "@/lib/types";

/**
 * Optional cloud-LLM refinement stage.
 *
 * The platform is fully functional without any API key: the deterministic NLP
 * engine (lexicon + TF-IDF + scoring) generates and validates every listing.
 * When `SEO_AI_PROVIDER` + `SEO_AI_API_KEY` are configured, this adapter asks a
 * frontier model to *polish* the locally-generated copy and propose extra query
 * ideas, which are then re-scored by our own models so the numbers stay
 * consistent, auditable and reproducible.
 *
 * Any failure — no key, timeout, rate limit, malformed JSON — degrades silently
 * to the local engine. Optimization never blocks a product upload.
 */

export type AiProviderName = "openai" | "anthropic" | "openrouter" | "custom" | "none";

export type AiConfig = {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  enabled: boolean;
};

export function getAiConfig(): AiConfig {
  const provider = (process.env.SEO_AI_PROVIDER ?? "").trim().toLowerCase() as AiProviderName;
  const apiKey = (process.env.SEO_AI_API_KEY ?? "").trim();
  const known: AiProviderName[] = ["openai", "anthropic", "openrouter", "custom"];
  const resolved: AiProviderName = known.includes(provider) ? provider : "none";

  const defaults: Record<AiProviderName, { baseUrl: string; model: string }> = {
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest" },
    openrouter: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
    custom: { baseUrl: process.env.SEO_AI_BASE_URL ?? "", model: process.env.SEO_AI_MODEL ?? "local-model" },
    none: { baseUrl: "", model: "" },
  };

  return {
    provider: resolved,
    model: process.env.SEO_AI_MODEL || defaults[resolved].model,
    apiKey,
    baseUrl: process.env.SEO_AI_BASE_URL || defaults[resolved].baseUrl,
    timeoutMs: Number(process.env.SEO_AI_TIMEOUT_MS ?? 8000),
    enabled: resolved !== "none" && Boolean(apiKey) && Boolean(process.env.SEO_AI_BASE_URL || defaults[resolved].baseUrl),
  };
}

export function aiStatus() {
  const config = getAiConfig();
  return {
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    engine: config.enabled ? "hybrid (local NLP + cloud LLM)" : "local deterministic NLP",
    note: config.enabled
      ? "Cloud refinement active. Local models still validate and score every output."
      : "No AI provider configured — set SEO_AI_PROVIDER and SEO_AI_API_KEY to enable hybrid refinement. All features work without it.",
  };
}

export type LlmCopyRefinement = {
  seoTitle?: string;
  metaDescription?: string;
  h1?: string;
  intro?: string;
  cta?: string;
  bullets?: string[];
  sections?: { heading: string; body: string; bullets?: string[] }[];
  faq?: { q: string; a: string }[];
  extraKeywords?: string[];
  imageAlt?: { src: string; alt: string }[];
};

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callLlm(config: AiConfig, system: string, user: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    if (config.provider === "anthropic") {
      const res = await fetch(`${config.baseUrl}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1800,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return data.content?.map((c) => c.text ?? "").join("\n") ?? null;
    }

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.warn("[seo:ai] provider call failed, falling back to local engine:", (error as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `You are a senior e-commerce SEO copywriter for a global apparel brand specialising in hoodies.
You write original, factual, conversion-focused copy that satisfies Google's Helpful Content and Product Review systems.
Rules:
- Never invent fabric weights, certifications, prices or claims that are not in the input data.
- British/American spelling must match the requested locale.
- Title 45-62 characters, meta description 140-160 characters, H1 under 70 characters.
- Body must be scannable: short paragraphs (max 3 sentences), concrete specifics, no fluff, no keyword stuffing.
- Answer the shopper's real questions: fit, weight/warmth, fabric feel, care, styling, sizing.
Return ONLY valid JSON matching the requested schema.`;

export type RefinementInput = {
  product: Product;
  draft: SeoProfile;
  locale?: string;
  marketName?: string;
};

/** Ask the configured model to polish the locally generated listing. */
export async function refineListingCopy(input: RefinementInput): Promise<LlmCopyRefinement | null> {
  const config = getAiConfig();
  if (!config.enabled) return null;

  const { product, draft } = input;
  const schema = {
    seoTitle: `string, 45-62 chars, contains "${draft.keywords[0]?.term ?? "hoodie"}"`,
    metaDescription: "string, 140-160 chars, one clear CTA",
    h1: "string, under 70 chars",
    intro: "string, 45-70 words, keyword in the first sentence",
    bullets: "array of 5-7 strings, benefit-led, max 12 words each",
    sections: "array of 4-6 objects {heading, body, bullets?} covering fabric, fit & sizing, styling, care, who it is for",
    faq: "array of 4-6 objects {q, a}, answers under 60 words",
    cta: "string, single sentence purchase prompt",
    extraKeywords: "array of up to 15 additional search queries real shoppers would use, including 3 non-English variants where relevant",
  };

  const user = JSON.stringify(
    {
      locale: input.locale ?? "en-US",
      market: input.marketName ?? "global",
      product: {
        title: product.title,
        brand: product.brand,
        category: product.category,
        collections: product.collections,
        gender: product.gender,
        price: product.price,
        currency: product.currency,
        material: product.material,
        weightGsm: product.weightGsm,
        fit: product.fit,
        colors: product.colors,
        sizes: product.sizes,
        features: product.features,
        careInstructions: product.careInstructions,
        countryOfOrigin: product.countryOfOrigin,
        rating: product.rating,
        reviewCount: product.reviewCount,
        merchantDescription: product.description,
      },
      currentDraft: {
        seoTitle: draft.seoTitle,
        metaDescription: draft.metaDescription,
        primaryKeyword: draft.keywords[0]?.term,
        secondaryKeywords: draft.keywords.slice(1, 12).map((k) => k.term),
        semanticTerms: draft.semanticTerms.slice(0, 20),
        targetMarkets: draft.targetMarkets,
      },
      requiredSchema: schema,
    },
    null,
    2,
  );

  const raw = await callLlm(config, SYSTEM_PROMPT, `${user}\n\nReturn JSON only.`);
  if (!raw) return null;
  const parsed = extractJson(raw) as LlmCopyRefinement | null;
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
}

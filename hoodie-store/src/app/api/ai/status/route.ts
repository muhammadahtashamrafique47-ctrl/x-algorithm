import { NextResponse } from "next/server";
import { aiStatus } from "@/lib/seo/ai/provider";
import { ALGORITHM_FACTORS } from "@/lib/seo/external";
import { MIN_CONTENT_WORDS } from "@/lib/seo/scoring";
import { MARKETS, SERVED_LOCALES } from "@/lib/i18n/markets";
import { MODIFIERS, QUESTION_TEMPLATES, SEMANTIC_TERMS } from "@/lib/seo/lexicon";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/status — describes the engine that is actually running: provider
 * configuration, the ranking-system weights, the lexicon size and the market
 * coverage. Used by the admin dashboard "AI engine" panel.
 */
export async function GET() {
  return NextResponse.json({
    ...aiStatus(),
    pipeline: [
      "1. Attribute extraction from the merchant upload",
      "2. Keyword research: lexicon expansion × first-party search × conversion log × market/season models",
      "3. Candidate generation for title, meta description and H1, ranked by a SERP-level scoring function",
      "4. Unique body copy: fabric, fit, construction, styling, care, trust sections + FAQ + bullets",
      "5. Alt text per image role, internal link suggestions, hreflang and localized variants",
      "6. 19-factor scoring against Google's documented ranking systems",
      "7. Auto-fix loop: every diagnosed issue is corrected and re-scored until the listing converges",
      "8. Optional cloud LLM refinement — accepted only when it scores higher than the local result",
    ],
    scoring: {
      factors: ALGORITHM_FACTORS,
      minContentWords: MIN_CONTENT_WORDS,
    },
    lexicon: {
      modifierDimensions: Object.keys(MODIFIERS).length,
      modifiers: Object.values(MODIFIERS).reduce((sum, list) => sum + list.length, 0),
      questionTemplates: QUESTION_TEMPLATES.length,
      semanticTerms: Object.values(SEMANTIC_TERMS).reduce((sum, list) => sum + list.length, 0),
    },
    markets: MARKETS.map((market) => ({
      country: market.country,
      name: market.name,
      locale: market.locale,
      demandIndex: market.demandIndex,
      ecommerceIndex: market.ecommerceIndex,
      priceSensitivity: market.priceSensitivity,
      nativeTerms: market.lexicon.hoodie,
      shoppingEvents: market.shoppingEvents.map((e) => e.name),
    })),
    servedLocales: SERVED_LOCALES,
  });
}

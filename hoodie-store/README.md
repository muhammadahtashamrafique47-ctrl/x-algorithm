# Northloop Supply Co. — hoodie commerce platform with an on-device AI SEO engine

A production-shaped Next.js storefront for selling hoodies, plus a merchant
console that turns a bare product upload into a fully optimized, internationally
targeted, schema-complete landing page — automatically.

The SEO engine is **deterministic and runs on-device**: keyword research, copy
generation, scoring and auto-repair all execute in-process with no third-party
API, no key and no network. An optional cloud-LLM refinement stage can be
enabled with environment variables; it is only accepted when it beats the local
result on the same rubric.

```
Storefront  /  /shop  /shop/[slug]  /collections/[slug]  /search  /blog  /cart  /checkout
Admin       /admin  /admin/products  /admin/products/[id]  /admin/keywords  /admin/seo
API         /api/products  /api/products/[id]/optimize  /api/products/import  /api/upload
            /api/keywords  /api/keywords/suggest  /api/keywords/gaps
            /api/seo/audit  /api/seo/score  /api/analytics  /api/track  /api/checkout
Crawlers    /sitemap.xml  /robots.txt  /feeds/products.xml  /manifest.webmanifest
```

---

## 1. Quick start

```bash
cd hoodie-store
npm install
cp .env.example .env.local      # optional — every value has a working default
npm run dev                     # http://localhost:3000
```

Production:

```bash
npm run build
npm start                       # binds dual-stack [::]:3000
```

`npm start` runs `scripts/serve.mjs`, which binds the IPv6 wildcard `::`. With
the Linux default `net.ipv6.bindv6only=0` that single socket is **dual-stack**,
so it answers `::1`, `127.0.0.1` and the container's routable addresses alike.
This matters more than it sounds: on images where `localhost` resolves to `::1`
first, a server bound only to `0.0.0.0` refuses the proxy's connection and the
preview reports **502 Bad Gateway** while `curl 127.0.0.1:3000` happily returns
200. If IPv6 is unavailable the launcher falls back to `0.0.0.0`; `npm run
start:ipv4` forces IPv4 explicitly.

Other commands: `npm run typecheck` (tsc), `npm run lint`.

On the first request the seed catalogue (12 products, 10 collections, 5 guides)
is pushed through **the same pipeline a merchant upload uses** — normalize →
keyword research → copy generation → scoring → auto-fix — and written to
`src/data/runtime/`. That directory is git-ignored; delete it to reseed from
scratch, or use **Admin → Reset demo data**.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin used when seeding/optimizing listings (stored in hreflang + localizations). **Inlined at build time** — set it before `npm run build`. Falls back to `https://northloop.example`, never `localhost` |
| `FRAME_ANCESTORS` | Overrides the auto-detected `Content-Security-Policy: frame-ancestors` value; `off` omits the header. Default is host-aware (see below) |
| `ALLOW_HTTP_ORIGIN` | `1` to honour an `x-forwarded-proto: http` hop on a public hostname (default: public hosts are always https) |
| `CORS_ORIGINS` | Cross-origin callers allowed to fetch the API: `*`, or a comma-separated origin list (`*.example.com` wildcards ok). Unset = sandbox/loopback hosts only |
| `NEXT_PUBLIC_BRAND_NAME` / `NEXT_PUBLIC_BRAND_SHORT` | Brand in copy; short form used in title tags |
| `NEXT_PUBLIC_MARKET_LOCALES` | Locales you actually serve → drives hreflang alternates |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Contact + Organization schema |
| `SEO_AI_PROVIDER` | `openai` \| `anthropic` \| `openrouter` \| `custom` (blank = local engine only) |
| `SEO_AI_API_KEY`, `SEO_AI_MODEL`, `SEO_AI_BASE_URL`, `SEO_AI_TIMEOUT_MS` | Cloud refinement stage |
| `SEO_MIN_CONTENT_WORDS` | Minimum body depth the rubric accepts (default 320) |
| `SEO_AUTO_OPTIMIZE_ON_CREATE` | Optimize on upload without asking (default true) |

### Origins & embedding

Every absolute URL the site emits — canonical, hreflang cluster, `og:url`,
`og:image`, `twitter:image`, JSON-LD `@id`/`url`/`image`, `sitemap.xml`,
`robots.txt` (`Host:` + `Sitemap:`), the product feed and the web app manifest —
is resolved per request by `src/lib/request-origin.ts`:

1. the configured `NEXT_PUBLIC_SITE_URL` wins when it already points at the host
   this request arrived on (it carries the scheme the operator intended);
2. otherwise the `x-forwarded-host`/`host` header is used, over **https** for
   public hostnames (a bare `x-forwarded-proto: http` is normally just the local
   proxy hop);
3. loopback hosts and a missing request scope fall back to `SITE_URL`.

Two consequences worth knowing:

- **`localhost` never appears in output.** An absolute `http://localhost:3000`
  in a canonical or OG image resolves against whoever is *viewing* the page, so
  it silently breaks previews, tunnels and social cards. The old default did
  exactly that; the fallback is now a real hostname.
- **Stored hreflang URLs are rebased at render time.** SEO profiles persist
  absolute alternates, so if the host changes after a listing was optimized,
  `rebase()` rewrites them onto the live origin instead of leaking a dead host.

`scripts/preview-env.mjs` (wired as `predev`/`prebuild`) writes the sandbox
preview origin into `.env.local` when `E2B_SANDBOX_ID` is set, because
`NEXT_PUBLIC_*` values are frozen at build time and the preview host changes
whenever the sandbox is recycled. It is a no-op elsewhere and never overwrites a
configured real domain.

**Framing is decided per request** (`src/proxy.ts`), because a static header
cannot know who is allowed to embed the site: a preview, tunnel or staging
wrapper frames the app from a *different* origin than the one it is served on,
and the browser then paints a blank frame even though every route returns 200.

| Host the request arrived on | `Content-Security-Policy` |
| --- | --- |
| sandbox host (`*.e2b.app`) or loopback | `frame-ancestors *` — embedding is the point |
| any other (real) domain | `frame-ancestors 'self'` — clickjacking-safe |
| `FRAME_ANCESTORS` set | that value verbatim; `off` omits the header |

`X-Frame-Options` is never sent: it cannot allowlist other origins, which is what
made the site unrenderable in the preview. Only `frame-ancestors` is sent — a full
CSP with `script-src` would break Next.js inline hydration scripts.

The same proxy answers `OPTIONS` with `204`. App Router *pages* otherwise reply to
a probe with a bare `400`, which reads as a broken deployment to any harness that
checks the app before framing it. `/favicon.ico` is rewritten to the shipped SVG
mark so browsers stop logging a 404 on every page load.

**Cross-origin fetches are handled the same way.** A preview harness that reaches
the sandbox through a gateway with an access token (E2B's
`e2b-traffic-access-token`, for instance) cannot attach that header to an iframe
navigation, so it fetches instead — and a cross-origin fetch with a custom header
triggers a preflight. A `204` with no CORS headers fails that preflight and shows
up as a blank preview, so on sandbox/loopback hosts (or for any origin named in
`CORS_ORIGINS`) the proxy reflects `Access-Control-Allow-Origin`, allows the
requested headers verbatim and advertises the usual methods.
`Access-Control-Allow-Credentials` is never sent: this exposes public catalogue
data, never a session. On a real domain the default stays closed — no CORS
headers at all unless `CORS_ORIGINS` opts a caller in.


---

## 2. What the AI actually does

`POST /api/products` with nothing but a title, price, fabric and a few features
returns a listing that scores 85–96/100 on the rubric below. A raw upload of the
same data typically scores **25–33 (grade F)**. The pipeline:

1. **Attribute extraction** — fabric, weight class, silhouette, style, audience,
   use, season, colourways and price band are mined from the merchant's own
   fields (`lib/seo/keywords.ts → extractAttributes`).
2. **Attribute salience** — each extracted phrase is weighted by *where* it came
   from: the product name (1.0) beats fabric (0.8) beats a single colourway
   (0.44). This is what stops a kids' hoodie from targeting "navy hoodie".
3. **Keyword research** — a curated head-term/modifier lexicon is crossed with
   the product's attributes, the 20-market demand model, the retail calendar,
   on-site search history and the attributed-conversion log. Combinations are
   restricted to a whitelist of modifier pairs people actually type, so the
   engine never proposes "hiking pine hoodie".
4. **Plausibility + page-fit gating** — every candidate is damped by a
   human-plausibility model (token count, product-noun position, modifier count)
   and by whether it carries a concrete product modifier at all.
5. **Primary target selection** — highest priority among *defining* terms
   (salience ≥ 0.9), with a hard cannibalization guard: a query already owned as
   another listing's primary is excluded. Ties inside a 4-point noise band are
   broken by modelled volume.
6. **Copy generation** — title, meta description, H1, URL, breadcrumbs,
   structured body (intro + fabric/fit/construction/styling/care/trust sections),
   bullets, FAQ, CTA, per-image alt text by image role, internal-link
   suggestions, hreflang alternates and per-market localizations (native
   product noun, localized price, market notes).
7. **Scoring** — 21 weighted on-page factors (§4), including first-party
   evidence (observed CTR, review depth, inventory coverage).
8. **Auto-fix loop** — every diagnosed issue has a repair; the listing is
   rewritten and re-scored until it converges (default 3 passes, hill-climbing
   keeps the best-scoring profile).
9. **Optional cloud refinement** — if `SEO_AI_PROVIDER` is set, an LLM may
   rewrite copy; the result is scored and **accepted only if it beats the local
   output**, otherwise it is discarded and logged as rejected.

Results are persisted on `Product.seo`, so rendering a page never recomputes
anything: the storefront just reads what the engine wrote.

### The keyword numbers, honestly

Volume, difficulty, CPC, trend and seasonality are **modelled**, not scraped —
there is no keyword API in the loop:

```
volume     = headTerm.volume × Π modifierFactor(weight) × 0.55^(mods−1)
             × 0.03^unknownTokens × marketFactor × intentPull × firstPartyBoost
modifierFactor(w) = (0.03 + w/900) × (w/100)^1.6
difficulty = headCompetition×0.72 + avgModifierCompetition×0.28 − 5.5/extraToken
             + intentPremium − informationalDiscount ± marketEcommerceAdj
cpc        = (0.18 + (difficulty/100)^1.6 × 2.4) × intentMultiplier × basket/55
priority   = 34·log(volume) + 18·(100−KD)/100 + 12·intent + 26·relevance + 10·trend
             × onsiteSearchSignal × cannibalizationPenalty × plausibility × pageFit
```

Curated head terms (e.g. `oversized hoodie` at 301,000/mo) are treated as
ground truth and bypass the model. Treat the output as a **relative** ranking
signal — which is exactly how the optimizer uses it — not as a replacement for
Search Console or a paid keyword tool. Connect those in production and feed the
numbers into `estimateVolume`'s `firstPartyBoost`.

---

## 3. Ranking-system model (`lib/seo/external.ts`)

Ten systems, weights summing to 100, used for site-wide health reporting:

| Weight | System | Google mechanism |
| --- | --- | --- |
| 18 | Query & term relevance | Core ranking / BERT-style query understanding |
| 16 | Content quality & depth | Helpful Content System |
| 14 | E-E-A-T & product knowledge | Quality Rater Guidelines / Product Reviews System |
| 12 | Structured data eligibility | Rich results / merchant listings |
| 10 | Internal link equity & topology | Crawl & link analysis |
| 9 | Page experience / Core Web Vitals | Page Experience |
| 8 | Uniqueness / cannibalization control | Duplicate content handling |
| 5 | Freshness | Query-deserves-freshness |
| 5 | Localization & hreflang | International targeting |
| 3 | Engagement & conversion signals | Post-click quality |

Organic CTR curve used for every forecast: position 1 → 27.6%, 2 → 15.8%,
3 → 11.0%, 5 → 6.3%, 10 → 2.4%.

---

## 4. On-page rubric (21 factors, `lib/seo/scoring.ts`)

| W | Factor | W | Factor |
| --- | --- | --- | --- |
| 10 | Content depth | 7 | Images & CLS safety |
| 9 | Title tag | 7 | Internal linking |
| 9 | Keyword targeting | 6 | Keyword target quality |
| 9 | Structured data | 5 | Heading hierarchy |
| 8 | Semantic/entity coverage | 5 | Uniqueness & cannibalization |
| 7 | Meta description | 4 | URL structure · H1 · density · readability · localization |
| 3 | Market/season · page experience · trust · CTR evidence | 2 | Freshness |

Grades: A+ ≥ 92, A ≥ 85, B ≥ 75, C ≥ 62, D ≥ 45, F below. Every factor returns a
`detail` string (what was measured) and a `fix` string (what to do about it);
`audit.ts` maps each factor to one of the ten systems above.

---

## 5. International SEO

- 20 market profiles (`lib/i18n/markets.ts`): locale, currency, price
  sensitivity, e-commerce maturity, demand index, cold-month calendar, shopping
  events and a **native lexicon** (`hoodie` → `Hoodie`, `sweat`, `フーディー`,
  `هودي`, `moletom`, `sudadera`…).
- Per listing: up to 6 target markets ranked for the current month, a localized
  title/meta/H1 per market with localized price, `hreflang` alternates
  (including `x-default`), and market notes explaining the choice.
- `rankMarketsFor(month, {premium, value, lightweight})` shifts recommendations
  by season and hemisphere, so a 500 GSM sherpa hoodie is pushed to Canada and
  Germany in November while a 280 GSM zip hoodie is pushed to Australia.

## 6. Structured data & crawlers

Emitted per page from `lib/seo/schema.ts`: `Organization`, `WebSite` +
`SearchAction`, `Product` (offers, aggregateRating, review), `BreadcrumbList`,
`ItemList`, `FAQPage`, `Article`, `AboutPage`, `ContactPage`. Images always have
intrinsic width/height so `next/image` reserves space (CLS 0).

`robots.txt` disallows `/admin`, `/api/`, `/cart`, `/checkout` and `/search?`,
points at the sitemap, and **explicitly allows** GPTBot, ClaudeBot,
PerplexityBot and Google-Extended for AI-search visibility. `/feeds/products.xml`
is a Google Merchant Center-compatible RSS/Atom product feed.

---

## 7. Admin console

| Page | What you can do |
| --- | --- |
| `/admin` | Site health dial, ranking-system factor bars, demand-vs-clicks chart, rank tracker, keyword→revenue attribution, market performance, content gaps, priority actions, grade distribution. Buttons: re-optimize the whole catalogue, optimize drafts only, reset demo data. |
| `/admin/products` | **Single upload** (form + drag-and-drop image upload with per-image alt), **bulk CSV/JSON import** (Shopify/WooCommerce column aliases recognized), **paste rows**, live keyword typeahead while typing, results table sorted worst-score-first with per-row re-optimize / publish / delete. |
| `/admin/products/[id]` | SERP preview with live character counts, traffic forecast at positions 1/3/5/10, full keyword map grouped by kind (volume, KD, CPC, priority, relevance, salience, trend, 12-month seasonality sparkline, source), generated copy, factor breakdown, diagnosed issues with auto-fix flags, localizations, market opportunities, internal links, similarity/cannibalization table, image alt audit, tracked rankings, on-site search demand. Two tabs: **AI optimizer** (month, markets, passes, LLM toggle → before/after with a per-factor delta table) and **Merchant data** (price, stock per size, fabric, features, status, optional re-optimization on save). |
| `/admin/keywords` | Interactive research workbench: seed, month, markets, intent, min volume, max difficulty, sort, row limit, optional grounding in a specific listing. Returns quick wins, intent mix, SERP landscape composition, market opportunities, topic clusters, retail calendar, star-shortlist, CSV export, plus content gaps, zero-result searches and the keyword ownership map. |
| `/admin/seo` | Full technical audit: 30+ checks, issues grouped by severity with impact/area/affected URLs and the exact action to take, opportunities ranked by impact vs effort, grade distribution, top keywords by forecast clicks, the CTR curve, and the "how the score is built" table. |

### Image pipeline

`POST /api/upload` (multipart or base64) → `sharp` → auto-rotate, resize to
≤1600×2000 inside, sRGB progressive JPEG q82 → `public/uploads/<slug>-<hash>.jpg`
→ returns `{src, width, height, bytes}` so the storefront can reserve space.

---

## 8. API reference

| Method & path | Purpose |
| --- | --- |
| `GET /api/products?q=&collection=&size=&color=&min=&max=&sort=&page=&view=` | Filtered, paginated catalogue (summaries or full SEO profiles) |
| `POST /api/products` | Create a listing. Body = merchant draft + `optimize`, `publish`, `passes`, `month`, `targetMarkets`. Returns before/after score, primary keyword, auto-fixes |
| `GET/PATCH/DELETE /api/products/[id]` | Read, update (id **or** slug), delete. `PATCH` accepts partial drafts; `reoptimize:false` skips the engine |
| `POST /api/products/[id]/optimize` | Re-run the pipeline with `{month, targetMarkets, passes, useLlm, publish, preserveSlug}` → `{before, after, lift, grade, engine, autoFixes, product, audit}` |
| `POST /api/products/optimize-all?onlyDrafts=` | Catalogue-wide run → per-listing before/after, averages, remaining content gaps |
| `GET /api/products/import?template=csv` | Download the import template; plain `GET` lists accepted columns and aliases |
| `POST /api/products/import?optimize=` | Bulk import: multipart `file` (.csv/.json), raw `text/csv`, or JSON `{data:[…]}` / `{products:[…]}`. Up to 500 rows |
| `POST /api/upload` | Image normalization (see §7) |
| `GET/POST /api/keywords?seed=&markets=&month=&intent=&maxDifficulty=&minVolume=&sort=&limit=&productSlug=&format=csv` | Keyword research → `{keywords, clusters, summary}` |
| `GET /api/keywords/suggest?q=&limit=&markets=` | Typeahead: lexicon expansion blended with first-party search history |
| `GET /api/keywords/gaps` | Content gaps, zero-result searches, contested keywords, owned keywords |
| `GET /api/seo/audit` | Site-wide technical audit JSON |
| `GET /api/seo/score?id=&view=full` | Live re-score of one listing + drift vs stored score + SERP landscape + forecast |
| `GET /api/analytics?days=` | Funnel summary, daily series, by market/product/keyword |
| `POST /api/track` | Beacon endpoint for `impression`, `click`, `view`, `add_to_cart`, `purchase`, `search`, `keyword_rank` |
| `GET /api/search?q=&limit=` | Storefront search (products + collections + articles) |
| `POST /api/checkout` | Demo order: validates, decrements stock, writes attributed purchase events, returns an order reference |
| `POST /api/contact` / `POST /api/subscribe` | Form endpoints (303 with a **relative** `Location`, proxy-safe) |
| `POST /api/admin/reseed` | Rebuild the demo catalogue through the full pipeline |
| `GET /api/ai/status` | Engine description, provider config, rubric weights, lexicon size, market coverage |

---

## 9. Analytics, attribution & first-party signals

`ProductCard` reports impressions/clicks with an IntersectionObserver; `BuyBox`
reports views and add-to-cart; `CheckoutForm` reports purchases. The query that
brought the shopper in is captured in `sessionStorage["northloop.lastKeyword"]`
(URL `?q=` wins, then session, then the listing's own primary target) and sent
with every downstream event — so the admin can show **keyword → revenue**.

Those events close the loop:

- `getSearchLog()` (on-site searches) boosts keyword priority ×1.14 and drives
  the content-gap report;
- `getConversionLog()` (attributed add-to-cart/purchase) boosts priority ×1.22;
- observed CTR is scored against a 2.8% benchmark as a rubric factor;
- `/search` is disallowed in robots.txt so crawler noise never pollutes the log.

Events are appended in bulk (`appendEvents` → one atomic write) and capped at
20,000; `recomputeMetrics()` materialises per-product counters.

---

## 10. Datastore

`lib/store/db.ts` is a dependency-free, file-backed JSON store under
`src/data/runtime/` with an in-memory read cache, atomic tmp-file+rename writes,
and `invalidateCache()` for external mutations. Everything (storefront, admin,
API, engine) goes through its functions, so swapping in Postgres/Prisma means
reimplementing ~15 functions and nothing else.

> The whole app is `dynamic = "force-dynamic"` because the catalogue is mutable
> from the admin: crawlers always see the current optimized listing, and
> `dateModified`, the sitemap and JSON-LD can never drift apart.

---

## 11. Project structure

```
src/
  app/
    layout.tsx              root: html/body, metadata, hreflang, Organization+WebSite JSON-LD
    (storefront)/           public pages (own layout: header, cart, footer)
    admin/                  merchant console (own layout: dark sidebar, AI status)
    api/                    24 route handlers
    sitemap.ts robots.ts manifest.ts feeds/products.xml/
  components/               storefront UI + admin/ (Viz, AdminActions, ProductUploader,
                            ProductRowActions, SeoWorkspace, KeywordExplorer)
  lib/
    seo/      text.ts (NLP primitives) lexicon.ts keywords.ts internal.ts external.ts
              scoring.ts optimizer.ts schema.ts audit.ts ai/provider.ts
    commerce/ catalog.ts product-utils.ts (client-safe) analytics.ts csv.ts
    store/    db.ts bootstrap.ts        seed/catalogue.ts
    i18n/markets.ts   api/serialize.ts  types.ts
scripts/      placeholders.mjs (branded JPEG stand-ins), debug-keywords.ts, debug-salience.ts
public/images/{products,detail,site}    public/uploads/
```

`lib/commerce/product-utils.ts` holds the pure helpers (pricing, stock state,
inventory health) precisely because client components must never reach the
datastore — importing `node:fs` into a client graph is a hard Turbopack error.

---

## 12. Production hardening checklist

- [ ] **Answer preflights.** `OPTIONS` returns 204 with CORS headers on
      preview/sandbox hosts (or those named in `CORS_ORIGINS`), including the
      gateway's own token header — a bare 204 fails the preflight and blanks the
      preview. `Access-Control-Allow-Credentials` is deliberately never sent.
- [ ] **Bind both IP stacks.** `npm start` binds `::` (dual-stack). An
      IPv4-only listener silently 502s behind any proxy that resolves
      `localhost` to `::1` first — verify with `curl -6 http://[::1]:3000/`
      *and* `curl -4 http://127.0.0.1:3000/`.

Not implemented here, deliberately, because they need accounts and secrets:

1. **Auth on `/admin`** — currently open. Put it behind your IdP/middleware and
   keep the `robots.txt` disallow.
2. **Payments** — `/api/checkout` validates and records a demo order only.
3. **Transactional email** — `/api/contact` and `/api/subscribe` persist locally;
   wire Resend/Postmark/Klaviyo in their place.
4. **Database** — swap `lib/store/db.ts` for Postgres; keep the same signatures.
5. **Image storage/CDN** — `public/uploads` is local disk; move to S3/R2 and keep
   the `sharp` normalization step in `POST /api/upload`.
6. **Real search data** — ingest the Search Console API and GA4 into
   `estimateVolume`'s `firstPartyBoost` and replace the seeded rank tracker.
7. **Rank tracking** — feed real positions in via `keyword_rank` events.
8. **LLM stage** — set `SEO_AI_PROVIDER`/`SEO_AI_API_KEY`; the local rubric still
   gates every accepted change.
9. **Rate limiting** on `/api/track`, `/api/products*` and `/api/upload`.

## 13. Known limitations

- Search volume/difficulty/CPC are modelled (§2) — relative, not absolute.
- The admin has no authentication, no roles and no audit log.
- Copy is generated from a domain lexicon; it is factual about the attributes you
  supply, but it cannot invent certifications you do not have — it only surfaces
  the ones present in the merchant data.
- Five product/detail photos are branded placeholders (`scripts/placeholders.mjs`
  regenerates them non-destructively; drop real photography into the same paths).
- Checkout takes no payment; inventory decrements are local and not
  transactional across processes.

---

## 14. Verification

```bash
npm run typecheck && npm run build      # both clean, no warnings
curl -s localhost:3000/api/seo/audit | jq '.score, .grade, .counts'
curl -s -X POST localhost:3000/api/products -H 'content-type: application/json' \
  -d '{"title":"Aurora Alpaca Blend Hoodie","price":142,"material":"60% alpaca / 40% organic cotton","weightGsm":420}' \
  | jq '{slug: .product.slug, before: .previousScore, after: .score, grade, primary: .primaryKeyword}'
# → slug "aurora-alpaca-blend-hoodie", ~25 → ~89, primary "alpaca hoodie"
curl -s "localhost:3000/api/keywords?seed=hoodie&limit=5&markets=US,GB,DE" | jq '.summary.totalVolume'
curl -s localhost:3000/api/admin/reseed -X POST | jq '.stats'
```

Smoke-tested routes (all 200 except the intentional 404): `/`, `/shop`,
`/shop/[slug]`, `/collections/[slug]`, `/search`, `/blog`, `/blog/[slug]`,
`/size-guide`, `/fabric-care`, `/shipping-returns`, `/about`, `/contact`,
`/cart`, `/checkout`, `/admin`, `/admin/products`, `/admin/products/[id]`,
`/admin/keywords`, `/admin/seo`, all 24 API routes, `/sitemap.xml`,
`/robots.txt`, `/manifest.webmanifest`, `/feeds/products.xml`.

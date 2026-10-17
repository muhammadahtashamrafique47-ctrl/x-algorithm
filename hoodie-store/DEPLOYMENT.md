# Deploying the hoodie store for free (permanently)

The Arena preview link (`https://3000-<sandbox-id>.e2b.app`) is **not** hosting.
It is a tunnel into an ephemeral sandbox that is destroyed on every recycle,
which is why it keeps returning *502 Bad Gateway* or *Sandbox not found*. This
document gets the same app onto free hosting that does not disappear.

Everything needed is already in the repo — no code changes required. What is
left is a one-time account connection, because a deploy needs credentials that
must never live in the repository.

---

## 1. Recommended: Vercel (free Hobby tier, free `*.vercel.app` domain)

Next.js is built by Vercel; this app deploys with zero configuration and the
free tier does not expire, needs no credit card, and includes HTTPS, a global
CDN and automatic preview deployments per pull request.

**One click:** [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmuhammadahtashamrafique47-ctrl%2Fx-algorithm%2Ftree%2Fmain%2Fhoodie-store&project-name=hoodie-store&env=NEXT_PUBLIC_SITE_URL&envDescription=Canonical%20origin%20baked%20in%20at%20build%20time%20%28your%20%2A.vercel.app%20URL%20or%20custom%20domain%29)

That link imports the repo with the root directory pre-set to `hoodie-store` and
asks for the one environment variable. If you would rather click through the
dashboard, it is the same three minutes:

1. Go to <https://vercel.com/signup> → **Continue with GitHub**.
2. <https://vercel.com/new> → import `x-algorithm`.
3. On the configure screen set **Root Directory → `hoodie-store`** (the repo
   also contains unrelated code; this is the one setting people miss).
4. Framework is detected as **Next.js**; leave Build (`npm run build`) and
   Output default.
5. Add one environment variable (Production + Preview):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` (your real domain later) |

   This is inlined at **build time** and seeds the stored hreflang/localization
   URLs. If you skip it, nothing breaks — every canonical, `og:` tag, JSON-LD
   URL, `sitemap.xml` and `robots.txt` is derived from the request host at
   runtime (see `src/lib/request-origin.ts`) — but stored alternates would carry
   the placeholder origin until the next re-optimization.
6. **Deploy.** You get `https://<your-project>.vercel.app`, free, for as long as
   the project exists.

Renaming the project or adding a domain later: **Settings → Domains**.

---

## 2. Free domain, honestly

| Option | Cost | Notes |
| --- | --- | --- |
| Platform subdomain — `*.vercel.app`, `*.netlify.app`, `*.render.com`, `*.pages.dev` | **Free forever** | Instant, HTTPS included, no approval. This is what "free domain" realistically means in 2026 |
| `is-a.dev`, `js.org`, `eu.org`, `thedev.id` | Free | Community-run subdomain programmes; you apply with a pull request or form. Approval takes days–weeks, and `eu.org` is notoriously slow |
| A real TLD (`.com`, `.dev`, `.store`) | ~$10–15/yr | There is no reliable free TLD any more — Freenom (`.tk`, `.ml`, `.ga`) stopped issuing them. Some hosts bundle a free first year with a paid plan |
| GitHub Student Pack / Cloudflare Registrar | Free–at-cost | If you have a `.edu` address, Namecheap/Name.com credits via the Student Pack cover a year; Cloudflare sells domains at wholesale with no markup |

Once you own a domain, add it in the host's dashboard and point a `CNAME` at the
platform (or `A`/`AAAA` at its IPs). Then update `NEXT_PUBLIC_SITE_URL` and
rebuild so stored URLs match.

---

## 3. Other free hosts that work with this repo

| Host | Free tier | Config in repo | Persistence |
| --- | --- | --- | --- |
| **Netlify** | 100 GB bandwidth/mo, SSR via the Next.js runtime | `netlify.toml` (set Base directory `hoodie-store` if you don't use the file) | `/tmp` only |
| **Render** | Free web service, sleeps after 15 min idle (~30 s cold start) | `render.yaml` blueprint → New → Blueprint | Repo dir while running; resets on deploy. Paid instance + disk persists |
| **Fly.io / Railway** | Trial credits, then pay-as-you-go | `Dockerfile` | Attach a volume at `/data` — the image symlinks the catalogue and uploads onto it |
| **Any VPS / your own box** | — | `Dockerfile` | Mount `/data` |
| GitHub Pages, Cloudflare Pages (static) | Free | ✗ | **Not usable** — this app is server-rendered with an API and a mutable catalogue |

Docker, anywhere:

```bash
cd hoodie-store
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com -t hoodie-store .
docker run -p 3000:3000 -v hoodie-data:/data hoodie-store
```

The image is multi-stage, runs as a non-root user, includes a healthcheck, and
binds dual-stack (`::`) so IPv6-only proxies can reach it.

---

## 4. What persists where — read this before you upload products

The catalogue is a file-backed JSON store (`src/lib/store/db.ts`). It writes to
two statically resolvable locations — deliberately not env-derived paths, since
a dynamic path makes Turbopack trace the whole project into the server bundle:

1. `src/data/runtime/` inside the project (writable on Render/Fly/VPS/Docker);
2. `/tmp/hoodie-store-data` (automatic serverless fallback).

On Vercel/Netlify the deployment is **read-only**, so case 3 applies: the store
works, the seed catalogue is served, admin edits and event tracking succeed for
the life of that instance — and are **lost** when it recycles. Writes never
throw: they degrade to memory-only and log one warning, so no route 500s.

Same story for image uploads: `POST /api/upload` probes its directory and, when
it cannot write, returns **503 with an actionable message** instead of failing
mid-request.

To make a deploy durable, either:

- **Mount storage at those paths** — Render/Fly/Railway/VPS: attach the disk or
  volume and symlink `src/data/runtime` and `public/uploads` onto it. The
  Dockerfile already does this with `/data` (`/data/runtime`, `/data/uploads`),
  so `docker run -v hoodie-data:/data` is all it takes.
- **Use external media** — S3/R2, Cloudinary or UploadThing: upload there and
  set `UPLOAD_URL_PREFIX` to its public path.
- **Swap in a database** — every consumer goes through `db.ts`'s ~20 functions
  (`getAllProducts`, `upsertProduct`, `deleteProduct`, `getCollections`,
  `recordEvent`, …). Reimplement that one module against Postgres/Prisma, Neon,
  Supabase or Upstash and the storefront, admin and SEO engine are untouched.
  Free tiers: Neon (3 GB), Supabase (500 MB), Upstash Redis (10k commands/day),
  Turso (9 GB).

For a public launch you will want the database route — a store that forgets its
own uploads is a demo, not a shop.

---

## 5. Environment variables per host

| Variable | Why it matters when deployed |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Origin baked in at build time; used for stored hreflang/localization URLs and as the fallback origin |
| `UPLOAD_URL_PREFIX` | Public path uploaded media is served from — set this when media lives in external storage. The write directory is `public/uploads`; mount or symlink it for persistence |
| `FRAME_ANCESTORS` | Embedding policy. Defaults are host-aware: sandbox/loopback hosts get `frame-ancestors *`, real domains get `'self'`. Set it explicitly to be sure, e.g. `'self' https://www.yourdomain.com`; `off` omits the header |
| `CORS_ORIGINS` | Cross-origin API callers. Closed on real domains unless set (`*` or a comma-separated list, `*.example.com` wildcards allowed). Credentials are never allowed |
| `ALLOW_HTTP_ORIGIN` | Leave unset. Only for a genuinely plain-http public host |
| `SEO_AI_PROVIDER` / `SEO_AI_API_KEY` / `SEO_AI_MODEL` | Optional cloud refinement stage; the local NLP engine runs the whole pipeline without it |

---

## 6. After it is live — the SEO checklist

1. `view-source:https://<your-domain>/` — canonical, `og:url`, `og:image` and
   the JSON-LD must all show your domain over **https** and never `localhost`.
2. `https://<your-domain>/robots.txt` — `Host:` and both `Sitemap:` lines.
3. Submit `sitemap.xml` and `feeds/products.xml` in **Google Search Console**
   (verify by DNS record, HTML file or GA4) and in **Bing Webmaster Tools**
   (imports from Search Console in one click). Also ping
   `https://www.google.com/ping?sitemap=<your-sitemap-url>`.
4. Test one product URL in the **Rich Results Test** — `Product`, `Offer`,
   `AggregateRating`, `BreadcrumbList`, `FAQPage` and `ItemList` are emitted;
   check for warnings, not just errors.
5. Run **PageSpeed Insights** on `/` and one PDP; fix whatever it flags on real
   hardware rather than guessing.
6. `/admin` has **no authentication**. Before anyone else knows the URL, either
   turn on Vercel Deployment Protection / Netlify password protection, put it
   behind your host's basic auth, or add an auth gate in `src/app/admin/layout.tsx`.
   On a free tier that is a few lines; leaving it open publishes your cost
   margins and lets strangers delete products.

---

## 7. Optional: deploy from CI instead of the dashboard

`.github/workflows/hoodie-store.yml` runs typecheck + build on every push and PR
that touches `hoodie-store/`. It also contains a Vercel deploy job that stays
dormant until you add:

- repository **variable** `VERCEL_DEPLOY_ENABLED` = `true`
- repository **secrets** `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  (`vercel link` prints the last two; the token comes from
  Account Settings → Tokens)

The dashboard Git-integration route in §1 needs none of this and is what most
people should use.

# syntax=docker/dockerfile:1
#
# Portable production image for the hoodie store.
# Works on any container host: Fly.io, Railway, Render, Northflank, a VPS, or
# `docker run` locally. Vercel/Netlify need no Dockerfile — they build from the
# repo directly (see DEPLOYMENT.md).

##### 1. dependencies #####
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

##### 2. build #####
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_SITE_URL is inlined at BUILD time, so pass the production origin:
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://shop.example.com .
# Leaving it empty is safe: the app derives the origin from the request host.
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npm run build

##### 3. production dependencies #####
FROM node:22-slim AS proddeps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

##### 4. runner #####
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next ./.next
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=build --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=proddeps --chown=nextjs:nodejs /app/node_modules ./node_modules

# The two write locations are statically resolvable paths in the app (a dynamic,
# env-derived path makes Turbopack trace the whole project), so persistence is
# provided by symlinking them onto the /data volume instead of by configuring a
# directory at runtime.
RUN mkdir -p /data/runtime /data/uploads /app/src/data \
 && ln -sfn /data/runtime /app/src/data/runtime \
 && rm -rf /app/public/uploads \
 && ln -sfn /data/uploads /app/public/uploads \
 && chown -R nextjs:nodejs /data /app/src /app/public

USER nextjs
EXPOSE 3000
# /data holds the JSON catalogue (runtime/) and uploaded media (uploads/).
# Mount a volume here to keep edits and uploads across restarts; without one the
# store reseeds on boot and writes live only as long as the container.
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]

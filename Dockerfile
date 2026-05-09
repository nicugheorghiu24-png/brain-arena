# Brain Arena — multi-stage build for self-hosted deployment.
#
# Build:   docker build -t brain-arena .
# Run:     docker run -p 3000:3000 -e DATABASE_URL=... brain-arena
# Compose: docker compose up --build (recommended; includes Postgres)

# ─── Stage 1: dependencies ──────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma needs OpenSSL on alpine
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma
# postinstall runs `prisma generate`
RUN npm ci --ignore-scripts && npx prisma generate

# ─── Stage 2: build ─────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DATABASE_URL is NOT required at build time. Prisma's generated client
# embeds the schema, not the connection string.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# wget is used by the HEALTHCHECK below; openssl is needed by Prisma.
RUN apk add --no-cache openssl wget

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy minimum runtime artifacts. `app/` is included so `tsx server.js`
# can resolve the TS-only socket bootstrap (app/lib/matchmaking.ts).
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/eslint.config.mjs ./eslint.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/proxy.ts ./proxy.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/app ./app

EXPOSE 3000
USER node

# Liveness probe: doesn't touch the DB, so a transient DB outage won't
# cause Docker to restart the container into a thundering herd. Use
# /api/healthz from your reverse proxy / orchestrator if you want a
# DB-aware readiness check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider \
      "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

CMD ["npm", "run", "start"]

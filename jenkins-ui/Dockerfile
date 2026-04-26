FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY .env.production ./.env
COPY . .

# Ensure public directory exists before build
RUN mkdir -p ./public

# Next.js collects completely anonymous telemetry data
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create public directory in runner stage
RUN mkdir -p ./public

# Copy public directory from builder (may be empty, that's ok)
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir -p ./.next && chown -R nextjs:nodejs ./.next ./public

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Default env — secrets and overrides are injected at runtime via docker-compose / K8s
COPY --from=builder --chown=nextjs:nodejs /app/.env.production ./.env

USER nextjs

EXPOSE 3000

# Source .env into process before starting — standalone server.js does not auto-read env files
CMD ["/bin/sh", "-c", "set -a; [ -f .env ] && . .env; set +a; exec node server.js"]

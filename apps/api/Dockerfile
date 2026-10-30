# Build context must be the repository root.
# pnpm workspace: api depends on @hotel-booking/types.

FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile --filter @hotel-booking/api...

COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/types ./packages/types
RUN pnpm --filter @hotel-booking/api build

FROM node:22-alpine AS runner
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile --prod --filter @hotel-booking/api...

COPY --from=builder /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5001) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/apps/api/src/main.js"]

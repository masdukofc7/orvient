FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @inventory/shared build \
 && pnpm --filter @inventory/database generate \
 && pnpm --filter @inventory/database build \
 && pnpm --filter @inventory/api build

# Runtime: workspace package.json + built artifacts + prod node_modules only
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/database/generated packages/database/generated
COPY --from=build /app/packages/database/prisma packages/database/prisma
COPY --from=build /app/apps/api/dist apps/api/dist
RUN pnpm install --frozen-lockfile --prod \
 && pnpm --filter @inventory/database exec prisma --version
EXPOSE 4000
CMD ["pnpm", "--filter", "@inventory/api", "start:prod"]

# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.13.0
ARG PNPM_VERSION=10.26.1

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.json tsconfig.base.json ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/pedidos-gitex/package.json artifacts/pedidos-gitex/package.json
COPY artifacts/mockup-sandbox/package.json artifacts/mockup-sandbox/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY scripts/package.json scripts/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig.json tsconfig.base.json ./
RUN pnpm exec tsc --build --force \
  && pnpm --filter @workspace/api-server run typecheck \
  && pnpm --filter @workspace/pedidos-gitex run typecheck \
  && pnpm --filter @workspace/scripts run typecheck \
  && NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/pedidos-gitex run build \
  && pnpm --filter @workspace/api-server run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/public \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 gitex \
  && useradd --system --uid 10001 --gid gitex --home-dir /app --shell /usr/sbin/nologin gitex
COPY --from=build --chown=gitex:gitex /workspace/artifacts/api-server/dist ./dist
COPY --from=build --chown=gitex:gitex /workspace/artifacts/pedidos-gitex/dist/public ./public
COPY --from=build --chown=gitex:gitex /workspace/lib/db/drizzle ./drizzle
USER gitex
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["curl", "--fail", "--silent", "--show-error", "http://127.0.0.1:8080/health"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
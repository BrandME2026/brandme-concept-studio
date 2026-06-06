# Imagen base de Playwright: trae Chromium + dependencias del SO (Railway / Docker).
# El tag debe coincidir con la versión de playwright en package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Fijar pnpm 10 (respeta onlyBuiltDependencies del workspace; pnpm 11 lo trata distinto
# y rompe el build con ERR_PNPM_IGNORED_BUILDS).
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# ─── Dependencias ───
FROM base AS deps
WORKDIR /app
# minimumReleaseAge: 0 va en pnpm-workspace.yaml (el lockfile fija versiones ya verificadas;
# el cooldown supply-chain bloquearía el install reproducible).
# Reintentos de red robustos en vez de un timeout gigante (que colgaba el builder de
# Railway si un paquete tardaba). Sin cache mount (Railway exige cacheKey en el id).
ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=10000 \
    npm_config_fetch_retry_maxtimeout=60000 \
    npm_config_network_concurrency=8
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Build ───
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ─── Runtime ───
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Chromium ya vive en la imagen de Playwright; apuntar a su ruta.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Salida standalone de Next: server mínimo + dependencias necesarias.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

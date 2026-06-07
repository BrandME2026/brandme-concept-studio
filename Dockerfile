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

# Bug de Next 16.1+ con Turbopack: el standalone OMITE los serverExternalPackages
# (playwright) de node_modules, y playwright-core no encuentra browsers.json en runtime
# (vercel/next.js#88844). Copiamos el store .pnpm de playwright (con sus symlinks -L
# resueltos) y los enlaces top-level, garantizando que se resuelva en runtime.
COPY --from=builder /app/node_modules/.pnpm/playwright-core@1.60.0 \
  ./node_modules/.pnpm/playwright-core@1.60.0
COPY --from=builder /app/node_modules/.pnpm/playwright@1.60.0 \
  ./node_modules/.pnpm/playwright@1.60.0
# Symlinks top-level (require("playwright") los resuelve al store).
RUN mkdir -p node_modules \
  && ln -sf .pnpm/playwright@1.60.0/node_modules/playwright node_modules/playwright \
  && ln -sf .pnpm/playwright-core@1.60.0/node_modules/playwright-core node_modules/playwright-core

# tailwindcss se usa en RUNTIME para compilar el CSS de cada página (SEO/velocidad), pero
# es devDependency y el standalone no lo incluye. Copiamos su store .pnpm + symlink top-level.
COPY --from=builder /app/node_modules/.pnpm/tailwindcss@4.3.0 \
  ./node_modules/.pnpm/tailwindcss@4.3.0
RUN ln -sf .pnpm/tailwindcss@4.3.0/node_modules/tailwindcss node_modules/tailwindcss

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

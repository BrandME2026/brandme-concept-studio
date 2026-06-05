# Imagen base de Playwright: trae Chromium + dependencias del SO (Railway / Docker).
# El tag debe coincidir con la versión de playwright en package.json.
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ─── Dependencias ───
FROM base AS deps
WORKDIR /app
# minimumReleaseAge: 0 va en pnpm-workspace.yaml (el lockfile fija versiones ya verificadas;
# el cooldown supply-chain bloquearía el install reproducible). fetch-timeout amplio para
# redes lentas dentro del contenedor.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.fetch-timeout=120000

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

# CLAUDE.md — BrandMe Concept Studio

@AGENTS.md

> Reglas del proyecto para Claude Code. Las reglas globales del usuario (`~/.claude/CLAUDE.md`)
> aplican además de estas; en caso de conflicto, las de este archivo tienen prioridad.

## Qué es

**BrandMe Concept Studio**: pegas la URL de una web (o subes screenshot/logo) → Playwright extrae
sus tokens de diseño reales → un chat afina la dirección → la IA genera una landing propia
(HTML + Tailwind) con preview en vivo en un iframe sandbox → se publica en `/p/[slug]` (con
paywall Stripe si está configurado) → la página pública captura leads con un formulario y un
agente IA embebidos → dashboard de leads en `/leads`.

No es un clon de sitios: la IA produce una *propuesta inspirada*. El LLM aporta el **juicio**
(colores, layout, copy); el **formato** (DESIGN.md, slugs, inyección de imágenes, links de
contacto) lo resuelve código determinista y testeado.

## Stack real

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router, `src/`, TS) · React 19 · Tailwind v4 |
| BD | Postgres en **Railway** — `pg` directo, lazy schema (`src/lib/db/client.ts`) |
| Auth | **Firebase Auth opcional** — cliente en `src/lib/firebase/`, verificación server-side por JWKS (`src/lib/auth/verify-token.ts`, sin Admin SDK) |
| IA | **OpenRouter** vía Vercel AI SDK v6 (`src/lib/ai/openrouter.ts`) |
| Pagos | **Stripe** — gate binario de publicación (`src/lib/stripe/`) |
| Extracción | **Playwright** (Chromium) con guarda SSRF (`src/lib/extract/`) |
| Tests | Vitest (`pnpm test`) |
| Deploy | Docker + **Railway** (`Dockerfile` base `mcr.microsoft.com/playwright`, `railway.json`) |

Tablas (creadas on-demand): `users`, `user_sessions`, `generations`, `conversations`, `leads`,
`subscriptions`. La identidad es la **cookie de sesión `bmc_session`** (`src/lib/session.ts`);
el login Firebase solo *vincula* la sesión anónima al usuario (`/api/auth/link`).

### Modelos (env-driven — no hardcodear IDs en el negocio)

- **Generación**: `OPENROUTER_DEFAULT_MODEL` (default `openai/gpt-5.5`) con fallbacks
  `OPENROUTER_FALLBACK_MODELS` (Opus 4.7 → Sonnet 4.6 → Gemini 3.1 Pro). Selector de calidad en
  UI: `QUALITY_MODELS` ("alta" / "rapido").
- **Chat / agente / resolve**: `OPENROUTER_CHAT_MODEL` (default `deepseek/deepseek-v4-flash`,
  ~12× más barato que el premium) con fallback a Sonnet.
- **Voz**: `AUDIO_STT_MODEL` / `AUDIO_TTS_MODEL` vía OpenRouter (API compatible-OpenAI);
  `OPENAI_API_KEY` directo solo tiene prioridad si NO hay `OPENROUTER_API_KEY`.
- **Reasoning desactivado por defecto** en generación (latencia de minutos); reactivable con
  `OPENROUTER_REASONING_EFFORT`.

## Superficies

| Ruta | Qué es |
|------|--------|
| `/` | Studio (AppShell): extract → chat → generate → preview |
| `/p/[slug]` | Página publicada — HTML del LLM servido bajo CSP sandbox |
| `/webs` | Galería pública de webs publicadas |
| `/leads` | Dashboard de leads del consultor (KPIs, por página, tasa de contacto) |
| `/historial` · `/historial/[id]` · `/c/[id]` | Historial y rehidratación de conversaciones |
| `/embed/lead-form` · `/embed/agent` | Embeds para `/p/[slug]` (`frame-ancestors 'self'`) |

APIs principales (`src/app/api/`): `generate` (stream NDJSON, guarda en `generations`),
`extract`, `chat`, `agent` (conversa + tool `captureLead`), `resolve`, `leads`,
`history`/`conversations`, `checkout` + `stripe/webhook` + `publish` + `subscription`,
`speech-to-text`/`text-to-speech`/`voice-capabilities`, `auth/link`, `gallery`.

## Reglas del proyecto

1. **Degradación elegante para claves opcionales** (decisión de producto; en este punto tiene
   prioridad sobre el "fail fast" global): sin Stripe → las webs nacen `published=true`
   (publicar gratis); sin Firebase → sin login, app anónima; sin claves de audio → la voz se
   oculta (`/api/voice-capabilities`). `OPENROUTER_API_KEY` y `DATABASE_URL` sí son
   obligatorias: sin ellas se falla fuerte.
2. **El LLM solo para juicio; el formato es código determinista** testeado (DESIGN.md, slugs,
   inyección de imágenes, links de contacto). No meter el modelo donde basta código.
3. **Seguridad del HTML generado**: siempre iframe `sandbox` SIN `allow-same-origin` (origen
   opaco) — preview (`src/lib/preview/build-srcdoc.ts`) y `/p/[slug]` (CSP). No relajar.
4. **Anti-abuso en todo endpoint que cuesta dinero**: rate-limit por IP (`RL_*_PER_MIN`),
   tope diario global `LLM_DAILY_CAP`, semáforo de concurrencia de Playwright
   (`EXTRACT_CONCURRENCY`), límites de payload, honeypot en leads. Guarda SSRF en cualquier
   fetch de URL de usuario. El tope DURO de gasto se configura en el dashboard de OpenRouter.
5. **Stripe = gate binario**: cualquier suscripción activa permite publicar; un solo
   `STRIPE_PRICE_ID`. Los 3 tiers (Starter $29 / Pro $49 / Scale $99) existen en Stripe (test)
   pero NO están cableados con features diferenciadas. Webhook con validación de firma.

## Operación / gotchas

- **Dev:** `pnpm next dev --webpack` — Turbopack tiene un bug de panic/loop con `.next`
  corrupto en este entorno.
- **`NEXT_PUBLIC_*` se hornean en BUILD-time**: al añadir una, declararla como `ARG`+`ENV` en el
  `Dockerfile` antes de `pnpm build`, o llega `undefined` al bundle del cliente.
- **Qué se prueba dónde:** el gate de pago y el anti-duplicado requieren `DATABASE_URL`
  (Railway); en local (`.env.local` sin DB) se prueba chat, generación y extract (la generación
  tarda ~3 min en local por Playwright).
- Comandos: `pnpm test` (Vitest) · `pnpm lint` · `pnpm build` (fuerza `NODE_ENV=production`
  con cross-env). Variables: copiar `.env.example` a `.env.local`.

## Deuda conocida

- `src/lib/preview/build-srcdoc.ts` carga el Play CDN de **Tailwind v3**
  (`cdn.tailwindcss.com`) dentro del iframe de preview, mientras el portal usa v4. El HTML que
  genera el LLM debe ser compatible con v3. Migrar a `@tailwindcss/browser@4` implica revisar
  los prompts de generación.

## Visión futura

La visión "BrandMe v0.3" (SaaS multi-tenant para consultores de franquicias) vive en
[`docs/VISION.md`](docs/VISION.md). **No describe este código** — no usar su stack
(Neon/Clerk/Drizzle/Trigger.dev) como referencia al trabajar aquí.

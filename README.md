<div align="center">

# 🎨 BrandMe Concept

**Pega la URL de cualquier web → obtén una landing nueva inspirada en su estética → publícala y captura leads.**

Extrae el diseño real de una página (colores, tipografía, espaciado, layout + screenshot),
deja que una IA lo interprete, genera un **`DESIGN.md`** + un **preview HTML/Tailwind en vivo**,
y publícala en una URL propia con **formulario y agente IA de captura de leads** embebidos.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Playwright](https://img.shields.io/badge/Playwright-1.60-2ead33?logo=playwright)](https://playwright.dev)
[![Tests](https://img.shields.io/badge/tests-58%20passing-success)](#-tests)

</div>

---

> **No es un descargador de sitios ni un clon.** La IA produce una *propuesta inspirada* en la
> estética de la web de referencia — una interpretación con identidad propia, no una copia.

## ✨ Qué hace

1. **Extrae** el diseño real de cualquier URL — incluso apps JS-heavy (Next.js, React) — renderizando
   la página completa con Playwright y leyendo su CSS computado: paleta, tipografía, espaciado, radios.
2. **Conversa** — un chat donde describes cómo quieres tu diseño ("más oscuro", "tipografía serif",
   "estilo minimalista"). Soporta dictado por voz (STT) y lectura de respuestas (TTS).
3. **Sube imágenes** — logo, hero o fotos de producto; la IA las coloca donde encajan en el diseño.
4. **Genera en vivo** — la propuesta se construye con streaming (paleta → tipografía → maquetado)
   y produce dos artefactos: un **`DESIGN.md`** descargable (formato [getdesign](https://getdesign.md))
   y un **preview HTML + Tailwind** en un iframe seguro, con código copiable.
5. **Publica** — cada web obtiene un slug público (`/p/[slug]`). Con Stripe configurado, publicar
   requiere suscripción activa (paywall); sin Stripe, todo nace publicado (modo desarrollo).
6. **Captura leads** — la página publicada embebe un **formulario de contacto** y un **agente IA
   conversacional** (`/embed/lead-form`, `/embed/agent`) que conversa con los visitantes y captura
   nombre + teléfono/email automáticamente.
7. **Dashboard de leads** — `/leads` muestra KPIs (total, últimos 7/30 días, por página, tasa de
   contacto) de los leads de tus webs. Galería pública de webs publicadas en `/webs`.
8. **Login opcional** — Firebase Auth (Google / email) para conservar tu historial entre
   dispositivos; sin login, la app funciona anónima por cookie de sesión.
9. **Multi-idioma** — genera la propuesta en español o inglés (toggle ES/EN).

## 🧱 Stack

| Capa | Tecnología |
|------|-----------|
| Framework | **Next.js 16** (App Router) · React 19 · TypeScript |
| Estilos | **Tailwind CSS v4** · identidad visual derivada del `DESIGN.md` de Together AI |
| Extracción | **Playwright** (Chromium headless) con guarda SSRF |
| IA | **OpenRouter** vía Vercel AI SDK v6 — GPT-5.5 por defecto con fallbacks (Opus 4.7 → Sonnet 4.6 → Gemini 3.1 Pro); DeepSeek V4 Flash para chat/agente. Todo configurable por env |
| Base de datos | **Postgres** (Railway) — webs, conversaciones, leads, suscripciones |
| Auth | **Firebase Auth** (opcional) — verificación server-side por JWKS, sin Admin SDK |
| Pagos | **Stripe** (opcional) — suscripción mensual como gate de publicación |
| Tests | **Vitest** (TDD) |
| Deploy | **Docker + Railway** (Playwright corre completo en el contenedor) |

## 🔄 Arquitectura

```
URL ──▶ POST /api/extract    Playwright renderiza → DesignTokens + screenshot
    ──▶ POST /api/chat       streamText (contexto = tokens + conversación)
    ──▶ POST /api/generate   stream → propuesta → DESIGN.md + HTML + slug
    ──▶ preview en iframe (sandbox) + DESIGN.md descargable + copiar HTML
    ──▶ POST /api/checkout   Stripe Checkout → webhook → suscripción activa
    ──▶ POST /api/publish    marca published=true → /p/[slug] pública
                             ├─ /embed/lead-form → POST /api/leads
                             └─ /embed/agent     → POST /api/agent (tool captureLead)
    ──▶ /leads               dashboard de leads · /webs galería pública
```

El LLM aporta **el juicio** (qué colores, dónde van las imágenes, qué responde el agente); el
**formato** (DESIGN.md, slugs, inyección de imágenes, captura de leads) lo resuelve código
determinista y testeado.

## 🚀 Desarrollo

```bash
pnpm install
pnpm exec playwright install chromium   # navegador para extracción local
cp .env.example .env.local              # añade tu OPENROUTER_API_KEY
pnpm next dev --webpack                 # http://localhost:3000
```

> **`--webpack`**: Turbopack tiene un bug de panic/loop con `.next` corrupto en este entorno.
>
> El script `build` fuerza `NODE_ENV=production` con `cross-env` (algunos entornos exportan
> `NODE_ENV=development` globalmente, lo que rompería el prerender de Next).
>
> Sin `DATABASE_URL` en local no hay persistencia ni paywall (chat, generación y extract sí
> funcionan). Sin claves de Stripe/Firebase, esas features se desactivan con elegancia.

## 🧪 Tests

```bash
pnpm test     # 58 tests (clustering de color, tokens, SSRF, DESIGN.md, inyección de
              # imágenes, srcdoc del preview, SEO/llms.txt, links de contacto, Firebase)
```

## 🐳 Docker / Railway

```bash
docker build -t brandme-concept .
docker run -p 3000:3000 -e OPENROUTER_API_KEY=sk-or-... brandme-concept
```

Railway detecta el `Dockerfile` automáticamente (ver `railway.json`). Configura las variables en
el servicio. La imagen base `mcr.microsoft.com/playwright` ya incluye Chromium.

> ⚠️ Las `NEXT_PUBLIC_*` se hornean en **build-time**: el `Dockerfile` las declara como
> `ARG`+`ENV` antes de `pnpm build`. Al añadir una nueva, agrégala también al `Dockerfile`.

## 🔐 Seguridad

- **Anti-SSRF**: la URL del usuario se valida resolviendo DNS y bloqueando loopback, link-local,
  rangos privados y metadata de cloud (cubre DNS-rebinding). Defensa en profundidad en Playwright.
- **HTML generado aislado**: el preview y `/p/[slug]` sirven el HTML del LLM en iframe
  `sandbox="allow-scripts"` *sin* `allow-same-origin` — sin acceso a cookies ni al DOM de la app.
  Los embeds (`/embed/*`) restringen `frame-ancestors` a `'self'`.
- **Secretos**: solo en variables de entorno; nunca en el cliente ni en el repo.
- **Anti-abuso / protección de tokens** (endpoints públicos): rate-limit por IP en todos los
  endpoints que cuestan dinero/recursos (`/api/generate`, `/api/extract`, `/api/agent`, `/api/chat`,
  `/api/resolve`, `/api/leads`, `/api/checkout`), **tope diario global** de operaciones caras
  (circuit-breaker al alcanzar `LLM_DAILY_CAP`), **semáforo** de concurrencia de Playwright, y
  límites de tamaño anti-payload. El rate-limit es en memoria (1ª capa; migrable a Redis).
  Captura de leads con honeypot + validación.
- **Webhooks Stripe**: validación de firma; la suscripción cuelga del `session_id`.
- **Headers globales** (`src/middleware.ts`): HSTS, `X-Frame-Options: SAMEORIGIN`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`. No tocan la CSP especial de `/p/*`.

> ### ⚠️ Capa 0 — tope DURO de gasto en OpenRouter (configúralo TÚ, es lo más importante)
> El rate-limit de la app es la 1ª capa, pero el tope real de dinero se pone en OpenRouter:
> 1. Crea una **API key dedicada** para producción en el dashboard de OpenRouter.
> 2. Ponle un **límite de gasto (credit limit)** mensual. Al alcanzarlo, la key deja de gastar →
>    tu pérdida máxima ante cualquier ataque es ese límite.
> 3. Activa **alertas de uso**. Así, aunque todo lo demás falle, no hay factura sorpresa.

## ⚙️ Variables de entorno

Ver [`.env.example`](.env.example) con todas las variables comentadas. Resumen:

```bash
OPENROUTER_API_KEY=sk-or-...                  # requerida (LLM + voz)
DATABASE_URL=postgres://...                   # persistencia (Railway la inyecta en prod)

OPENROUTER_DEFAULT_MODEL=openai/gpt-5.5       # generación (env-driven, con fallbacks)
OPENROUTER_CHAT_MODEL=deepseek/deepseek-v4-flash   # chat/agente (económico)

STRIPE_SECRET_KEY= / STRIPE_PRICE_ID= / STRIPE_WEBHOOK_SECRET=   # paywall (opcional)
NEXT_PUBLIC_FIREBASE_*                        # login + analytics (opcional)
NEXT_PUBLIC_SITE_URL=                         # obligatoria en prod (redirects de Stripe)
LLM_DAILY_CAP=300 · RL_*_PER_MIN=...          # anti-abuso (defaults sensatos)
```

## 📝 Sobre getdesign

La identidad visual se instaló con `npx getdesign add together.ai`, que copia un `DESIGN.md`
pre-generado. **No ejecutamos getdesign en runtime** — solo reusamos su *formato* `DESIGN.md`
(el que la IA aprende a generar) y su estética como identidad de la app.

## 🔭 Visión

La visión a largo plazo ("BrandMe v0.3", SaaS multi-tenant para consultores de franquicias) está
documentada en [`docs/VISION.md`](docs/VISION.md). **No describe el código de este repo.**

---

<div align="center">
<sub>Construido con Next.js, Playwright, Postgres y OpenRouter.</sub>
</div>

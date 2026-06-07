<div align="center">

# 🎨 BrandMe Concept

**Pega la URL de cualquier web → obtén una propuesta de diseño nueva, inspirada en su estética.**

Extrae el diseño real de una página (colores, tipografía, espaciado, layout + screenshot),
deja que una IA lo interprete, y genera un **`DESIGN.md`** + un **preview HTML/Tailwind en vivo**.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)
[![Playwright](https://img.shields.io/badge/Playwright-1.60-2ead33?logo=playwright)](https://playwright.dev)
[![Tests](https://img.shields.io/badge/tests-43%20passing-success)](#tests)

</div>

---

> **No es un descargador de sitios ni un clon.** La IA produce una *propuesta inspirada* en la
> estética de la web de referencia — una interpretación con identidad propia, no una copia.

## ✨ Qué hace

1. **Extrae** el diseño real de cualquier URL — incluso apps JS-heavy (Next.js, React) — renderizando
   la página completa con Playwright y leyendo su CSS computado: paleta, tipografía, espaciado, radios.
2. **Conversa** — un chat (estilo Coinbase + ChatGPT) donde describes cómo quieres tu diseño
   ("más oscuro", "tipografía serif", "estilo minimalista"). Lo que escribes guía la propuesta.
3. **Sube imágenes** — logo, hero o fotos de producto; la IA las coloca donde encajan en el diseño.
4. **Genera en vivo** — la propuesta se construye con streaming (ves cada paso: paleta → tipografía →
   maquetado) y produce dos artefactos:
   - un **`DESIGN.md`** (formato del CLI [getdesign](https://getdesign.md)) descargable
   - un **preview HTML + Tailwind** renderizado en un iframe seguro, con código copiable.
5. **Multi-idioma** — genera la propuesta en español o inglés (toggle ES/EN).

## 🧱 Stack

| Capa | Tecnología |
|------|-----------|
| Framework | **Next.js 16** (App Router) · React 19 · TypeScript |
| Estilos | **Tailwind CSS v4** · identidad visual derivada del `DESIGN.md` de Together AI |
| Extracción | **Playwright** (Chromium headless) con guarda SSRF |
| IA | **OpenRouter** vía Vercel AI SDK v6 (`claude-sonnet-4.6` + fallbacks), streaming |
| Tests | **Vitest** (TDD) |
| Deploy | **Docker + Railway** (Playwright corre completo en el contenedor) |

## 🔄 Arquitectura

```
URL ──▶ POST /api/extract   Playwright renderiza → DesignTokens + screenshot
    ──▶ POST /api/chat       streamText (contexto = tokens + conversación)
    ──▶ POST /api/generate   streamObject → propuesta → DESIGN.md + HTML
                             └─ imágenes del usuario inyectadas en el HTML
    ──▶ preview en iframe (sandbox) + DESIGN.md descargable + copiar HTML
```

El LLM aporta **el juicio** (qué colores, dónde van las imágenes); el **formato** (DESIGN.md, inyección
de imágenes) lo resuelve código determinista y testeado.

## 🚀 Desarrollo

```bash
pnpm install
pnpm exec playwright install chromium   # navegador para extracción local
cp .env.example .env.local              # añade tu OPENROUTER_API_KEY
pnpm dev                                # http://localhost:3000
```

> El script `build` fuerza `NODE_ENV=production` con `cross-env` (algunos entornos exportan
> `NODE_ENV=development` globalmente, lo que rompería el prerender de Next).

## 🧪 Tests

```bash
pnpm test     # 43 tests (clustering de color, tokens, SSRF, DESIGN.md, inyección de imágenes)
```

## 🐳 Docker / Railway

```bash
docker build -t brandme-concept .
docker run -p 3000:3000 -e OPENROUTER_API_KEY=sk-or-... brandme-concept
```

Railway detecta el `Dockerfile` automáticamente (ver `railway.json`). Configura `OPENROUTER_API_KEY`
en las variables del proyecto. La imagen base `mcr.microsoft.com/playwright` ya incluye Chromium.

## 🔐 Seguridad

- **Anti-SSRF**: la URL del usuario se valida resolviendo DNS y bloqueando loopback, link-local,
  rangos privados y metadata de cloud (cubre DNS-rebinding). Defensa en profundidad en Playwright.
- **Preview aislado**: el HTML generado se renderiza en un iframe `sandbox="allow-scripts"` *sin*
  `allow-same-origin` — sin acceso a cookies ni al DOM de la app.
- **Secretos**: solo en variables de entorno; nunca en el cliente ni en el repo.
- **Anti-abuso / protección de tokens** (endpoints públicos): rate-limit por IP en todos los
  endpoints que cuestan dinero/recursos (`/api/generate`, `/api/extract`, `/api/agent`, `/api/chat`,
  `/api/resolve`, `/api/leads`), **tope diario global** de operaciones caras (circuit-breaker que
  corta la generación premium y la extracción al alcanzar `LLM_DAILY_CAP`), **semáforo** de
  concurrencia de Playwright, y límites de tamaño (mensajes, brief, screenshot, query) anti-payload.
  El rate-limit es en memoria (1ª capa; migrable a Redis). Captura de leads con honeypot + validación.
- **Headers globales** (`src/middleware.ts`): HSTS, `X-Frame-Options: SAMEORIGIN` (anti-clickjacking),
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`. No tocan la CSP especial de `/p/*`.

> ### ⚠️ Capa 0 — tope DURO de gasto en OpenRouter (configúralo TÚ, es lo más importante)
> El rate-limit de la app es la 1ª capa, pero el tope real de dinero se pone en OpenRouter:
> 1. Crea una **API key dedicada** para producción en el dashboard de OpenRouter.
> 2. Ponle un **límite de gasto (credit limit)** mensual. Al alcanzarlo, la key deja de gastar →
>    tu pérdida máxima ante cualquier ataque es ese límite.
> 3. Activa **alertas de uso**. Así, aunque todo lo demás falle, no hay factura sorpresa.

## ⚙️ Variables de entorno

```bash
OPENROUTER_API_KEY=sk-or-...                       # requerida
OPENROUTER_DEFAULT_MODEL=anthropic/claude-sonnet-4.6
OPENROUTER_FALLBACK_MODELS=google/gemini-2.5-flash,openai/gpt-4o
EXTRACT_TIMEOUT_MS=30000

# Anti-abuso (todas opcionales; defaults sensatos). Ajustables en Railway sin redeploy.
LLM_DAILY_CAP=300            # tope diario de operaciones caras (generate + extract)
EXTRACT_CONCURRENCY=3        # máx. browsers de Playwright simultáneos
RL_GENERATE_PER_MIN=5        # rate-limit por IP/min de cada endpoint
RL_EXTRACT_PER_MIN=6
RL_CHAT_PER_MIN=20
RL_AGENT_PER_MIN=20
RL_RESOLVE_PER_MIN=15
RL_LEADS_PER_MIN=5
```

## 📝 Sobre getdesign

La identidad visual se instaló con `npx getdesign add together.ai`, que copia un `DESIGN.md`
pre-generado. **No ejecutamos getdesign en runtime** — solo reusamos su *formato* `DESIGN.md`
(el que la IA aprende a generar) y su estética como identidad de la app.

---

<div align="center">
<sub>Construido con Next.js, Playwright y OpenRouter.</sub>
</div>

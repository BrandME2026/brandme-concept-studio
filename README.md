# BrandMe Concept

Webapp donde pegas la **URL** de cualquier web, se **extrae su diseño real** (colores,
tipografía, espaciado, layout + screenshot), conversas con una **IA** sobre esa estética y
la IA **propone un diseño NUEVO inspirado** — generando un **`DESIGN.md`** y un **preview
HTML/Tailwind en vivo** en un iframe.

> No es un descargador de sitios ni un clon: la IA hace una *propuesta inspirada*, no una copia.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** + identidad visual derivada del `DESIGN.md` de Together AI
- **Playwright** (Chromium headless) para la extracción
- **OpenRouter** (Vercel AI SDK v6) para chat y generación, con modelos de fallback
- **Vitest** para tests (TDD)
- **Docker + Railway** para el despliegue (Playwright corre completo en el contenedor)

## Flujo

```
URL → /api/extract (Playwright → DesignTokens + screenshot)
    → /api/chat    (streamText, contexto = tokens + conversación)
    → /api/generate (generateObject → propuesta → DESIGN.md + HTML)
    → preview en iframe sandbox + DESIGN.md descargable
```

## Desarrollo

```bash
pnpm install
pnpm exec playwright install chromium   # navegador para extracción local
cp .env.example .env.local              # añade tu OPENROUTER_API_KEY
pnpm dev
```

> Nota: este entorno exporta `NODE_ENV=development` globalmente; el script `build` ya fuerza
> `NODE_ENV=production` con cross-env para que el prerender no falle.

## Tests

```bash
pnpm test
```

## Docker / Railway

```bash
docker build -t BrandMe Concept .
docker run -p 3000:3000 -e OPENROUTER_API_KEY=sk-or-... BrandMe Concept
```

Railway detecta el `Dockerfile` (ver `railway.json`). Configura `OPENROUTER_API_KEY` en las
variables del proyecto.

## Sobre getdesign

La identidad visual se instaló con `npx getdesign add together.ai`, que copia un `DESIGN.md`
pre-generado. **No ejecutamos getdesign en runtime**: solo reusamos su formato `DESIGN.md`
(el que la IA aprende a generar) y su estética como identidad de la app.

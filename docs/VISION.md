# Visión — BrandMe v0.3 (SaaS de franquicias)

> ⚠️ **Visión futura — NO implementada.** Este repo contiene **BrandMe Concept Studio**
> (generador de webs por IA con captura de leads); nada de este documento describe el código
> actual. No usar el stack de aquí (Neon, Clerk, Drizzle, Trigger.dev…) como referencia al
> trabajar en el repo — para eso está [`CLAUDE.md`](../CLAUDE.md).

---

## Qué es BrandMe v0.3

Plataforma **SaaS multi-tenant** de inteligencia de crecimiento de franquicias impulsada por IA,
para **consultores de desarrollo de franquicias (FDCs)** — mercado de ~3,000–4,000 profesionales
en EE.UU. que representan 15–50 marcas cada uno y ganan comisiones de $15K–$65K por colocación.

Por cada marca que representa un consultor, BrandMe genera automáticamente (en <45 min p75 desde
el onboarding):

- **BrandMePage** — landing optimizada para conversión.
- **Widget AMA** — Q&A conversacional *grounded* en una Knowledge Vault por marca (sin alucinar).
- **Bundle SEO programático** — 500 páginas (Pro) / 1,000 (Pro+).
- **Respuesta automática al lead** en <5 min + notificación al consultor en <60 s.
- **Nurture multi-paso** con lógica de "detener al actuar" (halt-on-action).
- **Inteligencia de territorio** a nivel ZIP.
- **CRM nativo de franquicias** (pipeline kanban, contactos auto-creados).

**Pricing:** Pro $150/mes · Pro+ $250/mes · setup $200.
**PMF (90 días):** 10+ consultores reteniendo y pagando · 3+ deals verificados · 2+ upgrades.

### Cliente / roles

- Owner de la documentación: `luis.sierra1414@gmail.com`.
- **Shawn** → negocio/legal (sign-off de pricing, copy, decisiones de producto).
- **Luis** → técnico/ops (infraestructura, A2P 10DLC, selección de vendors).
- **Junior** → research técnico (pricing de vendors, modelos).

Documentación fuente: ~68 documentos de requerimientos en
[Google Drive](https://drive.google.com/drive/folders/17Z_9xPS1d-wBJQFr2hBZ-Ckn2LlNT7ZM).

---

## Stack objetivo (no el del repo actual)

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router, `src/`, TypeScript) |
| UI | Tailwind CSS v4 |
| Base de datos | Postgres (**Neon**) + **pgvector** |
| Storage | **R2** (Knowledge Vault, Deal Vault, assets) |
| Hosting / CDN | Vercel + **Cloudflare** (CDN/WAF) |
| Auth | **Clerk** (MFA para admins internos) |
| Jobs / orquestación | **Trigger.dev** |
| Pagos | **Stripe** |
| Email | **Resend** (plataforma) + Gmail OAuth (sync) |
| SMS | **Twilio** (US-only, requiere A2P 10DLC) |
| Observabilidad | **Sentry** + **PostHog** (desde Build 1) |
| Proveedor de modelos | **OpenRouter** (chat + embeddings, una sola API key) |
| IA — razonamiento | Claude Sonnet 4.6 vía OpenRouter |
| IA — estructurado | Claude Haiku 4.5 vía OpenRouter |
| IA — embeddings | Qwen3 Embedding 8B vía OpenRouter (`qwen/qwen3-embedding-8b`, RAG) |
| Datos externos | DataForSEO · Firecrawl · Exa.ai · People Data Labs · RB2B |

### Arquitectura de agentes (18: 12 núcleo + 4 complementarios)

Agentes Claude orquestados vía Trigger.dev. Cada agente es **enchufable** (implementa
`agent.port.ts`, se registra en `agents/registry.ts`) y consume servicios externos solo por su
puerto. Los identificados en la documentación:

- **02** Brand Extraction · **03** Knowledge Vault · **04** BrandMePage Generation
- **05** SEO Strategy / SEO programático · **06** Content Refresh / FAQ enrichment
- **07** Lead Intent Scoring · **08** Multi-step Nurture · **09** Social Publishing
- **11** Prospect Research · **13–17** batch agents (refresh, MCP, onboarding, etc.)

---

## Reglas no-negociables del spec v0.3

1. **Aislamiento multi-tenant a nivel de BD** — cada dato lleva `consultant_id` (tenant). La
   suite de tests de aislamiento de tenants gatea cada merge desde Build 1. Los brand admins
   solo ven agregados cross-consultor, nunca datos de consultores individuales.
2. **Prompt caching obligatorio** en toda llamada a Claude — requisito financiero, no
   optimización: el modelo de costos asume ~90% cache hit. Sin él, el costo LLM sube 3–5× y el
   margen bruto cae de ~71% a 20–40%. Confirmado: OpenRouter soporta el caching de Claude.
3. **Modelos fijos vía OpenRouter** — no cambiar de modelo sin aprobación explícita.
4. **Webhooks idempotentes** — firma + dedup por event ID + transacciones idempotentes;
   reintentos con backoff exponencial.
5. **SLAs como contrato** (monitorizados con Sentry): lead first-touch <5 min p95 · notificación
   consultor <60 s p95 · BrandMePage publicada <45 min p75 · nurture step <60 s p95.
6. **PII / privacidad** — el texto de las preguntas del AMA nunca se loguea (solo metadata).
   Tokens OAuth encriptados en reposo. Session-cookie-only.

## Convenciones del spec v0.3

- **Backend estilo NestJS dentro de Next.js** (solo la filosofía, no el runtime): modular por
  dominio, Controller→Service→Repository, DTOs con Zod, errores centralizados, eventos para
  desacoplar. Controllers (Route Handlers) finos; lógica en services; datos en repositories
  (vía `withTenant`).
- **Ports & adapters para todo lo extensible**: proveedores externos, agentes y skills. El
  negocio depende de la interfaz (puerto), nunca del proveedor concreto.
- A11y WCAG 2.1 AA (gatea cada deploy) · Core Web Vitals como gate de build (LCP<2.5s,
  INP<200ms, CLS<0.1, TTFB<800ms).
- Las BrandMePages usan tokens **dinámicos por marca** (Agent 02), no un design system fijo.

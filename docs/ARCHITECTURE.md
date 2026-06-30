# BrandMe v0.3 — Arquitectura

> Síntesis de los docs técnicos (6, 7, 11, 12, 13, 15, 45) de Drive. Fuente de verdad: ver
> `DRIVE-INDEX.md`. Lee el doc original en Drive antes de implementar cualquier detalle.

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js (App Router, TypeScript) — repo scaffolded en Next 16 |
| UI | Tailwind CSS |
| Base de datos | Postgres (**Railway**, driver `pg`) — **pgvector** pendiente (objetivo para RAG) |
| Object storage | **Pendiente** (objetivo: R2 para Knowledge Vault, Deal Vault, Resource Library, assets) — hoy assets inline |
| Hosting | **Railway** (Docker, `output: standalone`) |
| CDN / WAF | Pendiente (objetivo: Cloudflare) |
| Auth | **Firebase Auth** (opcional; sin Admin SDK, verificación vía JWKS) — MFA admins pendiente |
| Jobs / orquestación | **Pendiente** (objetivo: job runner tipo Trigger.dev) — hoy síncrono en el request |
| Email | Pendiente (objetivo: Resend · Gmail OAuth sync read-only) |
| SMS | Pendiente (objetivo: Twilio US-only; A2P 10DLC) |
| Pagos | **Stripe** |
| Observabilidad | Pendiente (objetivo: Sentry errores · PostHog producto) — hoy `console.*` + Firebase Analytics |

> **Nota de sincronización (2026-06):** esta tabla mezcla **stack actual** (negrita: Next 16,
> Tailwind, Railway pg, Firebase Auth, OpenRouter, Stripe) y **stack objetivo pendiente**
> (pgvector, R2, Cloudflare, Trigger.dev, Resend, Twilio, Sentry/PostHog). Sincronizada con los
> blueprints de 8090 (`BrandMe_v0.3_production`).

### Modelos de IA
| Alias | Modelo | Pricing | Uso |
|-------|--------|---------|-----|
| large | **Claude Sonnet 4.6** (`anthropic/claude-sonnet-4.6`) | $3/M in · $15/M out | Razonamiento complejo (agentes 02,03,04,05,06,09,13) |
| fast | **Claude Haiku 4.5** (`anthropic/claude-haiku-4.5`) | $1/M in · $5/M out | Tareas estructuradas alta frecuencia (01,07,08,10,15,16,17…) |
| embeddings | **Qwen3 Embedding 8B** (`qwen/qwen3-embedding-8b`) | ~$0.01/M | RAG, dims configurables (especializado en embedding+ranking) |

> **Provider: OpenRouter (decisión del equipo, 2026-06).** Todo el acceso a modelos (chat +
> embeddings) pasa por OpenRouter (`/api/v1/chat/completions` y `/api/v1/embeddings`) con una
> sola API key. **Esto se desvía del spec original de Drive**, que especificaba Anthropic directo
> + Voyage AI 3.5 (1024 dims). Aprobado por el usuario.
>
> ✅ **Prompt caching confirmado en OpenRouter:** soporta el caching de Claude (~90% ahorro en
> tokens cacheados; mínimos: Haiku 1.024, Sonnet 2.048 tokens). El requisito financiero del
> proyecto se cumple a través del router.
>
> ⚠️ **Dimensiones pgvector:** definir las dims de salida de Qwen3 (configurable) ANTES de crear
> el esquema. Cambiar el modelo o las dims después invalida los vectores → re-embedar todo el
> Knowledge Vault. pgvector (sobre el Postgres de Railway) sería el almacén cuando se implemente RAG.
>
> 💡 Alternativas de embeddings consideradas (por si sube el requisito de calidad): OpenAI
> `text-embedding-3-large` (~$0.13/M, 3072 dims) · `-small` (~$0.02/M, 1536) · Gemini Embedding 2
> (~$0.20/M, multimodal). Elegido Qwen3 8B por mejor coste/consultor.

### Datos externos
DataForSEO (SEO, ~$1/consultor/mes) · Firecrawl (scraping) · Exa.ai (búsqueda semántica + citas) ·
People Data Labs (enrichment) · RB2B (visitor ID, feature-flagged) · Google Search Console ·
Google Maps **o** Mapbox (pendiente) · News API (pendiente) · Cal.com (calendario opcional).

## Modelo multi-tenant (Platform Foundation)

- Cada entidad lleva `consultant_id` (tenant): brands, BrandMePages, leads, contacts, deals,
  nurture sequences, AI Concierge context.
- **Aislamiento a nivel de BD** (no solo aplicación). Incluso consultores de la misma franquicia
  tienen datos separados.
- **Suite de tests de aislamiento de tenants gatea cada merge** desde Build 1: aislamiento de
  queries, de recuperación del AI Concierge, y a nivel API.
- **Brand admins** ven solo agregados cross-consultor (totales, notificaciones de deals), nunca
  datos de consultores individuales.

### Implementación (objetivo: RLS sobre Postgres/pgvector)

> **Estado actual (2026-06):** multi-tenancy a nivel BD es el **objetivo** (regla #1 no-negociable),
> pero el código **aún no lo implementa**: hoy el aislamiento es a nivel de aplicación, filtrando por
> una cookie `session_id` (`WHERE session_id = $1`), sin columna `consultant_id` ni políticas RLS, y
> sin ORM (queries SQL crudas con `pg`, no Drizzle). Lo de abajo es el target, no lo construido.

- Esquema en `src/db/schema/` (un archivo por dominio). 10 tablas: `consultant`, `brand`,
  `brand_extraction`, `brandmepage`, `knowledge_vault`, `vault_chunk`, `contact`, `lead`, `deal`,
  `deal_note`.
- **RLS** activado en todas las tablas con datos de tenant (`drizzle/0001_rls_*`): política
  `tenant_isolation` que filtra por `current_setting('app.current_consultant')`. `FORCE ROW LEVEL
  SECURITY` para que aplique también al owner. Tablas hijas (extraction, vault, deal_note) heredan
  el tenant vía `EXISTS` con su padre.
- Punto único de acceso: **`withTenant(consultantId, fn)`** (`src/db/tenant.ts`) — transacción con
  `set_config('app.current_consultant', …, true)`. Toda query con datos de tenant pasa por aquí.
- **RAG:** `vault_chunk.embedding = vector(1024)` (Qwen3 truncado con MRL) + índice HNSW cosine.
- Tests: `src/db/__tests__/tenant-isolation.test.ts` (gate de merge).

## Primitivas de plataforma
- **Webhook handler**: validación de firma + dedup por event ID + transacciones idempotentes.
  Lo usan todas las integraciones (Stripe, Cal.com, etc.).
- **LLM Wrapper service**: alias de modelo (large/fast/embeddings), prompt caching, batch.
- **Observabilidad**: Sentry desde Build 1, taxonomía de tags (consultant_id, agent_id,
  model_alias, user_role, surface).

## Arquitectura de agentes (18: 12 núcleo + 4 complementarios)

> Patrón de implementación (enchufable: `agent.port.ts` + `agents/registry.ts`, consumo de
> proveedores por puerto): ver [`BACKEND.md`](BACKEND.md). Estructura de skills: misma sección.

| Agente | Función | Doc Drive |
|--------|---------|-----------|
| 02 | Brand Extraction (Firecrawl + LLM → identity tokens + content signals) | 18 |
| 03 | Knowledge Vault (chunking, embeddings, retrieval; alimenta AMA) | 51 |
| 04 | BrandMePage Generation (composición + copy) | 20 |
| 05 | SEO Strategy / SEO programático (keyword taxonomy por territorio) | 24/28 |
| 06 | Content Refresh / FAQ enrichment | 26 |
| 07 | Lead Intent Scoring | 29/30 |
| 08 | Multi-step Nurture | 59 |
| 09 | Social Publishing (requiere brand voice; bloqueado si degradación) | 43 |
| 11 | Prospect Research Agent | 40 |
| 13–17 | Batch agents (refresh, MCP, onboarding, etc.) | varios |

> Los números 01, 10, 12 y los complementarios aparecen referenciados pero algunos sin doc de
> spec propio. Ver `OPEN-QUESTIONS.md`.

## MCP Server / API pública (Build 11, add-on $49/mes)
- **REST API**: OpenAPI 3.1 en `/docs/api`, rate limit 1,000 req/h por key, cursor pagination
  (default 50, max 200). Endpoints: contacts, leads, pipeline deals, analytics summary.
- **MCP server**: manifest en `/.well-known/mcp/server.json`. Tools: `get_leads`, `get_contact`,
  `get_pipeline_summary`, `search_contacts`, `get_recent_research_updates`. Auth: API key Bearer.
  Descubrimiento en `llms.txt`.
- **API keys**: generadas por consultor, max 10 activas/tenant, full key visible una sola vez.
- **Webhooks salientes**: max 10/consultor, HMAC-SHA256, retry 3× (5/15/45 min), auto-disable
  tras 10 fallos, delivery SLA 30 s p95. Eventos: lead.created, lead.qualified,
  contact.lifecycle_changed, deal.stage_changed, nurture.completed.

## Modelo de costos (crítico)

- **Baseline blended: ~$11.79–11.83/consultor/mes** (LLM ~$5 + DataForSEO ~$1 + Exa pendiente +
  otros ~$0.75). **Nota: Exa está subvaluado** en el modelo.
- **Onboarding spike** (one-time por consultor Pro): ~$60–68.
- **Gross margin de infra:** ~90–95% @ 50 consultores → ~96–98% @ 1,050.

### Restricción financiera no-negociable
- **Prompt caching ~90% hit = requisito, no optimización.** Sin él, costo LLM sube 3–5× y el
  margen cae de ~71% a 20–40%.
- **Prompt caching: confirmado en OpenRouter** (~90% ahorro en tokens cacheados). El requisito
  financiero se cumple. Pendiente menor: confirmar disponibilidad de **batch** (~50% extra) a
  través del router para agentes batch (06-refresh, 14–17).
- Sensibilidad: 90% hit → ~$5/mes · 80% → ~$6–7 · 70% → ~$7–9.5.

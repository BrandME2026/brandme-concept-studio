# BrandMe v0.3 — Estructura y templates de superficies

> Síntesis fiel de los docs 16, 20, 21, 22, 23, 32, 54 de Drive. Fuente de verdad: `DRIVE-INDEX.md`.
> Cubre cada superficie: BrandMePage pública, AMA Widget, Portal del Consultor, Onboarding,
> Admin Console, y el sistema de Brand Template Override.

## 1. BrandMePage (pública)

### URLs / slugs
- `getbrandme.ai/[consultant-slug]/[brand-slug]` → BrandMePage
- `getbrandme.ai/[consultant-slug]/[brand-slug]/[zone-slug]` → subpágina SEO (~100/marca/zona)
- `getbrandme.ai/schedule/[consultant-slug]` → agendamiento nativo
- Rutas reservadas (no usables como consultant-slug): `/dashboard /login /signup /admin /settings /api /schedule`
- Preview (draft): URL distinta, expira 14 días, `noindex`, fuera de sitemaps.
- Slugs: minúsculas, guiones, transliteración ASCII, sufijo numérico ante colisión. zone-slug
  truncado a 80 chars; cambio post-publicación requiere 301.

### Bloques SIEMPRE-PRESENTES (orden exacto)
1. **Hero** (con headshot del consultor)
2. **Brand overview**
3. **Value proposition**
4. **Objection-handling FAQs**
5. **Consultant profile** (bio arriba, social icons debajo)
6. **Lead capture form**
7. **AMA widget**

### Bloques condicionales y su posición
- **Professional Credentials** — dentro de Consultant profile, entre social icons y lead form;
  etiqueta "Self-reported by consultant". Activa si ≥1 credencial poblada.
- **ROI Calculator** — activa si hay datos FDD en el vault; se **omite** si no (nunca cifras sintéticas).
- **Territory Availability** — activa con datos de territorio; NO se omite, renderiza en "pending".
- **Booking embed** — Build 10.
- **Multi-Brand Comparison Card** (entry point) — debajo de lead form + AMA.
- **Testimonials block** — debajo de lead form + AMA. Si coexiste con Comparison Card, va ENTRE
  lead form y Testimonials.
- **Portfolio Brand Navigation** ("More brands I represent") — al fondo, debajo de Testimonials.
  Activa si el consultor tiene ≥1 otra BrandMePage publicada.

Orden de la zona inferior: Lead form → AMA → Comparison Card → Testimonials → Portfolio Navigation.
Siempre: privacy disclosure cerca del lead form · SEO metadata server-rendered.

### Lifecycle
Draft → Published → Stale → Regenerating → Published · ramas: Offline (Option C) · Archived
(día 30, 301) · Gone (día 90, 410).

## 2. AMA Widget — estados del componente

- **Loading**: input + spinner mientras se chequea el vault (≤2s p95). No muestra fallback.
- **Idle/ready**: input con placeholder (si vault `ready`). Sesión = una visita; 20 turns máx;
  ventana rodante de 8 turns al modelo.
- **Streaming**: token-por-token (1er token <1.5s p50; respuesta 2s p50/3s p95/6s p99).
- **Fallback**: si ningún chunk supera 0.75 cosine o vault no `ready`. SIEMPRE incluye CTA de
  conversión (booking o lead capture inline) + disclaimer financiero si aplica.
- **Handoff**: prompt in-chat a ≥5 queries o patrón high-intent → crea lead "AMA-sourced" con
  transcript. En móvil: card full-width sobre el input (no modal).
- **Session/rate limit**: 20 turns → mensaje + agendar · 30 queries/sesión · 100 queries/IP/hora (429).
- **Adversarial lockout**: tras 3+ eventos adversariales, deshabilita input.
- **Page-offline**: mensaje "temporarily unavailable", no acepta queries.

Aislamiento obligatorio: retrieval scoped a `brand_id` + `consultant_id`; snapshot del vault por sesión.

## 3. Componentes de contenido

### Testimonials Block (consultant-authored, máx 5)
- `quote` (req, 30–250 chars) · `display_name` (req, "Jane D." — rechaza nombre completo) ·
  `role` (opc, máx 80 chars) · toggle show/hide · reordenable (drag-and-drop + controles a11y).
- Validación: sin teléfonos/emails/URLs. Se omite el bloque si no hay testimonials activos.

### Multi-Brand Comparison Card (read-only, hasta 3 marcas)
- Solo marcas del portafolio del consultor con vault `ready`. Selección por nombre + swatch del
  primary color (sin logos).
- Dimensiones: investment range (FDD) · franchise fee · royalty rate · territory availability ·
  link a cada BrandMePage. Sin dato → "Information not yet available".
- Móvil <768px: stacked, swipe + tap.

## 4. Consultant Portal (dashboard) — 5 áreas

1. **Home** — estados de páginas, lead activity (24h/7d/30d), KV ingest status, métricas de
   portafolio, activity feed (10), quick-links, retry banner, Setup Checklist, panel AMA reciente.
2. **Marketing** — gestión de BrandMePage, SEO bundle ("Content in Mass"), campaigns, headshot/bio,
   Testimonials, preview link. Secundarias como locked cards con "Unlock".
3. **Pipeline** — leads inbox (filtros All/Qualified/Soft/Spam, unread badges, acciones, transcript
   AMA, paginación 25), funnel summary, CRM contacts, deals (placeholder), calendar.
4. **Intelligence** — brand analytics, territory intelligence, resource library, AI Concierge (Build 11).
5. **Settings** — account (datos, address, email verificado, social profiles, credentials), billing
   (Stripe Portal), integrations, notifications, Terms.

Patrón común: nav consistente + área activa + breadcrumbs · placeholders "Coming in [Build]" ·
skeletons · errores inline con "Try again". Solo autenticado.

## 5. Onboarding del consultor (3 stages)

- **Stage 1 — ChatIntake** (público, formulario conversacional scripted, sin LLM): nombre, company,
  email (regex+MX), hasta 5 brands (URL req solo primary + backup opc), ≥1 territorio. Crea pending
  account → dispara Brand Extraction + Territory Intelligence + Agent 01.
- **Stage 2 — Password gate** (en la BrandMePage pre-renderizada): setear password activa cuenta y
  publica primary page → plan selection (Pro/Pro+) → Stripe Checkout (waiver $200 primeros 20 partners).
- **Stage 3 — Profile completion** (post-pago, en portal, chat style, skippable): (1) bio 50–500
  chars · (2) headshot · (3) social profiles · (4) credentials (afiliaciones, años, placements).
- Recovery: magic link a 24h (expira 48h) y 72h; setup-nudge a 72h si no hay headshot.
- Estados: Pending → Active_PreSub → Subscribed → Active_PostCancel.

## 6. Platform Admin Console — 7 áreas

1. **Consultants** (lista, detail, GDPR delete) · 2. **Agents** (monitoreo jobs, re-triggers,
escalación 4h) · 3. **Content** (brand template authoring, SEO review queue, Resource Library,
AMA fallback) · 4. **Rules & Config** (lead scoring, upsell, Visitor ID, plan limits, Config
Registry) · 5. **Brands** (invites de brand admin, analytics agregadas) · 6. **Catalog** (Other
Products) · 7. **System Health** (queues, errors, webhooks, cost/budget, Ops Alerts).

Dashboards: Brand Extraction Health · Platform Intelligence (KPIs, leaderboard, heatmap, GEO
citations, revenue) · Data Science/Predictive (churn, content, territory, brand-rec).

## 7. Brand Template Override (sistema de templates)

Templates **versionados, per-brand, admin-authored** que sobreescriben el output dinámico de
Brand Extraction:
- Al activar, su output = `BrandMePageConfig` para TODOS los consultores de esa marca.
- Editar = nueva versión (no sobrescribe); historial + restauración.
- Sin template activo → extracción dinámica (default). Desactivar → re-render de todas las páginas
  de la marca (<30s p75) + notificación.
- **Campos configurables:** visual (`primary_color`, `secondary_palette`, `typography_classification`,
  `header_style`) · content (`hero_headline`, `hero_subheadline`, `brand_overview_copy`,
  `value_proposition_bullets`) · voz (`brand_voice_descriptor`, `brand_voice_keywords`, `avoid_list`).
  Campos vacíos → fallback al output de extracción.
- ⚠️ **Los templates NO reordenan ni cambian la estructura de bloques** — solo overridean
  estilo/contenido/voz. Layouts alternativos seleccionables por el consultor: NO ESPECIFICADO.

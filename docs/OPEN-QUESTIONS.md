# BrandMe v0.3 — Preguntas abiertas, ambigüedades y riesgos

> Activo más valioso del análisis inicial. Combina el doc **9 - Open Questions Register** de Drive
> con las contradicciones, race conditions y gaps detectados al analizar los flujos.
> **Resolver lo bloqueante antes de implementar.** Fuente de verdad: `DRIVE-INDEX.md`.

## A. Decisiones del cliente pendientes (del doc 9)

### Bloqueantes inmediatos
- **Twilio A2P 10DLC** (Luis): registrar YA — 2–6 semanas de lead time. Bloquea SMS / Nurture.
- **Pricing sign-off** (Shawn): Pro $150 · Pro+ $250 · setup $200 — falta firma escrita.
- **Legal pre-launch** (Shawn + counsel): GDPR derechos del prospecto · retención 7 años Deal
  Vault · revisión de contenido IA (FTC Franchise Rule, Section 230, autorización IP).

### Selección de vendors (TBD)
- Mapas: **Google Maps API vs Mapbox** (pre-Build 8, Luis).
- News API: Newsdata.io / NewsAPI / GNews / Bing (pre-Build 8).
- RB2B: plan Starter ($79) vs Pro ($149) — validar volumen (Junior).
- ~~Voyage: confirmar voyage-3.5 vs voyage-4-large~~ → **Resuelto:** todo el acceso a modelos va
  por **OpenRouter** (chat + embeddings). Embeddings = **Qwen3 Embedding 8B**; chat = Sonnet 4.6 +
  Haiku 4.5. Se desvía del spec de Drive (Anthropic directo + Voyage). Estado de las verificaciones:
  - ✅ **Prompt caching vía OpenRouter:** confirmado (~90% ahorro en tokens cacheados).
  - ⏳ **Batch (~50%) vía OpenRouter:** pendiente confirmar disponibilidad para agentes batch.
  - ⏳ **Dims de pgvector:** fijar las dims de salida de Qwen3 (configurable) antes de crear el
    esquema. Cambiar modelo/dims después obliga a re-embedar todo el Knowledge Vault.
- People Data Labs: pricing + match rate (Junior).

### Contenido / copy (Shawn)
- 6 templates de nurture · setup checklist · GEO citation prompt set (50–100 queries) ·
  Resource Library seed · lead scoring weights · ZIP score weight profiles · AMA fallback message.

## B. Contradicciones en el spec

1. **Lead immutability vs progressive profiling re-score.** REQ-LCQ-008.2 dice que el lead record
   es inmutable tras la clasificación de Agent 07; REQ-PLP-003.2 dice que el re-score de profiling
   actualiza "el lead record más reciente". ¿Cuál manda? ¿Qué significa "más reciente"?

2. **Exa enrichment scope.** REQ-LCQ-010.4 ("solo Qualified") vs REQ-LCQ-006.1 ("qualified o
   soft"). El doc 1 lo resuelve (Exa solo Qualified, PDL ambos), pero verificar consistencia.

3. **ROI Calculator vs FDD confidence.** Solo se incluyen campos FDD "explicit"; el ROI Calculator
   "renderiza si hay FDD data". ¿"Hay data" = cualquier campo, o requiere investment_range? Si
   falta investment_range, el calculator no puede renderizar → posible contradicción.

4. **Snapshot del vault vs Incremental Sync.** El AMA bloquea snapshot al primer query; KVI
   actualiza el vault mientras hay sesiones activas. ¿Las sesiones ven contenido actualizado o
   stale? Sin reconciliar.

## C. Race conditions

1. **Enrichment + scoring + notificación.** El enrichment puede subir el score a Qualified justo
   después del first-touch como "soft" → el prospecto recibe dos emails seguidos. Orden no garantizado.
2. **Halt-on-reply vía Gmail polling.** Resend no tiene webhook inbound fiable → fallback a Gmail
   sync cada 15 min. Un nurture step puede enviarse hasta 15 min después de que el prospecto ya
   respondió. SLA de halt no especificado.
3. **Suppression list sync.** "Marcar unsubscribed Y añadir a suppression list simultáneamente"
   sin transacción compensatoria: si el segundo write falla → riesgo de violación CAN-SPAM.
4. **Multi-brand dedup + re-score.** Mismo contacto con leads en 2 brands del mismo consultor:
   ¿cuál score prevalece en el contact? ¿Cuál lead es "el más reciente"?
5. **Unsubscribe + step send simultáneos.** Si el scheduler dispara antes de actualizar la
   suppression list, el step se envía. Alcance de la idempotencia (¿halt solo, o halt + skip?) sin definir.

## D. Specs faltantes / incompletas

- **Agent 05 (SEO programático):** referenciado, sin doc de spec completo. Genera ~500 páginas
  por brand por consultor. ¿Cómo reconcilia multi-consultor sobre el mismo brand/territorio?
- **Agent 06:** mencionado en KV (FAQ enrichment), sin spec propio.
- **Knowledge Vault Incremental Sync (KVI):** referenciado (SHA-256), sin doc de requisitos.
- **Campaign Management (Build 11)** y **Prospect Re-Engagement Agent (Build 10):** aspiracionales,
  sin specs de implementación.
- **Territory data layer:** ¿quién/dónde popula los focus markets del consultor? No especificado.
- **Brand admin:** ¿puede flag contenido inexacto o pedir takedowns? ¿Se le notifica el scrape?

## E. Duplicado confirmado
- **Docs 29 y 30 (Lead Capture & Qualification)** son prácticamente idénticos (mismo numbering
  REQ-LCQ-001…010). Tratar como una sola spec; confirmar con el cliente cuál es canónico.

## F. Gaps no especificados (varios)
- LLM extraction failure path (Firecrawl OK pero LLM devuelve basura): ¿retry? ¿fallback?
- Límites de tamaño: cache por brand, chunks por vault, bytes de storage.
- SLA del job de deletion (auto-rejected PII a los 30/90 días): ¿hourly? ¿diario?
- TCPA: re-habilitar SMS manualmente sin re-recolectar consentimiento — ¿legal?
- Deal value $0: confirmación explícita requerida; comportamiento ante refresh sin definir.
- Slug conflict post-publicación si se añade una ruta de plataforma nueva.
- Uptime SLA, comportamiento ante fallo del auth provider, DR/backup RTO/RPO, cadencia de
  security testing — todos marcados como brechas de cobertura en el doc 9.

# BrandMe v0.3 — Flujos clave

> Síntesis de los docs de flujos (18, 19, 20, 21, 29/30, 31, 34, 35, 51, 58, 59) de Drive.
> Fuente de verdad: ver `DRIVE-INDEX.md`. Lee el doc original antes de implementar.

## 1. Onboarding → Generación

```
Consultor envía URL de marca (Stage 1)
   ↓
Agent 02 — Brand Extraction (SÍNCRONO, bloqueante, ~30 min p75)
   ├─ Firecrawl: homepage + 4 páginas internas (máx 5, 30s c/u)
   ├─ LLM: identity tokens (color, tipografía) + content signals (voz, FAQ, vertical)
   ├─ Datos FDD si existen (investment range, AUV, royalty…) con confidence (explicit/inferred/absent)
   └─ Validación: ≥3 señales pasan threshold → full payload; <3 → graceful degradation
   ↓ (dispara en PARALELO, async — objetivo: job runner tipo Trigger.dev; hoy síncrono en el request)
   ├─ Agent 04 — BrandMePage Generation (async)
   ├─ Agent 03 — Knowledge Vault ingestion (async, ~10 min p75)
   └─ Email "BrandMePage ready" + preview link (14 días, noindex)
   ↓
Stage 2 — Consultor reclama página → estado Published → plan + Stripe checkout
```

**SLA total:** 45 min p75 (extracción + generación).
**Dependencias:** Agent 02 es bloqueador global (Agent 03, 04, 05, 09 esperan su payload).

## 2. Brand Extraction + caché compartido

- **Caché compartido** (DEFERRED a Build 6+): cuando un 2º consultor desbloquea la misma marca,
  cache hit → reutiliza tokens/señales, sin scrape ni LLM (costo $0). Efecto GEO compuesto.
- **Invalidación:** TTL 30 días · hash SHA-256 del HTML scrapeado · invalida inmediato si brand
  admin sube assets al Brand Content Hub o admin re-dispara extracción.
- **Cleanup:** último consultor removido → deletion en 30 días (grace period).

## 3. Knowledge Vault (Agent 03)

- **3 capas:** base compartida (extracción) · tenant-aditiva (Brand Content Hub, versionada) ·
  tenant-aislada (AI Concierge, nunca compartida).
- **Chunking:** 512 tokens, overlap 64, boundary detection en frases / secciones (FDD, FAQ).
  Metadata por chunk: brand_id, source_url, content_source_type, position, embedding_model, ts.
- **Embeddings:** Qwen3 Embedding 8B vía OpenRouter → vector DB (pgvector, **pendiente** — RAG no implementado aún).
- **Retrieval:** similarity threshold 0.75, top-K 5 (configurable). Admin chunks > extraction chunks.
- **Estados:** empty → ingesting → ready (→ error). Rebuild si crecimiento ≥25% o 90 días.

## 4. AMA Widget (runtime, Agent 03)

```
Prospecto pregunta
   ↓ retrieval scoped a brand_id + consultant_id, top-5 chunks (cos ≥0.75)
   ↓ snapshot del vault bloqueado al inicio de sesión
   ↓ inferencia (Sonnet/Haiku): system prompt "responde SOLO del Knowledge Vault"
   │   + últimos 8 turns + disclaimer financiero si hay datos FDD
   ↓ streaming (first token 1.5s p50; respuesta 2s p50 / 3s p95 / 6s p99)
   ↓ si chunks < threshold o vault no ready → fallback (SIEMPRE con CTA de conversión)
```

- **Handoff a lead capture:** ≥5 queries o patrón high-intent (investment / application / territory).
- **Límites:** 20 turns/sesión, 30 queries/sesión, 100 queries/IP/hora. Sin memoria entre sesiones.
- **Anti-alucinación (gate antes de Build 4):** grounding eval (100% investment grounded, 90%+
  overall, 100% out-of-scope → fallback) + suite adversarial (injection, role-play, prompt
  extraction → 0% compliance).
- **PII:** el texto de la pregunta NUNCA se loguea; solo metadata.

## 5. BrandMePage (Agent 04)

- **7 bloques siempre:** Hero · Brand overview · Value prop · FAQs · Consultant profile ·
  Lead capture form · AMA Widget.
- **5 condicionales:** Credentials · ROI Calculator (si FDD) · Territory Availability · Booking
  (Build 10) · Portfolio Navigation.
- **Constraints:** sin earnings garantizados · máx 5 palabras consecutivas del site original ·
  Flesch-Kincaid grado 8–10 · tono = brand voice descriptor.
- **URL:** `getbrandme.ai/[consultant-slug]/[brand-slug]` (+ `/[zone-slug]` para SEO).
- **Lifecycle:** Draft → Published → (Stale↔Regenerating) → Offline/Archived → Gone (410, día 90).
- **Re-render:** cambios de perfil/portfolio → enqueue <30s p75.

## 6. Captura de lead + scoring (Agent 07)

```
Entrada: Lead form O AMA handoff
   ↓ anti-spam (honeypot + rate limit 10/IP/60min → 429)
   ↓ Agent 07 — Intent Scoring
   │   ≥55 = Qualified · 0–54 = Soft · <0/spam = Auto-rejected
   ↓ Notificación consultor <60s p95 · Email first-touch <5 min p95 (AMBOS sí o sí)
   ↓ Enqueue Nurture steps 2–5
   ↓ Enrichment ASYNC (People Data Labs + Exa) — NO bloquea first-touch
       └─ re-score; si sube a ≥55 → "Lead upgraded to Qualified" (no re-dispara nurture)
```

### Pesos de scoring (configurables, sin deploy)
| Señal | Puntos |
|-------|--------|
| Capital match ($150k+) | +30 |
| In-territory | +25 |
| AMA sustained (5+ queries) | +20 |
| Timeline ≤6 meses | +20 |
| Timeline 7–12 meses | +10 |
| Prior business ownership | +15 |
| Executive signal (Director+) | +10 |

### Deduplicación
- Mismo email + consultor + brand → UPDATE lead. · + brand distinta → CREATE lead, mismo contact.
- Distinto consultor → CREATE independiente (aislamiento de tenant).

## 7. Progressive Lead Profiling (Agent referenciado)
- Recolecta info en 2–3 visitas (no mega-form). Detección privacy-first: sessionStorage + `plp_cid`
  (hash one-way del contact_id), **sin cookie persistente**.
- Trigger: 30s de viewport activo. Cada respuesta → update contact + re-score.
- Suppression: dismiss 1× → 7 días; 3× → permanente.

## 8. Multi-step Nurture (Agent 08, Build 10)

| Step | Timing | Canal |
|------|--------|-------|
| 1 | ~5 min post-qual | Email (first-touch) |
| 2 | +24h | Email o SMS |
| 3 | +72h | Email o SMS |
| 4 | +7 días | Email |
| 5 | +30 días | Email |

- **Halt-on-action (determinístico):** contact marcado "contacted" · deal avanza más allá de
  Qualified · deal Signed · prospecto responde · unsubscribe / STOP. Idempotente con timestamp.
- **AI-assisted:** Haiku al enviar, timeout 5s → fallback a template estático.
- **SMS (Pro+ $20/mes):** solo si opt-in (TCPA). A2P 10DLC = HARD GATE antes de Build 10.
- **Gate CAN-SPAM:** sin dirección física en Settings → emails BLOQUEADOS.

## 9. CRM Contacts + Pipeline

- **Auto-create:** lead → contact (1:1), lifecycle "lead", marketing_opt_in true.
- **Lifecycle:** lead → qualified → contacted → opportunity → customer / lost.
- **Platform Intent Score** (≠ Agent 07): comportamental 0–100 (sesiones AMA, opens, clicks,
  visitas), update <60s del evento.
- **Pipeline kanban:** New → Qualified → FDD Sent → Discovery → Signed (→ Deal Vault) / Lost.
  Notas con ventana de edición de 5 min, luego inmutables.

<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-32

**Work Order:** WO-32 — Build 1 — Product Security (CORS, file validation, injection baseline)
**Created At (UTC):** 2026-07-09T13:22:00Z

## Summary

Capacidades de seguridad transversales del in-scope del WO: (1) `FileUploadValidator` — detección de content-type server-side por magic bytes contra la lista permitida por surface (ConfigStore), NUNCA el MIME declarado; cableado al único intake de archivos actual (imágenes data-URL de generate) como chokepoint desde hoy (AC-SEC-006.1/.2). (2) `PromptInjectionFilter` — baseline compartido en ConfigStore (4 categorías AC-SEC-011.1), las surfaces EXTIENDEN pero jamás estrechan (la API no permite quitar); gate síncrono cableado a agent/chat (superficies free-text existentes); AMA/Concierge = out of scope declarado. (3) `CorsController` — allowlist EP-07 (getbrandme.ai + subdominios), sin wildcard en endpoints autenticados; aplicado en tenantRoute (origen cross no permitido → 403 sin datos, permitido → headers + Vary). (4) Headers de seguridad: HSTS gana `preload` (AC-SEC-002.2) + CSP enforcing para las páginas HTML de la app (allowlist calcada de la de /p/[slug], probada con contenido LLM; unsafe-inline documentado: hydration de Next + Tailwind + preview srcdoc que HEREDA la CSP del padre) — verificados por spec e2e que será parte del merge gate (WO-34, ADR-001). (5) `SecurityIncidentLog` — tabla append-only (trigger que bloquea UPDATE/DELETE incluso al owner + GRANTs sin UPDATE/DELETE), receptor de rechazos de upload spoofed e inyecciones detectadas. EXTRA barato de la composición del feature blueprint: scrub de patrones de credenciales en ObservabilityWrapper (AC-SEC-004.2).

**Fuera de scope (declarado):** SecretRotationTracker y presigned TTLs (StorageService=WO-10); lockouts/sesiones Firebase (WO-5); dependency scanning y CI (WO-34); PostHog (el evento adversarial se registra en SecurityIncidentLog como sustituto documentado hasta PostHog); pen-test/procesos (owner humano).

## Code Reuse And Package Structure

**Reuso:** ConfigStore (allowlists/patrones/formats) · withSystemContext/db() · emitOpsAlert/scrubPii (WO-8) · patrón CSP de p/[slug] · tenantRoute (punto único de endpoints autenticados).

**Nuevos:** `src/lib/security/file-upload-validator.ts` · `src/lib/security/prompt-injection-filter.ts` · `src/lib/security/cors.ts` · `src/lib/security/incident-log.ts` · `drizzle/0008_security.sql` · `tests/db/security.test.ts` · `e2e-validator/tests/security/{headers,chokepoints}.spec.ts`.

**Modificados:** `src/middleware.ts` (preload + CSP HTML app) · `src/lib/api/tenant-route.ts` (CORS) · `src/app/api/generate/route.ts` (validación de imágenes) · `src/app/api/agent|chat/route.ts` (filtro de inyección + fallback) · `src/lib/observability/observability.ts` (scrub de credenciales).

## Steps

1. RED: tests/db/security.test.ts (magic bytes vs MIME spoofed; formats por surface de config; baseline merge no-narrow; detección 4 categorías; incident log INSERT-only — UPDATE/DELETE fallan incluso como migrator; CORS allowlist + subdominios + no-wildcard; scrub de credenciales).
2. GREEN: 0008 + los 4 módulos de security + scrub en observability.
3. Wiring: generate (imágenes), agent/chat (filtro), tenantRoute (CORS), middleware (preload+CSP).
4. E2E: headers.spec (presencia/valores en / y /api — el gate anti-drift de ADR-001) + chokepoints.spec (@COV_SEC_001.1 nivel integración: MIME spoofed rechazado antes de cualquier write; .2: intentar "quitar" un patrón del baseline no lo quita) + regresión completa.
5. Review → commit → in_review → issue #7.

## Testing

`pnpm test:db` · `pnpm test` · `pnpm test:e2e` (14 specs) · `pnpm tsc --noEmit` · `pnpm build` · exploratorio: curl de headers y del filtro en /api/agent.

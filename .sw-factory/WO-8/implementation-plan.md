<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-8

**Work Order:** WO-8 — Build 1 — Observability Wrapper (error capture + EP-04 tags)
**Created At (UTC):** 2026-07-09T13:02:00Z

## Summary

Interfaz canónica única de captura de errores (REQ-PF-008/EP-04): `captureError` con tags EP-04 automáticos derivados de contexto (AsyncLocalStorage propio: surface, consultant, agent, model alias, role — los callers JAMÁS los setean a mano), scrubbing de PII (emails/teléfonos por patrón; sobre-scrub aceptado a favor de privacidad) y alerta por tasa en rutas críticas (umbral EP-07 en ConfigStore). Backend conectable via `ObservabilitySink`: default = log estructurado; **Sentry queda como target documentado que se enchufa cuando exista SENTRY_DSN (infra del usuario) — honestidad técnica: sin DSN no afirmamos "usar Sentry" ni añadimos el SDK sin poder verificarlo**. Los ~29 `console.error` de rutas migran a `captureError`.

## Code Reuse And Package Structure

**Reuso:** patrón ALS de tenant-context (WO-3) · ConfigStore (WO-7) para el umbral · integración en tenantRoute/invokeLLM/handleWebhook ya existentes.

**Nuevos:** `src/lib/observability/observability.ts` · `drizzle/0007_observability_config.sql` (seed umbral) · `tests/db/observability.test.ts` · `e2e-validator/tests/platform/observability.spec.ts`.

**Modificados:** `src/lib/api/tenant-route.ts` (contexto surface+consultant+role automático) · `src/lib/ai/llm-wrapper.ts` (contexto agent+model_alias) · `src/lib/webhooks/handler.ts` (contexto surface webhook-vendor + captureError) · ~29 call-sites `console.error("[x] msg", err)` → `captureError(err, "[x] msg")` en src/app.

## Components And Flow

```ts
withObservabilityContext(tags: Partial<ObservabilityTags>, fn)  // merge con el padre (ALS)
captureError(err: unknown, note?: string): void                 // tags automáticos + scrub + sink + rate-alert
setObservabilitySink(sink) / consoleSink (default)              // Sentry = adapter futuro (SENTRY_DSN)
```

Alerta por tasa: contador por surface en ventana fija 60s en memoria; umbral `observability.error_rate_threshold_per_min` (default 10, seed 0007); una alerta por ventana vía sink.alert (chequeo async fire-and-forget — captureError se mantiene síncrono para los catch).

Fuera de scope (del WO): PostHog; destino de alertas (infra). El monitor de disponibilidad de Firebase Auth (blueprint) pertenece a WO-5 — anotado.

## Steps

1. RED: tests/db/observability.test.ts (tags automáticos+merge, scrub email/tel en message/stack/note, umbral de config → alerta exactamente 1×/ventana, sin contexto → tags vacíos sin crash).
2. GREEN: observability.ts + 0007.
3. Integraciones (tenantRoute/invokeLLM/handleWebhook) + sweep de console.error (script + verificación tsc archivo a archivo).
4. E2E observability.spec.ts (@COV_PF_OBS_001.1, nivel integración con sink fake — documentado: el payload capturado no es legible vía HTTP; el wiring real lo cubren los tests de integración).
5. tsc/unit/db/e2e/build → review → commit → in_review.

## Testing

`pnpm test:db` · `pnpm test` · `pnpm test:e2e` (10 specs) · `pnpm tsc --noEmit` · `pnpm build`.

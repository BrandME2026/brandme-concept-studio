<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-11

**Work Order:** WO-11 — Build 1 — Sitemap Service + Crawler Policy (SEO infra)
**Created At (UTC):** 2026-07-09T14:45:00Z

## Summary

Completa la infraestructura SEO de Build 1: (1) `CrawlerPolicyHandler` — robots.txt con la política EXACTA de REQ-PF-011: allow para los 8 AI-search crawlers (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-User, Claude-SearchBot, Applebot, Bingbot — Bingbot NUNCA en la disallow list: alimenta Bing clásico y el grounding de SearchGPT/Copilot), disallow para los 7 AI-training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent, Bytespider), directiva Sitemap (ya existía) y las rutas privadas actuales. (2) `SitemapService` — el sitemap YA es dinámico y lee `published` en runtime con el paywall gate (WO-32): la inclusión es síncrona en efecto (una página publicada aparece en el SIGUIENTE fetch del sitemap, sin batch ni paso manual — contrato ADR-001 satisfecho); se verifica end-to-end con el flujo real de publish.

**Pendientes documentados (infra/Build 6, no de este WO):** registro del sitemap en GSC y Bing Webmaster + IndexNow (AC-PF-013.3/.4/.5) requieren la conexión autenticada del Admin Console (REQ-PAC-001.5, Build 6) y dominio productivo; AC-PF-011.4 (verificación de user-agents en staging) es gate humano del kickoff de Build 4.

## Code Reuse And Package Structure

**Reuso:** `src/app/sitemap.ts` (dinámico + paywall gate de WO-32) · flujo publish real (WO-3) · harness e2e.
**Modificados:** `src/app/robots.ts` (política de crawlers).
**Nuevos:** `e2e-validator/tests/platform/seo-infra.spec.ts` (@COV_PF_SEO_001.1/.2).

## Steps

1. robots.ts con las 3 reglas (search-allow / training-disallow / genérica con privados).
2. E2E: .1 flujo REAL — seed de generation sin publicar + suscripción activa + sesión mapeada → POST /api/publish con la cookie → el slug aparece en /sitemap.xml inmediatamente (y NO estaba antes). .2 robots.txt con ambas listas completas + Sitemap.
3. Suites completas + review → commit → in_review → issue GitHub.

## Testing

`pnpm test:e2e` (19 specs) · regresión `pnpm test:all` · verificación manual de robots.txt en el pase exploratorio.

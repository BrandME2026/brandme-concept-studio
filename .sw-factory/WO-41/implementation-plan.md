<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-41

**Work Order:** WO-41 — Build 1 — Agent Skills & Platform Discoverability Content (llms.txt)
**Created At (UTC):** 2026-07-09T15:05:00Z

## Summary

Entrega el MECANISMO de la capa de discoverability para AI (blueprint d718975b), respetando los gates humanos del requirement: (1) `LlmsTxtGenerator` — llms.txt renderiza el status por fase leyendo `discoverability.platform_phase` de ConfigStore (REQ-SKL-002: closed_development | friendly_beta | public_mvp; cambia sin deploy) en la sección "Instructions for AI Agents", + sección "Developer Access" (el manifest MCP llega en Build 11 — placeholder '#' como MANDA el doc de contenido). Sección Pricing OMITIDA en su totalidad (AC-SKL-003.3: sin Registry no se renderizan valores en blanco — el Registry es Build 6). (2) `SkillFileServer` — mecanismo en `/.well-known/skills/` (rewrite en next.config: Next ignora dot-folders en el router): `index.json` con la lista de skills DISPONIBLES por fase — vacía en closed_development (las 5 features que documentan no existen aún y el contenido tiene gate de review Shawn/Luis pre-Build 9); los .md → 404 hasta el flip de fase. (3) `CrawlerAccessLogger` — REQ-SKL-001: cada GET a llms.txt / skills se registra (path, user-agent crudo + clasificado contra patrones EP-07, referrer) fire-and-forget con errores a observability; el dashboard del Admin Console es Build 6.

## Code Reuse And Package Structure

**Reuso:** ConfigStore · withSystemContext/db() · captureError · ruta llms.txt existente (se extiende) · runner de migraciones.
**Nuevos:** `src/lib/discoverability/{platform-phase,crawler-log}.ts` · `src/app/api/discoverability/skills/[[...path]]/route.ts` · `drizzle/0009_discoverability.sql` · `tests/db/discoverability.test.ts` · `e2e-validator/tests/platform/discoverability.spec.ts`.
**Modificados:** `src/app/llms.txt/route.ts` · `next.config.ts` (rewrite /.well-known/skills) · `src/lib/api/route-manifest.ts`.

## Steps

1. 0009: tabla `crawler_access_logs` (plataforma, sin RLS, GRANT SELECT+INSERT) + seeds `discoverability.platform_phase` y `discoverability.known_crawlers` (patrones EP-07).
2. platform-phase.ts (getter validado + statements por fase) y crawler-log.ts (clasificación + insert fire-and-forget).
3. llms.txt extendido + skills route + rewrite + manifest.
4. Tests db (fase default/validación, logger clasifica y persiste) + e2e (@COV_ASK_001.1: el statement refleja la fase y CAMBIA al actualizar config sin deploy; Developer Access presente; index.json por fase; hit loggeado con crawler clasificado).
5. Suites + review → commit → in_review → issue.

## Testing

`pnpm test:db` · `pnpm test:e2e` (21 specs) · `pnpm tsc --noEmit` · `pnpm build` · exploratorio curl.

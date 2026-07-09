<!--lint disable strong-marker-->

# Work Order Entity Index: WO-5

**Initialized At (UTC):** 2026-07-09T15:31:39Z
**Current Status:** implemented — 185/185 Vitest + 23/23 E2E; en review

## Work Order

- WO-5: Build 1 — Firebase Auth Adapter + Account State Machine (`a4d9346d-da8d-4fd8-92c3-4e82348d712e`)

## Requirements

- Platform Foundation (`58afc8ff-d877-409a-a3f1-b2b234a8713d`) — ADR-002 Firebase Auth; lifecycle AccountStateMachine

## Blueprints

- AccountStateMachine (`1a85d215-68d1-472a-b4f9-de0e5ee2ac1b`)
- FirebaseAuthAdapter (`a3e6c964-7aa5-42b9-8047-aefbb844ac4f`)

## Referenced Blueprints

Blueprints reached through `@…` mentions and links while reading linked blueprints.

- TenantIsolationLayer (`f4fa0000-531a-4f5d-91e5-eba0452dede2`) — destino de consultant_id (WO-3, ya implementado)
- WebhookHandlerPrimitive — vía de las señales Stripe (WO-6, ya implementado); el routing del
  password-set por el primitivo requiere un sender (GCIP blocking functions) que no existe aún —
  gap documentado en implementation-plan.md; la señal real hoy es el link verificado

## Delivery

- Branch: 8080juniora
- Pull Request URL: (sin PR — flujo de commits directos autorizado por el usuario)
- Issue: https://github.com/BrandME2026/brandme-concept-studio/issues/14

## Estado de partida clave (verificado en esta ejecución)

- Proyecto Firebase REAL `brandme-5551f` en `.env.local` (7 vars); provider Email/Password
  HABILITADO (signup REST probado en vivo antes de escribir código).
- Verificación JWKS server-side ya existente (`src/lib/auth/verify-token.ts`) — se reusa tal cual.
- El "blocker de infra Firebase" que mantenía este WO en blocked era FALSO (el .env.local
  gitignored nunca se había inspeccionado).

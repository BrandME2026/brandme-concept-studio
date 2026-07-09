import { test, expect } from "@playwright/test";
import { APP_DB_URL } from "../../db-urls";

/**
 * COV_PF_OBS_001: Error Capture — @platform @observability (P2)
 *
 * Nivel de integración: se ejercita el ObservabilityWrapper REAL con un sink
 * fake (el payload capturado va al backend de monitoreo, no es legible vía
 * HTTP — el wiring de rutas lo cubren los tests de integración y el sweep de
 * captureError en los handlers). El umbral de alerta viene de la DB real.
 */

process.env.DATABASE_URL = APP_DB_URL;
process.env.CONFIG_CACHE_TTL_MS = "1000";

import {
  captureError,
  setObservabilitySink,
  withObservabilityContext,
  __resetObservabilityForTests,
  type CapturedError,
} from "../../../src/lib/observability/observability";

test("@COV_PF_OBS_001.1 @platform @observability — el error capturado lleva tags EP-04 y cero PII", async () => {
  __resetObservabilityForTests();
  const captured: CapturedError[] = [];
  setObservabilitySink({ capture: (p) => captured.push(p), alert: () => {} });

  // Error "manejado" en un request con contexto conocido (lo que haría un
  // handler envuelto por tenantRoute + invokeLLM).
  const err = new Error(
    "No se pudo notificar a maria.lopez@clientes.mx (tel +52 55 8765 4321)",
  );
  withObservabilityContext(
    { surface: "/api/generate", consultant_id: "c-e2e-1", role: "consultant" },
    () =>
      withObservabilityContext({ agent_id: "agent-04", model_alias: "large" }, () =>
        captureError(err, "fallo generando para maria.lopez@clientes.mx"),
      ),
  );

  expect(captured).toHaveLength(1);
  const payload = captured[0];

  // EP-04 completo, derivado del contexto (jamás seteado por el caller).
  expect(payload.tags).toEqual({
    surface: "/api/generate",
    consultant_id: "c-e2e-1",
    role: "consultant",
    agent_id: "agent-04",
    model_alias: "large",
  });

  // Cero PII: ni email, ni teléfono (nombres: defensa estructural — los
  // mensajes de error no incluyen campos de usuario; ver blueprint/review).
  const all = JSON.stringify(payload);
  expect(all).not.toContain("clientes.mx");
  expect(all).not.toContain("8765");
  expect(all).toContain("[email]");
  expect(all).toContain("[tel]");
});

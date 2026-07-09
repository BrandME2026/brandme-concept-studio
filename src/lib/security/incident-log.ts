import { randomUUID } from "node:crypto";
import { db, withSystemContext } from "@/lib/db/tenant-context";
import { isDbConfigured } from "@/lib/db/client";
import { captureError } from "@/lib/observability/observability";

/**
 * SecurityIncidentLog (WO-32, REQ-SEC-010): registro append-only de incidentes
 * de seguridad confirmados o sospechados. La tabla bloquea UPDATE/DELETE por
 * trigger para TODO rol (drizzle/0008); exenta de retención. Receptores:
 * PromptInjectionFilter (detecciones), FileUploadValidator (uploads spoofed),
 * rotaciones de secrets (proceso, futuro) y entradas manuales (Admin Build 6).
 */

export type IncidentType =
  | "unauthorized_access"
  | "credential_exposure"
  | "dependency_exploit"
  | "abnormal_access_pattern"
  | "prompt_injection"
  | "upload_rejected"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface SecurityIncident {
  type: IncidentType;
  severity: IncidentSeverity;
  surface?: string;
  /** SIN PII ni contenido de usuario: categorías, longitudes, conteos, ids técnicos. */
  detail?: Record<string, unknown>;
}

/**
 * Registra un incidente. Fail-soft deliberado: el log de seguridad jamás debe
 * tumbar el request path (el fallo se reporta a observabilidad).
 */
export async function recordSecurityIncident(incident: SecurityIncident): Promise<string | null> {
  if (!isDbConfigured()) return null;
  const id = randomUUID();
  try {
    await withSystemContext("security-incident", async () => {
      await db().query(
        `INSERT INTO security_incidents (id, incident_type, severity, surface, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          incident.type,
          incident.severity,
          incident.surface ?? null,
          JSON.stringify(incident.detail ?? {}),
        ],
      );
    });
    return id;
  } catch (err) {
    captureError(err, "[security] no se pudo registrar el incidente");
    return null;
  }
}

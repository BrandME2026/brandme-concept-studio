import { getConfigValue } from "@/lib/config/config-store";
import { recordSecurityIncident } from "./incident-log";

/**
 * FileUploadValidator (WO-32, REQ-SEC-006 / blueprint e6671a3e): chokepoint
 * obligatorio entre CUALQUIER upload y el almacenamiento. Detección de
 * content-type server-side por MAGIC BYTES — el MIME declarado por el cliente
 * jamás se usa como gate — contra la lista permitida por surface (EP-07:
 * security.upload_formats_<surface>).
 *
 * Surface actual: imágenes data-URL del studio (generate). Cuando exista
 * StorageService (WO-10), ninguna escritura de upload podrá saltarse este
 * validador (contrato ADR-003 del feature blueprint).
 */

export interface UploadValidation {
  ok: boolean;
  /** Content-type REAL detectado por magic bytes (null = desconocido). */
  detected: string | null;
  /** MIME declarado por el cliente (informativo; nunca es el gate). */
  declared: string | null;
  error?: string;
}

const MAGIC: Array<{ type: string; check: (b: Uint8Array) => boolean }> = [
  { type: "image/png", check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  {
    type: "image/webp",
    check: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  { type: "application/pdf", check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];

/** Content-type real a partir de los primeros bytes (magic bytes). */
export function detectContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  for (const magic of MAGIC) {
    if (magic.check(bytes)) return magic.type;
  }
  return null;
}

/**
 * Valida un upload contra la lista permitida de su surface. Rechaza sin
 * almacenar nada; el rechazo por spoofing (declarado ≠ detectado) queda en el
 * SecurityIncidentLog.
 */
export async function validateUpload(input: {
  surface: string;
  bytes: Uint8Array;
  declaredMime?: string | null;
}): Promise<UploadValidation> {
  const permitted = await getConfigValue<string[]>(
    "security",
    `upload_formats_${input.surface}`,
    [],
  );
  const declared = input.declaredMime ?? null;
  const detected = detectContentType(input.bytes);

  if (permitted.length === 0) {
    return {
      ok: false,
      detected,
      declared,
      error: `Surface de upload sin lista de formatos configurada: ${input.surface}`,
    };
  }
  if (!detected || !permitted.includes(detected)) {
    void recordSecurityIncident({
      type: "upload_rejected",
      severity: "low",
      surface: input.surface,
      detail: {
        detected,
        declared,
        spoofed: Boolean(declared && detected && declared !== detected),
        size: input.bytes.length,
      },
    });
    return {
      ok: false,
      detected,
      declared,
      error: `Tipo de archivo no permitido (detectado: ${detected ?? "desconocido"}; permitidos: ${permitted.join(", ")})`,
    };
  }
  return { ok: true, detected, declared };
}

const DATA_URL_RE = /^data:([^;,]+)?(;base64)?,/;

/**
 * Valida una imagen que llega como data URL (el intake actual del studio).
 * Decodifica solo la cabecera necesaria para los magic bytes.
 */
export async function validateDataUrlImage(
  dataUrl: string,
  surface: string,
): Promise<UploadValidation> {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) {
    return { ok: false, detected: null, declared: null, error: "data URL malformada" };
  }
  const declared = match[1] ?? null;
  const isBase64 = Boolean(match[2]);
  const payloadStart = dataUrl.indexOf(",") + 1;
  const head = dataUrl.slice(payloadStart, payloadStart + 64); // sobra para 12 bytes
  let bytes: Uint8Array;
  try {
    bytes = isBase64
      ? Uint8Array.from(Buffer.from(head, "base64"))
      : new TextEncoder().encode(decodeURIComponent(head));
  } catch {
    return { ok: false, detected: null, declared, error: "payload de data URL indecodificable" };
  }
  return validateUpload({ surface, bytes, declaredMime: declared });
}

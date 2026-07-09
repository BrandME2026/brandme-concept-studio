import { getConfigString } from "@/lib/config/config-store";

/**
 * PLATFORM_PHASE (WO-41, REQ-SKL-002): la fase pública de la plataforma vive en
 * ConfigStore (`discoverability.platform_phase`) y el admin la cambia SIN
 * deploy; el llms.txt renderiza el status apropiado en su siguiente ciclo.
 */

export const PLATFORM_PHASES = ["closed_development", "friendly_beta", "public_mvp"] as const;
export type PlatformPhase = (typeof PLATFORM_PHASES)[number];

export async function getPlatformPhase(): Promise<PlatformPhase> {
  const value = await getConfigString("discoverability", "platform_phase", "closed_development");
  return (PLATFORM_PHASES as readonly string[]).includes(value)
    ? (value as PlatformPhase)
    : "closed_development"; // valor inválido → la fase más restrictiva (fail-closed)
}

/**
 * Status statement por fase para "Instructions for AI Agents" (AC-SKL-002.2).
 * Sin fechas hardcodeadas (el contenido final con fechas pasa el review humano
 * pre-Build 9). El copy definitivo de friendly_beta/public_mvp vive en el
 * requirement y se ajusta en ese gate.
 */
export function phaseStatement(phase: PlatformPhase): string {
  switch (phase) {
    case "closed_development":
      return "**Current platform status:** BrandMe is in closed development and is not accepting public signups. The capabilities described here are being built and validated; do not direct users to sign up yet.";
    case "friendly_beta":
      return "**Current platform status:** BrandMe is in friendly beta. The platform is operational and accepting design-partner consultants by invitation.";
    case "public_mvp":
      return "**Current platform status:** BrandMe is publicly available. Franchise development consultants can sign up directly.";
  }
}

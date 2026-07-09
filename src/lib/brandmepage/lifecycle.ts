import { getConfigValue } from "@/lib/config/config-store";
import { db, withSystemContext } from "@/lib/db/tenant-context";
import { getPageState, transitionState } from "./store";
import type { PageState } from "./types";

/**
 * ApprovalGateway (WO-15, REQ-BPG-015 / ADR-004): controla Draft →
 * Pending_Approval | Published según brandmepage.approval_required (default
 * true). Los re-renders NO pasan por el gate (salvo edits retenidos por el
 * ContentQualityFilter — eso lo maneja quality-filter/overrides). Todas las
 * transiciones van por transitionState (trigger single-writer).
 *
 * Notificaciones (emails/in-portal) llegan con Build 6 — los ESTADOS que esas
 * superficies leen quedan persistidos aquí.
 */

export async function approvalRequired(): Promise<boolean> {
  return getConfigValue<boolean>("brandmepage", "approval_required", true);
}

/** Trigger de publicación (checkout Stage 2 / unlock de brand secundario). */
export async function triggerPublication(
  pageId: string,
): Promise<Extract<PageState, "published" | "pending_approval"> | null> {
  return withSystemContext("bmp-lifecycle", async () => {
    const gated = await approvalRequired();
    const target = gated ? ("pending_approval" as const) : ("published" as const);
    const applied = await transitionState(pageId, ["draft"], target);
    return applied ? target : null;
  });
}

/** Aprobación del admin en la cola (AC-BPG-015.3). */
export async function approvePage(pageId: string): Promise<boolean> {
  return withSystemContext("bmp-lifecycle", () =>
    transitionState(pageId, ["pending_approval"], "published"),
  );
}

/** El admin pide cambios → vuelve a Draft para revisión (AC-BPG-015.4). */
export async function requestChanges(pageId: string): Promise<boolean> {
  return withSystemContext("bmp-lifecycle", () =>
    transitionState(pageId, ["pending_approval"], "draft"),
  );
}

/**
 * Al deshabilitar el flag (AC-BPG-015.6): TODO lo pendiente se auto-aprueba —
 * jamás queda varado. Devuelve cuántas páginas publicó.
 */
export async function applyApprovalFlagDisable(): Promise<number> {
  return withSystemContext("bmp-lifecycle", async () => {
    const { rows } = await db().query<{ id: string }>(
      `SELECT id FROM brandme_pages WHERE state = 'pending_approval'`,
    );
    let published = 0;
    for (const row of rows) {
      if (await transitionState(row.id, ["pending_approval"], "published")) published++;
    }
    return published;
  });
}

/** Option C de degradación (comportamiento del requirement): published → offline. */
export async function takePageOffline(pageId: string): Promise<boolean> {
  return withSystemContext("bmp-lifecycle", () =>
    transitionState(pageId, ["published"], "offline"),
  );
}

/** Resolución de Option C: offline → draft (listo para re-publicar). */
export async function restoreOfflineToDraft(pageId: string): Promise<boolean> {
  return withSystemContext("bmp-lifecycle", () => transitionState(pageId, ["offline"], "draft"));
}

export { getPageState };

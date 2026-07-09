import { db, withSystemContext, withTenant } from "@/lib/db/tenant-context";
import { disallowedTermsList, scanForDisallowedTerms } from "./quality-filter";
import { enqueueRerender } from "./rerender-scheduler";
import type { GeneratedCopy } from "./types";

/**
 * Overrides de contenido del consultant (WO-15, REQ-BPG-014/016): guardar un
 * edit lo pasa por el ContentQualityFilter — limpio → live + re-render
 * (tier consultant); con términos vetados → pending_review (la página viva no
 * cambia) para la cola de admin. original_agent_value es write-once (trigger).
 */

export type SaveOverrideResult =
  | { status: "live"; flaggedTerms?: never }
  | { status: "pending_review"; flaggedTerms: string[] };

function originalValueFor(copy: GeneratedCopy, fieldKey: string): string {
  if (fieldKey === "hero_headline") return copy.hero_headline;
  if (fieldKey === "brand_overview") return copy.brand_overview;
  if (fieldKey === "value_proposition") return copy.value_proposition.join("\n");
  const faq = /^faq_(question|answer)_(\d+)$/.exec(fieldKey);
  if (faq) {
    const item = copy.faqs[Number(faq[2]) - 1];
    if (item) return faq[1] === "question" ? item.question : item.answer;
  }
  throw new Error(`campo no editable: ${fieldKey}`);
}

/**
 * Guarda el edit del consultant (bajo su tenant — RLS garantiza que solo toca
 * su página). Devuelve el estado resultante del filtro.
 */
export async function saveContentOverride(input: {
  consultantId: string;
  pageId: string;
  fieldKey: string;
  value: string;
}): Promise<SaveOverrideResult> {
  const terms = await disallowedTermsList();
  const flagged = scanForDisallowedTerms(input.value, terms);
  const status = flagged.length > 0 ? "pending_review" : "live";

  await withTenant(input.consultantId, async () => {
    const page = await db().query<{ generated_copy: GeneratedCopy }>(
      `SELECT c.generated_copy
       FROM brandme_pages p JOIN brandme_page_configs c ON c.id = p.config_id
       WHERE p.id = $1`,
      [input.pageId],
    );
    if (!page.rows[0]) throw new Error("página inexistente o ajena");
    const original = originalValueFor(page.rows[0].generated_copy, input.fieldKey);

    // Un live por campo (índice parcial): un edit limpio actualiza el live
    // existente (version+1); un edit retenido inserta en pending_review.
    const existing = await db().query<{ id: string }>(
      `SELECT id FROM consultant_content_overrides
       WHERE brandmepage_id = $1 AND field_key = $2 AND status = 'live'`,
      [input.pageId, input.fieldKey],
    );
    if (existing.rows[0] && status === "live") {
      await db().query(
        `UPDATE consultant_content_overrides
           SET current_value = $2, version = version + 1, updated_at = now()
         WHERE id = $1`,
        [existing.rows[0].id, input.value],
      );
    } else {
      await db().query(
        `INSERT INTO consultant_content_overrides
           (brandmepage_id, consultant_id, field_key, current_value, original_agent_value, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [input.pageId, input.consultantId, input.fieldKey, input.value, original, status],
      );
    }
  });

  if (status === "live") {
    // Edit limpio → re-render tier consultant (30s p75, AC-BPG-016.2).
    void enqueueRerender({ pageId: input.pageId, tier: "consultant" });
    return { status: "live" };
  }
  return { status: "pending_review", flaggedTerms: flagged };
}

/** Aprobación admin de un edit retenido (AC-BPG-016.4a). */
export async function approveFlaggedOverride(overrideId: string): Promise<void> {
  const pageId = await withSystemContext("bmp-quality-filter", async () => {
    // El live previo del mismo campo se marca rejected (índice parcial: 1 live).
    const { rows } = await db().query<{ brandmepage_id: string; field_key: string }>(
      `SELECT brandmepage_id, field_key FROM consultant_content_overrides WHERE id = $1`,
      [overrideId],
    );
    if (!rows[0]) throw new Error("override inexistente");
    await db().query(
      `UPDATE consultant_content_overrides SET status = 'rejected', updated_at = now()
       WHERE brandmepage_id = $1 AND field_key = $2 AND status = 'live'`,
      [rows[0].brandmepage_id, rows[0].field_key],
    );
    await db().query(
      `UPDATE consultant_content_overrides SET status = 'live', updated_at = now()
       WHERE id = $1 AND status = 'pending_review'`,
      [overrideId],
    );
    return rows[0].brandmepage_id;
  });
  void enqueueRerender({ pageId, tier: "consultant" });
}

/** Rechazo admin: se descarta el edit; el contenido vivo no cambia (AC-BPG-016.4b). */
export async function rejectFlaggedOverride(overrideId: string): Promise<void> {
  await withSystemContext("bmp-quality-filter", () =>
    db().query(
      `UPDATE consultant_content_overrides SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND status = 'pending_review'`,
      [overrideId],
    ),
  );
}

/** "Restore original" (AC-BPG-014.3): elimina el override vivo del campo. */
export async function restoreOriginal(input: {
  consultantId: string;
  pageId: string;
  fieldKey: string;
}): Promise<void> {
  await withTenant(input.consultantId, () =>
    db().query(
      `UPDATE consultant_content_overrides SET status = 'rejected', updated_at = now()
       WHERE brandmepage_id = $1 AND field_key = $2 AND status = 'live'`,
      [input.pageId, input.fieldKey],
    ),
  );
  void enqueueRerender({ pageId: input.pageId, tier: "consultant" });
}

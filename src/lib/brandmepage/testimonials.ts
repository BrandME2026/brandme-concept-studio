import { createHash } from "node:crypto";
import { db, withSystemContext, withTenant } from "@/lib/db/tenant-context";
import { getConfigNumber } from "@/lib/config/config-store";
import { disallowedTermsList, scanForDisallowedTerms } from "./quality-filter";
import { enqueueRerender } from "./rerender-scheduler";

/**
 * Testimonials Block (WO-38, REQ-TES): el único contenido estático autorado
 * por el consultant. Datos de PERFIL (aplican a todas sus páginas). Máx 5
 * activos; validación estricta (AC-TES-003.1); quality filter compartido
 * (términos vetados → pending_review, la página viva no cambia). El panel de
 * gestión del portal llega en Build 6 — estas funciones son la librería que
 * ese panel invoca.
 */

export const MAX_TESTIMONIALS = 5;

export interface TestimonialInput {
  quote: string;
  displayName: string;
  roleContext?: string | null;
}

export interface TestimonialRecord {
  id: string;
  quote: string;
  displayName: string;
  roleContext: string | null;
  visible: boolean;
  position: number;
  source: "manual" | "brand_suggested";
  sourceBrandName: string | null;
  status: "live" | "pending_review" | "rejected";
}

// ── Validación (AC-TES-003.1, pura) ─────────────────────────────────────────

const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
// Cubre también dominios sin prefijo (bit.ly/x, wa.me/…) — hallazgo review R1.
const URL_RE =
  /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|link|ly|me|app|mx|es|ai|dev|info|biz|us|tv|cc|gg)\b(\/\S*)?/i;

export interface ValidationError {
  field: "quote" | "displayName" | "roleContext";
  message: string;
}

/** Nombre en formato first-name-only o first-name + inicial ("Jane D."). */
export function isValidDisplayName(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length === 0 || words[0].length === 0) return false;
  // Ninguna palabra POSTERIOR a la primera puede exceder 2 caracteres
  // (inicial con o sin punto) — AC-TES-003.1.
  return words.slice(1).every((w) => w.replace(".", "").length <= 1 && w.length <= 2);
}

export function validateTestimonial(input: TestimonialInput): ValidationError[] {
  const errors: ValidationError[] = [];
  const quote = input.quote.trim();
  if (quote.length < 30 || quote.length > 250) {
    errors.push({ field: "quote", message: "La cita debe tener entre 30 y 250 caracteres." });
  }
  if (!isValidDisplayName(input.displayName)) {
    errors.push({
      field: "displayName",
      message:
        'El nombre debe ser solo el primer nombre o primer nombre + inicial (p.ej. "Jane D.").',
    });
  }
  if ((input.roleContext ?? "").length > 80) {
    errors.push({ field: "roleContext", message: "El contexto no puede exceder 80 caracteres." });
  }
  const combined = `${input.quote} ${input.displayName} ${input.roleContext ?? ""}`;
  if (PHONE_RE.test(combined) || EMAIL_RE.test(combined) || URL_RE.test(combined)) {
    errors.push({
      field: "quote",
      message: "El contenido no puede incluir teléfonos, emails ni URLs.",
    });
  }
  return errors;
}

// ── Gestión (bajo el tenant del consultant) ─────────────────────────────────

export class TestimonialValidationError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join(" | "));
    this.name = "TestimonialValidationError";
  }
}

async function rerenderAllPages(consultantId: string): Promise<void> {
  const pages = await withSystemContext("testimonials-rerender", () =>
    db().query<{ id: string }>(
      `SELECT id FROM brandme_pages WHERE consultant_id = $1 AND state = 'published'`,
      [consultantId],
    ),
  );
  for (const page of pages.rows) {
    void enqueueRerender({ pageId: page.id, tier: "consultant" });
  }
}

export type SaveTestimonialResult =
  | { status: "live"; id: string }
  | { status: "pending_review"; id: string; flaggedTerms: string[] };

/** Alta de testimonial (AC-TES-001.2/.3, 003, 004.1). */
export async function addTestimonial(
  consultantId: string,
  input: TestimonialInput,
  source: { type: "manual" } | { type: "brand_suggested"; brandName: string; sourceUrl: string } = {
    type: "manual",
  },
): Promise<SaveTestimonialResult> {
  const errors = validateTestimonial(input);
  if (errors.length) throw new TestimonialValidationError(errors);

  const flagged = scanForDisallowedTerms(
    `${input.quote} ${input.displayName} ${input.roleContext ?? ""}`,
    await disallowedTermsList(),
  );
  const status = flagged.length ? "pending_review" : "live";

  const id = await withTenant(consultantId, async () => {
    const count = await db().query<{ n: string }>(
      `SELECT count(*) AS n FROM testimonials WHERE status <> 'rejected'`,
    );
    if (Number(count.rows[0].n) >= MAX_TESTIMONIALS) {
      throw new TestimonialValidationError([
        { field: "quote", message: `Máximo ${MAX_TESTIMONIALS} testimonials.` },
      ]);
    }
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO testimonials
         (consultant_id, quote, display_name, role_context, position, source,
          source_brand_name, source_url, status)
       VALUES ($1, $2, $3, $4,
               (SELECT COALESCE(MAX(position), -1) + 1 FROM testimonials),
               $5, $6, $7, $8)
       RETURNING id`,
      [
        consultantId,
        input.quote.trim(),
        input.displayName.trim(),
        input.roleContext?.trim() || null,
        source.type,
        source.type === "brand_suggested" ? source.brandName : null,
        source.type === "brand_suggested" ? source.sourceUrl : null,
        status,
      ],
    );
    return rows[0].id;
  });

  if (status === "live") {
    await rerenderAllPages(consultantId);
    return { status: "live", id };
  }
  return { status: "pending_review", id, flaggedTerms: flagged };
}

/**
 * Toggle de visibilidad sin borrar (AC-TES-001.2). Corre bajo system con
 * filtro explícito por consultant_id: el tenant NO tiene policy de UPDATE
 * (review R1 — un UPDATE tenant permitiría auto-aprobar pending_review); el
 * caller garantiza que consultantId viene de la sesión autenticada.
 */
export async function setTestimonialVisibility(
  consultantId: string,
  id: string,
  visible: boolean,
): Promise<void> {
  await withSystemContext("testimonials-manage", () =>
    db().query(
      `UPDATE testimonials SET visible = $2, updated_at = now()
       WHERE id = $1 AND consultant_id = $3`,
      [id, visible, consultantId],
    ),
  );
  await rerenderAllPages(consultantId);
}

/** Reordenar (AC-TES-001.4): recibe los ids en el orden final. Mismo contrato
 * de system + filtro por consultant_id que setTestimonialVisibility. */
export async function reorderTestimonials(consultantId: string, orderedIds: string[]): Promise<void> {
  await withSystemContext("testimonials-manage", async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db().query(
        `UPDATE testimonials SET position = $2, updated_at = now()
         WHERE id = $1 AND consultant_id = $3`,
        [orderedIds[i], i, consultantId],
      );
    }
  });
  await rerenderAllPages(consultantId);
}

export async function deleteTestimonial(consultantId: string, id: string): Promise<void> {
  await withTenant(consultantId, () =>
    db().query(`DELETE FROM testimonials WHERE id = $1`, [id]),
  );
  await rerenderAllPages(consultantId);
}

// ── Admin (AC-TES-004, bajo system) ─────────────────────────────────────────

export async function approveFlaggedTestimonial(id: string): Promise<void> {
  const { rows } = await withSystemContext("testimonials-admin", async () => {
    await db().query(
      `UPDATE testimonials SET status = 'live', updated_at = now()
       WHERE id = $1 AND status = 'pending_review'`,
      [id],
    );
    return db().query<{ consultant_id: string }>(
      `SELECT consultant_id FROM testimonials WHERE id = $1`,
      [id],
    );
  });
  if (rows[0]) await rerenderAllPages(rows[0].consultant_id);
}

export async function rejectFlaggedTestimonial(id: string): Promise<void> {
  await withSystemContext("testimonials-admin", () =>
    db().query(
      `UPDATE testimonials SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND status = 'pending_review'`,
      [id],
    ),
  );
}

/** Remove admin (AC-TES-004.4/.5): borra PERMANENTE + re-render. El audit log
 * del Admin Console llega en Build 6 — el caller registra la acción. */
export async function adminRemoveTestimonial(id: string): Promise<void> {
  const { rows } = await withSystemContext("testimonials-admin", async () => {
    const owner = await db().query<{ consultant_id: string }>(
      `SELECT consultant_id FROM testimonials WHERE id = $1`,
      [id],
    );
    await db().query(`DELETE FROM testimonials WHERE id = $1`, [id]);
    return owner;
  });
  if (rows[0]) await rerenderAllPages(rows[0].consultant_id);
}

// ── Sugerencias brand-sourced (REQ-TES-005) ─────────────────────────────────

export interface BrandSuggestion {
  extractionId: string;
  brandName: string;
  quote: string;
  attribution: string | null;
  sourceUrl: string;
  quoteHash: string;
}

function quoteHash(quote: string): string {
  return createHash("sha256").update(quote.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** Convierte "Jane Doe" → "Jane D." (AC-TES-005.3); si no es posible, primer nombre. */
export function toFirstNameInitial(attribution: string | null): string {
  if (!attribution) return "Franquiciatario";
  const name = attribution.split(",")[0].trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Franquiciatario";
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[1][0].toUpperCase()}.`;
}

/** Sugerencias visibles: brand_testimonials de las extracciones activas de los
 * brands del consultant, menos las descartadas (AC-TES-005.1/.2). */
export async function listBrandSuggestions(consultantId: string): Promise<BrandSuggestion[]> {
  return withSystemContext("testimonials-suggestions", async () => {
    const { rows } = await db().query<{
      extraction_id: string;
      brand_name: string;
      testimonials: Array<{ quote: string; attribution: string | null; source_url: string }>;
    }>(
      `SELECT DISTINCT ON (e.brand_id)
              e.id AS extraction_id,
              COALESCE(b.name, initcap(split_part(b.host, '.', 1))) AS brand_name,
              e.brand_testimonials AS testimonials
       FROM brandme_pages p
       JOIN brands b ON b.id = p.brand_id
       JOIN brand_extractions e ON e.brand_id = p.brand_id AND e.status = 'completed'
       WHERE p.consultant_id = $1 AND e.brand_testimonials IS NOT NULL
       ORDER BY e.brand_id, e.extracted_at DESC`,
      [consultantId],
    );
    const dismissed = await db().query<{ extraction_id: string; quote_hash: string }>(
      `SELECT extraction_id, quote_hash FROM testimonial_dismissals WHERE consultant_id = $1`,
      [consultantId],
    );
    const dismissedSet = new Set(dismissed.rows.map((d) => `${d.extraction_id}:${d.quote_hash}`));

    return rows.flatMap((row) =>
      (row.testimonials ?? [])
        .map((t) => ({
          extractionId: row.extraction_id,
          brandName: row.brand_name,
          quote: t.quote,
          attribution: t.attribution,
          sourceUrl: t.source_url,
          quoteHash: quoteHash(t.quote),
        }))
        .filter((s) => !dismissedSet.has(`${s.extractionId}:${s.quoteHash}`)),
    );
  });
}

/** Aceptar sugerencia: pre-popula y pasa por el MISMO pipeline (AC-TES-005.3). */
export async function acceptBrandSuggestion(
  consultantId: string,
  suggestion: BrandSuggestion,
  edits: Partial<TestimonialInput> = {},
): Promise<SaveTestimonialResult> {
  return addTestimonial(
    consultantId,
    {
      quote: edits.quote ?? suggestion.quote.slice(0, 250),
      displayName: edits.displayName ?? toFirstNameInitial(suggestion.attribution),
      roleContext: edits.roleContext ?? null,
    },
    { type: "brand_suggested", brandName: suggestion.brandName, sourceUrl: suggestion.sourceUrl },
  );
}

export async function dismissBrandSuggestion(
  consultantId: string,
  suggestion: Pick<BrandSuggestion, "extractionId" | "quoteHash">,
): Promise<void> {
  await withTenant(consultantId, () =>
    db().query(
      `INSERT INTO testimonial_dismissals (consultant_id, extraction_id, quote_hash)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [consultantId, suggestion.extractionId, suggestion.quoteHash],
    ),
  );
}

// ── Render (público, bajo system) ───────────────────────────────────────────

export interface RenderableTestimonial {
  quote: string;
  displayName: string;
  roleContext: string | null;
  viaBrand: string | null; // "via [Brand] website" (AC-TES-005.4)
}

export async function listActiveTestimonials(consultantId: string): Promise<{
  items: RenderableTestimonial[];
  visibleBeforeCollapse: number;
}> {
  const raw = await getConfigNumber("brandmepage", "testimonials_visible_before_collapse", 5);
  const visibleBeforeCollapse = Math.min(5, Math.max(1, Math.floor(raw)));
  const { rows } = await db().query<{
    quote: string;
    display_name: string;
    role_context: string | null;
    source: string;
    source_brand_name: string | null;
  }>(
    `SELECT quote, display_name, role_context, source, source_brand_name
     FROM testimonials
     WHERE consultant_id = $1 AND visible = true AND status = 'live'
     ORDER BY position ASC
     LIMIT ${MAX_TESTIMONIALS}`,
    [consultantId],
  );
  return {
    visibleBeforeCollapse,
    items: rows.map((r) => ({
      quote: r.quote,
      displayName: r.display_name,
      roleContext: r.role_context,
      viaBrand: r.source === "brand_suggested" ? r.source_brand_name : null,
    })),
  };
}

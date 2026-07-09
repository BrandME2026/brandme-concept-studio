import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndMigrate, createTenant, asTenant, type TenantFixture } from "./harness";
import { withMigrator } from "./db-util";
import { withSystemContext } from "../../src/lib/db/tenant-context";
import {
  acceptBrandSuggestion,
  addTestimonial,
  adminRemoveTestimonial,
  approveFlaggedTestimonial,
  dismissBrandSuggestion,
  listActiveTestimonials,
  listBrandSuggestions,
  MAX_TESTIMONIALS,
  reorderTestimonials,
  setTestimonialVisibility,
  TestimonialValidationError,
} from "../../src/lib/brandmepage/testimonials";
import { drainRerenders } from "../../src/lib/brandmepage/rerender-scheduler";

/**
 * WO-38 / COV_TST_001: la librería REAL de testimonials contra la DB REAL —
 * máx 5, quality filter (pending_review no cambia la página viva), sugerencias
 * brand-sourced con descartes persistentes, oversight admin y RLS.
 */

process.env.CONFIG_CACHE_TTL_MS = "150";

const VALID = {
  quote: "Gracias a este consultor encontré la franquicia perfecta para mi familia entera.",
  displayName: "Jane D.",
  roleContext: "Franquiciataria, Austin TX",
};

async function activeFor(consultantId: string) {
  return withSystemContext("test-render", () => listActiveTestimonials(consultantId));
}

beforeAll(async () => {
  await resetAndMigrate();
});

describe("alta + filtro (COV_TST_001.1 / AC-TES-004.1)", () => {
  it("un testimonial limpio queda live y visible en el render", async () => {
    const t = await createTenant("tes-clean");
    const saved = await addTestimonial(t.consultantId, VALID);
    expect(saved.status).toBe("live");
    await drainRerenders();

    const active = await activeFor(t.consultantId);
    expect(active.items).toHaveLength(1);
    expect(active.items[0].displayName).toBe("Jane D.");
    expect(active.items[0].viaBrand).toBeNull();
  });

  it("términos vetados → pending_review y NO se renderiza (la página viva no cambia)", async () => {
    const t = await createTenant("tes-flag");
    const saved = await addTestimonial(t.consultantId, {
      ...VALID,
      quote: "Este negocio es dinero garantizado para cualquiera que quiera entrarle ya.",
    });
    expect(saved.status).toBe("pending_review");
    expect(saved.status === "pending_review" && saved.flaggedTerms).toContain("dinero garantizado");
    expect((await activeFor(t.consultantId)).items).toHaveLength(0);
  });

  it("la aprobación admin lo publica; el rechazo lo descarta (AC-TES-004.2)", async () => {
    const t = await createTenant("tes-approve");
    const saved = await addTestimonial(t.consultantId, {
      ...VALID,
      quote: "Una estafa hubiera sido no llamar antes a este consultor tan profesional.",
    });
    expect(saved.status).toBe("pending_review");
    await approveFlaggedTestimonial(saved.id);
    await drainRerenders();
    expect((await activeFor(t.consultantId)).items).toHaveLength(1);
  });

  it("valida ANTES de tocar la DB (nombre con apellido completo)", async () => {
    const t = await createTenant("tes-invalid");
    await expect(
      addTestimonial(t.consultantId, { ...VALID, displayName: "Jane Doe" }),
    ).rejects.toThrow(TestimonialValidationError);
  });

  it("máximo 5 testimonials (AC-TES-001.3)", async () => {
    const t = await createTenant("tes-max");
    for (let i = 0; i < MAX_TESTIMONIALS; i++) {
      await addTestimonial(t.consultantId, { ...VALID, quote: `${VALID.quote} #${i + 1}` });
    }
    await expect(addTestimonial(t.consultantId, VALID)).rejects.toThrow(/Máximo 5/);
  });
});

describe("gestión (REQ-TES-001/002)", () => {
  it("toggle de visibilidad oculta sin borrar; reorden persiste (AC-TES-001.2/.4)", async () => {
    const t = await createTenant("tes-manage");
    const a = await addTestimonial(t.consultantId, { ...VALID, quote: `${VALID.quote} AAA` });
    const b = await addTestimonial(t.consultantId, { ...VALID, quote: `${VALID.quote} BBB` });

    await reorderTestimonials(t.consultantId, [b.id, a.id]);
    let active = await activeFor(t.consultantId);
    expect(active.items[0].quote).toContain("BBB");

    await setTestimonialVisibility(t.consultantId, b.id, false);
    active = await activeFor(t.consultantId);
    expect(active.items).toHaveLength(1);
    expect(active.items[0].quote).toContain("AAA");
    await drainRerenders();
  });

  it("el remove de admin borra permanente (AC-TES-004.4)", async () => {
    const t = await createTenant("tes-admin-rm");
    const saved = await addTestimonial(t.consultantId, VALID);
    await adminRemoveTestimonial(saved.id);
    await drainRerenders();
    expect((await activeFor(t.consultantId)).items).toHaveLength(0);
    const { rows } = await withMigrator((c) =>
      c.query(`SELECT 1 FROM testimonials WHERE id = $1`, [saved.id]),
    );
    expect(rows).toHaveLength(0);
  });

  it("RLS: el tenant NO puede auto-aprobar su pending_review (review R1)", async () => {
    const t = await createTenant("tes-selfapprove");
    const saved = await addTestimonial(t.consultantId, {
      ...VALID,
      quote: "Aquí hay dinero garantizado para todos los que se animen a invertir hoy.",
    });
    expect(saved.status).toBe("pending_review");
    const updated = await asTenant(t, "pooled", (h) =>
      h.query(`UPDATE testimonials SET status = 'live' WHERE id = $1`, [saved.id]),
    );
    expect(updated.rowCount, "sin policy de UPDATE tenant: 0 filas").toBe(0);
    expect((await activeFor(t.consultantId)).items).toHaveLength(0);
  });

  it("RLS: un tenant no ve ni toca testimonials ajenos", async () => {
    const a = await createTenant("tes-rls-a");
    const b = await createTenant("tes-rls-b");
    await addTestimonial(a.consultantId, VALID);
    const seenByB = await asTenant(b, "pooled", (h) => h.query(`SELECT id FROM testimonials`));
    expect(seenByB.rows).toHaveLength(0);
    await drainRerenders();
  });
});

describe("sugerencias brand-sourced (REQ-TES-005)", () => {
  async function seedBrandWithTestimonials(t: TenantFixture) {
    return withMigrator(async (c) => {
      const host = `tes-${randomUUID().slice(0, 6)}.test`;
      const brand = await c.query<{ id: string }>(
        `INSERT INTO brands (url, host, name) VALUES ($1, $2, 'PowerFit') RETURNING id`,
        [`https://${host}/`, host],
      );
      const extraction = await c.query<{ id: string }>(
        `INSERT INTO brand_extractions (brand_id, triggered_by_consultant_id, status, brand_testimonials, extracted_at)
         VALUES ($1, $2, 'completed', $3::jsonb, now()) RETURNING id`,
        [
          brand.rows[0].id,
          t.consultantId,
          JSON.stringify([
            { quote: "Abrir mi franquicia PowerFit fue la mejor decisión financiera de mi vida.", attribution: "Carlos Ramírez, Monterrey", source_url: `https://${host}/franchise` },
            { quote: "El soporte del corporativo superó todas mis expectativas desde el día uno.", attribution: "Ana López", source_url: `https://${host}/franchise` },
          ]),
        ],
      );
      // La sugerencia se lista vía las páginas del consultant → sembrar página.
      await c.query(`SELECT set_config('app.bmp_state_writer', 'page-lifecycle', false)`);
      await c.query(
        `INSERT INTO brandme_pages (consultant_id, brand_id, consultant_slug, brand_slug, state)
         VALUES ($1, $2, $3, 'powerfit', 'published')`,
        [t.consultantId, brand.rows[0].id, `tes-${randomUUID().slice(0, 8)}`],
      );
      return extraction.rows[0].id;
    });
  }

  it("lista sugerencias del payload del Agente 02; aceptar publica con label 'via brand' (AC-TES-005.1/.3/.4)", async () => {
    const t = await createTenant("tes-sug");
    await seedBrandWithTestimonials(t);

    const suggestions = await listBrandSuggestions(t.consultantId);
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].brandName).toBe("PowerFit");

    const saved = await acceptBrandSuggestion(t.consultantId, suggestions[0]);
    expect(saved.status).toBe("live");
    await drainRerenders();

    const active = await activeFor(t.consultantId);
    expect(active.items[0].viaBrand).toBe("PowerFit");
    expect(active.items[0].displayName).toBe("Carlos R."); // first-name + inicial
  });

  it("descartar la saca de la lista de forma persistente (AC-TES-005.2)", async () => {
    const t = await createTenant("tes-dismiss");
    await seedBrandWithTestimonials(t);
    const before = await listBrandSuggestions(t.consultantId);
    expect(before).toHaveLength(2);

    await dismissBrandSuggestion(t.consultantId, before[0]);
    const after = await listBrandSuggestions(t.consultantId);
    expect(after).toHaveLength(1);
    expect(after[0].quoteHash).not.toBe(before[0].quoteHash);
  });
});

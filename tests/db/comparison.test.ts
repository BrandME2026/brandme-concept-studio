import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resetAndMigrate, createTenant, type TenantFixture } from "./harness";
import { withMigrator } from "./db-util";
import { withSystemContext } from "../../src/lib/db/tenant-context";
import { getComparisonBrands } from "../../src/lib/brandmepage/comparison";

/**
 * WO-37 / COV_MBC_001: datos del Comparison Card contra la DB real —
 * solo marcas del MISMO consultant con página publicada, dimensiones desde el
 * FDD del Agente 02, tenant-scoped por construcción.
 */

async function seedPage(
  t: TenantFixture,
  brandName: string,
  state: string,
  fdd: object | null,
): Promise<string> {
  return withMigrator(async (c) => {
    const host = `${brandName.toLowerCase()}-${randomUUID().slice(0, 6)}.test`;
    const brand = await c.query<{ id: string }>(
      `INSERT INTO brands (url, host, name) VALUES ($1, $2, $3) RETURNING id`,
      [`https://${host}/`, host, brandName],
    );
    await c.query(
      `INSERT INTO brand_extractions (brand_id, status, fdd_financial_data, extracted_at)
       VALUES ($1, 'completed', $2::jsonb, now())`,
      [brand.rows[0].id, fdd ? JSON.stringify(fdd) : null],
    );
    await c.query(`SELECT set_config('app.bmp_state_writer', 'page-lifecycle', false)`);
    const page = await c.query<{ id: string }>(
      `INSERT INTO brandme_pages (consultant_id, brand_id, consultant_slug, brand_slug, state)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [t.consultantId, brand.rows[0].id, `c-${randomUUID().slice(0, 8)}`, brandName.toLowerCase(), state],
    );
    return page.rows[0].id;
  });
}

beforeAll(async () => {
  await resetAndMigrate();
});

describe("getComparisonBrands (COV_MBC_001.1)", () => {
  it("devuelve la marca actual + otras PUBLICADAS del mismo consultant con sus dimensiones", async () => {
    const t = await createTenant("mbc");
    const currentId = await seedPage(t, "FitZone", "published", {
      investment_range_min: { value: 180000 },
      royalty_rate: { value: "7%" },
    });
    await seedPage(t, "TacoBrand", "published", {
      investment_range_min: { value: 250000 },
      investment_range_max: { value: 400000 },
    });
    await seedPage(t, "DraftBrand", "draft", null); // draft: excluida

    const brands = await withSystemContext("test-mbc", () =>
      getComparisonBrands(t.consultantId, currentId),
    );
    expect(brands).toHaveLength(2);
    const current = brands.find((b) => b.isCurrent)!;
    expect(current.brandName).toBe("FitZone");
    expect(current.dimensions.royaltyRate).toBe("7%");
    const other = brands.find((b) => !b.isCurrent)!;
    expect(other.brandName).toBe("TacoBrand");
    expect(other.dimensions.investmentRange).toContain("$250,000");
    expect(other.dimensions.franchiseFee).toBeNull(); // "no disponible", jamás estimado
  });

  it("tenant-scoped: las marcas de OTRO consultant jamás aparecen", async () => {
    const a = await createTenant("mbc-a");
    const b = await createTenant("mbc-b");
    const pageA = await seedPage(a, "MarcaA", "published", null);
    await seedPage(b, "MarcaB", "published", null);

    const brands = await withSystemContext("test-mbc", () =>
      getComparisonBrands(a.consultantId, pageA),
    );
    expect(brands.map((x) => x.brandName)).toEqual(["MarcaA"]);
  });

  it("consultant mono-marca: solo la actual (la UI omite el entry point)", async () => {
    const t = await createTenant("mbc-solo");
    const pageId = await seedPage(t, "Solitaria", "published", null);
    const brands = await withSystemContext("test-mbc", () =>
      getComparisonBrands(t.consultantId, pageId),
    );
    expect(brands).toHaveLength(1);
  });
});

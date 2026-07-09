import { db } from "@/lib/db/tenant-context";

/**
 * Multi-Brand Comparison Card — datos (WO-37, REQ-MBC). Todo sale de lo YA
 * extraído por el Agente 02 (cero llamadas en render-time, regla del
 * requirement). Dimensión ausente → "no disponible" explícito — jamás celdas
 * vacías ni valores estimados (AC-MBC-003.2). "Knowledge Vault ready" se
 * aproxima con "extracción completed" hasta que exista el vault (WO-14,
 * blocked) — drift documentado.
 */

export const NOT_AVAILABLE = null;

export interface ComparisonDimensions {
  /** "250,000 – 400,000 USD" | null = no disponible. */
  investmentRange: string | null;
  franchiseFee: string | null; // el Agente 02 no extrae fee separado → null (honesto)
  royaltyRate: string | null;
  territoryStatus: string | null; // disponible con WO-18/REQ-TI-006 (fuera de scope)
}

export interface ComparisonBrand {
  brandName: string;
  href: string;
  logoUrl: string | null;
  primaryColor: string | null;
  isCurrent: boolean;
  dimensions: ComparisonDimensions;
}

interface FddField {
  value?: number | string | null;
  source_url?: string | null;
}

function money(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return `$${value.toLocaleString("en-US")} USD`;
  return String(value);
}

/** Dimensiones desde el fdd_financial_data (solo 'explicit', per WO-13). Pura. */
export function dimensionsFromFdd(fdd: Record<string, FddField> | null): ComparisonDimensions {
  const min = money(fdd?.investment_range_min?.value);
  const max = money(fdd?.investment_range_max?.value);
  return {
    investmentRange: min && max ? `${min} – ${max}` : (min ?? max),
    franchiseFee: NOT_AVAILABLE,
    royaltyRate: fdd?.royalty_rate?.value != null ? String(fdd.royalty_rate.value) : null,
    territoryStatus: NOT_AVAILABLE,
  };
}

/**
 * Marcas comparables del consultant (páginas PUBLICADAS con extracción
 * completed) + la marca actual. Usar bajo el contexto del caller (el render
 * corre bajo system). Tenant-scoped por construcción: filtra por consultant_id
 * de la página actual.
 */
export async function getComparisonBrands(
  consultantId: string,
  currentPageId: string,
): Promise<ComparisonBrand[]> {
  const { rows } = await db().query<{
    page_id: string;
    brand_name: string;
    consultant_slug: string;
    brand_slug: string;
    logo_url: string | null;
    primary_color: string | null;
    fdd: Record<string, FddField> | null;
  }>(
    `SELECT p.id AS page_id,
            COALESCE(b.name, initcap(split_part(b.host, '.', 1))) AS brand_name,
            p.consultant_slug, p.brand_slug,
            c.identity_tokens->>'logo_url' AS logo_url,
            c.identity_tokens->>'primary_color_hex' AS primary_color,
            e.fdd_financial_data AS fdd
     FROM brandme_pages p
     JOIN brands b ON b.id = p.brand_id
     LEFT JOIN brandme_page_configs c ON c.id = p.config_id
     LEFT JOIN LATERAL (
       SELECT fdd_financial_data FROM brand_extractions
       WHERE brand_id = p.brand_id AND status = 'completed'
       ORDER BY extracted_at DESC LIMIT 1
     ) e ON true
     WHERE p.consultant_id = $1 AND (p.state = 'published' OR p.id = $2)
     ORDER BY p.created_at ASC`,
    [consultantId, currentPageId],
  );
  return rows.map((r) => ({
    brandName: r.brand_name,
    href: `/${r.consultant_slug}/${r.brand_slug}`,
    logoUrl: r.logo_url,
    primaryColor: r.primary_color,
    isCurrent: r.page_id === currentPageId,
    dimensions: dimensionsFromFdd(r.fdd),
  }));
}

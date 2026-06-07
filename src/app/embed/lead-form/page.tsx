import { LeadForm, type FormField } from "./lead-form";

export const dynamic = "force-dynamic";

const VALID_FIELDS: FormField[] = ["nombre", "email", "telefono", "ciudad", "inversion", "mensaje"];

/** Parsea `fields` (CSV) del querystring a FormField[] válidos. Vacío → undefined (default). */
function parseFields(raw: string | undefined): FormField[] | undefined {
  if (!raw) return undefined;
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is FormField => (VALID_FIELDS as string[]).includes(s));
  return parsed.length ? parsed : undefined;
}

// Widget de primera parte embebido vía <iframe> en las páginas públicas del LLM. Al ser
// nuestra app (no el HTML no confiable), SÍ puede hacer fetch a /api/leads — por eso el
// formulario va aquí y no como <form> crudo dentro del sandbox del documento generado.
export default async function LeadFormEmbed({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; brand?: string; lang?: string; fields?: string }>;
}) {
  const { slug = "", brand = "", lang = "es", fields } = await searchParams;
  return (
    <LeadForm
      slug={slug}
      brand={brand}
      lang={lang === "en" ? "en" : "es"}
      fields={parseFields(fields)}
    />
  );
}

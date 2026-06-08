import { describe, it, expect } from "vitest";
import { buildLlmsMd } from "./build-llms-md";
import type { PublicDocMeta } from "./build-public-doc";

const base: PublicDocMeta = {
  slug: "burger-king-dallas",
  name: "Franquicias Dallas",
  brand: "Burger King",
  city: "Dallas",
  metaTitle: "Abre tu Burger King en Dallas",
  metaDescription: "Oportunidad de franquicia Burger King en Dallas.",
  screenshot: null,
};

describe("buildLlmsMd", () => {
  it("incluye título, descripción y datos clave", () => {
    const md = buildLlmsMd(base);
    expect(md).toContain("# Franquicias Dallas");
    expect(md).toContain("> Oportunidad de franquicia Burger King en Dallas.");
    expect(md).toContain("- Marca: Burger King");
    expect(md).toContain("- Mercado: Dallas");
    expect(md).toContain("Página: ");
    expect(md).toContain("/p/burger-king-dallas");
  });

  it("renderiza la FAQ como secciones markdown", () => {
    const md = buildLlmsMd({
      ...base,
      faq: [
        { q: "¿Cuánto cuesta?", a: "Desde 1.5M USD." },
        { q: "¿Hay soporte?", a: "Sí, soporte completo." },
      ],
    });
    expect(md).toContain("## Preguntas frecuentes");
    expect(md).toContain("### ¿Cuánto cuesta?");
    expect(md).toContain("Desde 1.5M USD.");
    expect(md).toContain("### ¿Hay soporte?");
  });

  it("omite contacto y FAQ cuando no existen", () => {
    const md = buildLlmsMd(base);
    expect(md).not.toContain("- Contacto:");
    expect(md).not.toContain("## Preguntas frecuentes");
  });

  it("incluye WhatsApp cuando está presente", () => {
    const md = buildLlmsMd({ ...base, whatsapp: "+1 413 896 8350" });
    expect(md).toContain("- Contacto: WhatsApp +1 413 896 8350");
  });

  it("descarta entradas de FAQ incompletas", () => {
    const md = buildLlmsMd({
      ...base,
      faq: [{ q: "Solo pregunta", a: "" }, { q: "", a: "Solo respuesta" }],
    });
    expect(md).not.toContain("## Preguntas frecuentes");
  });
});

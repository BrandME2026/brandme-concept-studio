import { describe, expect, it } from "vitest";
import { isValidDisplayName, toFirstNameInitial, validateTestimonial } from "./testimonials";

/**
 * WO-38: validación pura del Testimonials Block (AC-TES-003.1) y conversión de
 * atribución brand-sourced a first-name + inicial (AC-TES-005.3).
 */

const VALID = {
  quote: "Gracias a este consultor encontré la franquicia perfecta para mi familia.",
  displayName: "Jane D.",
  roleContext: "Franquiciataria, Austin TX",
};

describe("validateTestimonial (AC-TES-003.1)", () => {
  it("acepta un testimonial válido", () => {
    expect(validateTestimonial(VALID)).toEqual([]);
  });

  it("rechaza citas fuera de 30-250 caracteres con mensaje específico", () => {
    expect(validateTestimonial({ ...VALID, quote: "Muy bueno" })[0].field).toBe("quote");
    expect(validateTestimonial({ ...VALID, quote: "x".repeat(251) })[0].field).toBe("quote");
  });

  it("nombre: first-name-only o first-name + inicial; rechaza apellido completo", () => {
    expect(isValidDisplayName("Jane")).toBe(true);
    expect(isValidDisplayName("Jane D.")).toBe(true);
    expect(isValidDisplayName("Jane D")).toBe(true);
    expect(isValidDisplayName("Jane Doe")).toBe(false);
    expect(isValidDisplayName("")).toBe(false);
    const errors = validateTestimonial({ ...VALID, displayName: "Jane Doe" });
    expect(errors[0].field).toBe("displayName");
    expect(errors[0].message).toContain("inicial");
  });

  it("rechaza contexto de más de 80 caracteres", () => {
    expect(
      validateTestimonial({ ...VALID, roleContext: "y".repeat(81) })[0].field,
    ).toBe("roleContext");
  });

  it("rechaza URLs SIN prefijo: acortadores y wa.me (review R1)", () => {
    expect(
      validateTestimonial({ ...VALID, quote: `${VALID.quote} entra a bit.ly/oferta` }),
    ).not.toEqual([]);
    expect(
      validateTestimonial({ ...VALID, roleContext: "wa.me/525512345678" }),
    ).not.toEqual([]);
    // Texto normal con puntuación NO es falso positivo.
    expect(validateTestimonial({ ...VALID, roleContext: "Franquiciataria, Austin TX." })).toEqual(
      [],
    );
  });

  it("rechaza teléfonos, emails y URLs en cualquier campo", () => {
    expect(
      validateTestimonial({ ...VALID, quote: `${VALID.quote} Llámame al +52 555 123 4567` }),
    ).not.toEqual([]);
    expect(
      validateTestimonial({ ...VALID, roleContext: "escríbeme a jane@mail.com" }),
    ).not.toEqual([]);
    expect(
      validateTestimonial({ ...VALID, quote: `${VALID.quote} visita www.mipagina.com ya` }),
    ).not.toEqual([]);
  });
});

describe("toFirstNameInitial (AC-TES-005.3)", () => {
  it("convierte nombre completo a first-name + inicial", () => {
    expect(toFirstNameInitial("Jane Doe")).toBe("Jane D.");
    expect(toFirstNameInitial("Juan Pérez, CDMX")).toBe("Juan P.");
    expect(toFirstNameInitial("Madonna")).toBe("Madonna");
    expect(toFirstNameInitial(null)).toBe("Franquiciatario");
  });
});

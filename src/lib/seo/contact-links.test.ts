import { describe, it, expect } from "vitest";
import { buildPhoneLink, buildWhatsAppLink, buildMailtoLink } from "./contact-links";

describe("buildPhoneLink", () => {
  it("genera tel: con + y dígitos cuando el número es válido", () => {
    expect(buildPhoneLink("+34 600 123 456")).toBe("tel:+34600123456");
  });

  it("conserva los dígitos sin + cuando no hay código de país explícito", () => {
    expect(buildPhoneLink("600123456")).toBe("tel:600123456");
  });

  it("devuelve '' si es muy corto o muy largo", () => {
    expect(buildPhoneLink("12345")).toBe("");
    expect(buildPhoneLink("1234567890123456")).toBe("");
  });

  it("devuelve '' para null/undefined/vacío", () => {
    expect(buildPhoneLink(null)).toBe("");
    expect(buildPhoneLink(undefined)).toBe("");
    expect(buildPhoneLink("")).toBe("");
  });
});

describe("buildWhatsAppLink", () => {
  it("genera wa.me con mensaje pre-llenado", () => {
    const link = buildWhatsAppLink("+34600123456", "Burger King", "Madrid");
    expect(link).toContain("https://wa.me/34600123456");
    expect(link).toContain("text=");
  });

  it("devuelve '' si el número no es plausible", () => {
    expect(buildWhatsAppLink("123", "X", null)).toBe("");
  });
});

describe("buildMailtoLink", () => {
  it("genera mailto con asunto cuando el email es válido", () => {
    const link = buildMailtoLink("hola@ejemplo.com", "BK", "Madrid");
    expect(link).toContain("mailto:hola@ejemplo.com");
    expect(link).toContain("subject=");
  });

  it("devuelve '' si el email es inválido", () => {
    expect(buildMailtoLink("no-es-email", "X", null)).toBe("");
  });
});

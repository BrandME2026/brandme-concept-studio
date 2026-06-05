import { describe, it, expect } from "vitest";
import { buildSrcDoc } from "./build-srcdoc";

describe("buildSrcDoc", () => {
  it("envuelve el HTML en un documento completo", () => {
    const doc = buildSrcDoc("<h1>Hola</h1>");
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("<h1>Hola</h1>");
    expect(doc).toContain("</html>");
  });

  it("inyecta Tailwind por CDN", () => {
    const doc = buildSrcDoc("<div></div>");
    expect(doc).toContain("cdn.tailwindcss.com");
  });

  it("incluye viewport meta para responsive", () => {
    const doc = buildSrcDoc("<div></div>");
    expect(doc).toContain('name="viewport"');
  });
});

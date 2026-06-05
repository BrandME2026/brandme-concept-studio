import { describe, it, expect } from "vitest";
import { serializeDesignMd } from "./design-md";
import type { DesignProposal } from "@/lib/schemas";

const proposal: DesignProposal = {
  name: "Aurora",
  description: "Estética oscura con acento cálido.",
  colors: {
    primary: "#000000",
    canvas: "#ffffff",
    ink: "#111111",
    accent: "#fc4c02",
  },
  typography: {
    displayFamily: "Inter",
    bodyFamily: "Inter",
    scale: [
      { level: "h1", sizePx: 64, weight: 500 },
      { level: "body", sizePx: 16, weight: 400 },
    ],
  },
  principles: ["Contraste de superficies", "Una sola pieza de color de marca"],
  html: "<section>hola</section>",
};

describe("serializeDesignMd", () => {
  it("incluye frontmatter YAML con nombre y colores", () => {
    const md = serializeDesignMd(proposal);
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('name: "Aurora"');
    expect(md).toContain('primary: "#000000"');
    expect(md).toContain('accent: "#fc4c02"');
  });

  it("escapa valores con caracteres que romperían el YAML", () => {
    const md = serializeDesignMd({
      ...proposal,
      name: 'Bold: Modern "X"',
    });
    // El nombre va citado y las comillas internas escapadas → YAML válido.
    expect(md).toContain('name: "Bold: Modern \\"X\\""');
  });

  it("incluye sección Overview con la descripción", () => {
    const md = serializeDesignMd(proposal);
    expect(md).toContain("## Overview");
    expect(md).toContain("Estética oscura con acento cálido.");
  });

  it("incluye tabla de jerarquía tipográfica", () => {
    const md = serializeDesignMd(proposal);
    expect(md).toContain("## Typography");
    expect(md).toContain("h1");
    expect(md).toContain("64");
  });

  it("incluye los principios como sección Do", () => {
    const md = serializeDesignMd(proposal);
    expect(md).toContain("Contraste de superficies");
  });

  it("NO incluye el html en el markdown (el html va aparte al preview)", () => {
    const md = serializeDesignMd(proposal);
    expect(md).not.toContain("<section>hola</section>");
  });
});

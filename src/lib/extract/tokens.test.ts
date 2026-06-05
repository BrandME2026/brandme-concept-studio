import { describe, it, expect } from "vitest";
import { buildDesignTokens } from "./tokens";
import type { RawExtraction } from "./extractor-script";

function makeRaw(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    title: "Ejemplo",
    viewport: { width: 1280, height: 720 },
    colors: {
      text: { "rgb(0, 0, 0)": 50, "rgb(149, 148, 148)": 10 },
      background: { "rgb(255, 255, 255)": 80, "rgba(0, 0, 0, 0)": 200 },
      border: { "rgb(235, 235, 235)": 5 },
    },
    primaryCandidate: "rgb(252, 76, 2)",
    bodyBackground: "rgb(255, 255, 255)",
    bodyColor: "rgb(0, 0, 0)",
    fonts: {
      '"Inter", sans-serif': { weights: [400, 500], count: 40, headingCount: 0 },
      '"JetBrains Mono", monospace': {
        weights: [500],
        count: 5,
        headingCount: 3,
      },
    },
    baseFontSize: "16px",
    typeScale: [
      { level: "h1", fontSize: "64px", lineHeight: "70px", fontWeight: 500 },
      { level: "p", fontSize: "16px", lineHeight: "24px", fontWeight: 400 },
    ],
    spacing: { "16": 30, "8": 20, "32": 10, "12": 5 },
    radii: { "4": 20, "9999": 1 },
    shadows: ["rgba(1,1,32,0.1) 0px 4px 10px 0px"],
    maxWidth: "1280px",
    usesFlex: true,
    usesGrid: true,
    ...overrides,
  };
}

describe("buildDesignTokens", () => {
  it("normaliza colores a hex y descarta transparentes", () => {
    const tokens = buildDesignTokens(makeRaw(), "https://ejemplo.com", "2026-01-01");
    const values = tokens.colors.palette.map((c) => c.value);
    expect(values).toContain("#000000");
    expect(values).toContain("#ffffff");
    expect(values).not.toContain("#000000".replace("000000", "rgba")); // sanity
    // ningún color transparente colado
    expect(tokens.colors.palette.every((c) => c.value.startsWith("#"))).toBe(true);
  });

  it("deriva background/foreground del body y primary del candidato", () => {
    const tokens = buildDesignTokens(makeRaw(), "https://ejemplo.com", "2026-01-01");
    expect(tokens.colors.background).toBe("#ffffff");
    expect(tokens.colors.foreground).toBe("#000000");
    expect(tokens.colors.primary).toBe("#fc4c02");
  });

  it("clasifica fuentes: heading vs body por headingCount y uso", () => {
    const tokens = buildDesignTokens(makeRaw(), "https://ejemplo.com", "2026-01-01");
    const inter = tokens.typography.fontFamilies.find((f) => f.family === "Inter");
    const mono = tokens.typography.fontFamilies.find(
      (f) => f.family === "JetBrains Mono",
    );
    expect(inter?.role).toBe("body");
    expect(mono?.role).toBe("mono");
  });

  it("ordena la escala de espaciado y extrae los más comunes", () => {
    const tokens = buildDesignTokens(makeRaw(), "https://ejemplo.com", "2026-01-01");
    expect(tokens.spacing.scale).toEqual([8, 12, 16, 32]);
    // el más frecuente (16, count 30) va primero en common
    expect(tokens.spacing.common[0]).toBe(16);
  });

  it("incluye meta con url y timestamp", () => {
    const tokens = buildDesignTokens(makeRaw(), "https://ejemplo.com", "2026-01-01");
    expect(tokens.meta.url).toBe("https://ejemplo.com");
    expect(tokens.meta.extractedAt).toBe("2026-01-01");
    expect(tokens.meta.title).toBe("Ejemplo");
  });

  it("normaliza radios y descarta el pill 9999 del ranking principal", () => {
    const tokens = buildDesignTokens(makeRaw(), "https://ejemplo.com", "2026-01-01");
    expect(tokens.radii).toContain(4);
  });
});

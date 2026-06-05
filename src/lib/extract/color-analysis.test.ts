import { describe, it, expect } from "vitest";
import { clusterColors } from "./color-analysis";
import type { ColorToken } from "@/types/design";

describe("clusterColors", () => {
  it("fusiona grises casi idénticos en un solo token", () => {
    const input: ColorToken[] = [
      { value: "#333333", count: 10, roles: ["text"] },
      { value: "#343434", count: 5, roles: ["text"] },
      { value: "#363636", count: 2, roles: ["border"] },
    ];

    const result = clusterColors(input);

    // Los tres grises colapsan en un cluster.
    expect(result).toHaveLength(1);
    // El representante es el de mayor frecuencia.
    expect(result[0].value).toBe("#333333");
    // Los counts se suman.
    expect(result[0].count).toBe(17);
    // Los roles se unen sin duplicados.
    expect(result[0].roles.sort()).toEqual(["border", "text"]);
  });

  it("mantiene separados colores perceptualmente distintos", () => {
    const input: ColorToken[] = [
      { value: "#fc4c02", count: 8, roles: ["background"] }, // naranja
      { value: "#010120", count: 20, roles: ["background"] }, // azul-negro
      { value: "#ffffff", count: 50, roles: ["background"] }, // blanco
    ];

    const result = clusterColors(input);

    expect(result).toHaveLength(3);
  });

  it("ordena la paleta resultante por frecuencia descendente", () => {
    const input: ColorToken[] = [
      { value: "#010120", count: 5, roles: ["background"] },
      { value: "#ffffff", count: 100, roles: ["background"] },
      { value: "#fc4c02", count: 30, roles: ["background"] },
    ];

    const result = clusterColors(input);

    expect(result.map((c) => c.value)).toEqual([
      "#ffffff",
      "#fc4c02",
      "#010120",
    ]);
  });

  it("respeta el máximo de colores devueltos", () => {
    const input: ColorToken[] = Array.from({ length: 20 }, (_, i) => ({
      value: `#${(i * 0x111111).toString(16).padStart(6, "0")}`,
      count: 20 - i,
      roles: ["background" as const],
    }));

    const result = clusterColors(input, { maxColors: 6 });

    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("devuelve array vacío para entrada vacía", () => {
    expect(clusterColors([])).toEqual([]);
  });
});

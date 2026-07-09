import { describe, expect, it } from "vitest";
import { dimensionsFromFdd } from "./comparison";

/**
 * WO-37: mapeo puro FDD → dimensiones de comparación (AC-MBC-003.1/.2) —
 * dimensión ausente = null explícito, jamás valores estimados.
 */

describe("dimensionsFromFdd", () => {
  it("rango completo con formato de moneda", () => {
    const d = dimensionsFromFdd({
      investment_range_min: { value: 250000 },
      investment_range_max: { value: 400000 },
      royalty_rate: { value: "6%" },
    });
    expect(d.investmentRange).toBe("$250,000 USD – $400,000 USD");
    expect(d.royaltyRate).toBe("6%");
  });

  it("solo mínimo disponible → muestra el mínimo, sin inventar el máximo", () => {
    const d = dimensionsFromFdd({ investment_range_min: { value: 180000 } });
    expect(d.investmentRange).toBe("$180,000 USD");
  });

  it("sin FDD → todo null (la UI muestra 'no disponible', nunca celda vacía)", () => {
    const d = dimensionsFromFdd(null);
    expect(d).toEqual({
      investmentRange: null,
      franchiseFee: null,
      royaltyRate: null,
      territoryStatus: null,
    });
  });

  it("franchise fee y territorio siempre null (el Agente 02 no los extrae aún)", () => {
    const d = dimensionsFromFdd({ investment_range_min: { value: 1 } });
    expect(d.franchiseFee).toBeNull();
    expect(d.territoryStatus).toBeNull();
  });
});

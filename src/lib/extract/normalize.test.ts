import { describe, it, expect } from "vitest";
import { rgbToHex, isVisibleColor, parsePx, normalizeFamily } from "./normalize";

describe("rgbToHex", () => {
  it("convierte rgb() a hex", () => {
    expect(rgbToHex("rgb(252, 76, 2)")).toBe("#fc4c02");
  });

  it("convierte rgba() opaco a hex ignorando alfa", () => {
    expect(rgbToHex("rgba(1, 1, 32, 1)")).toBe("#010120");
  });

  it("ya en hex lo normaliza a minúsculas de 6 dígitos", () => {
    expect(rgbToHex("#FFF")).toBe("#ffffff");
    expect(rgbToHex("#AABBCC")).toBe("#aabbcc");
  });

  it("devuelve null para valores no parseables", () => {
    expect(rgbToHex("transparent")).toBeNull();
    expect(rgbToHex("")).toBeNull();
  });
});

describe("isVisibleColor", () => {
  it("descarta transparentes", () => {
    expect(isVisibleColor("rgba(0, 0, 0, 0)")).toBe(false);
    expect(isVisibleColor("transparent")).toBe(false);
  });

  it("acepta colores con alfa significativo", () => {
    expect(isVisibleColor("rgb(0, 0, 0)")).toBe(true);
    expect(isVisibleColor("rgba(255, 0, 0, 0.5)")).toBe(true);
  });
});

describe("parsePx", () => {
  it("extrae el número de un valor px", () => {
    expect(parsePx("16px")).toBe(16);
    expect(parsePx("0.5px")).toBe(0.5);
  });

  it("devuelve null si no es px", () => {
    expect(parsePx("auto")).toBeNull();
    expect(parsePx("1rem")).toBeNull();
  });
});

describe("normalizeFamily", () => {
  it("toma la primera familia y quita comillas", () => {
    expect(normalizeFamily('"Inter", sans-serif')).toBe("Inter");
    expect(normalizeFamily("Helvetica Neue, Arial")).toBe("Helvetica Neue");
  });
});

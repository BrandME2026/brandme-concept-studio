import { describe, it, expect } from "vitest";
import { injectImages } from "./inject-images";

describe("injectImages", () => {
  const images = ["data:image/png;base64,AAA", "data:image/jpeg;base64,BBB"];

  it("sustituye {{IMG_1}} por la primera imagen", () => {
    const html = '<img src="{{IMG_1}}" alt="logo">';
    expect(injectImages(html, images)).toBe(
      '<img src="data:image/png;base64,AAA" alt="logo">',
    );
  });

  it("sustituye varios marcadores (1-indexado)", () => {
    const html = "<img src={{IMG_1}}><img src={{IMG_2}}>";
    expect(injectImages(html, images)).toBe(
      "<img src=data:image/png;base64,AAA><img src=data:image/jpeg;base64,BBB>",
    );
  });

  it("sustituye todas las ocurrencias del mismo marcador", () => {
    const html = "{{IMG_1}} y otra vez {{IMG_1}}";
    expect(injectImages(html, images)).toBe(
      "data:image/png;base64,AAA y otra vez data:image/png;base64,AAA",
    );
  });

  it("deja marcadores sin imagen como placeholder vacío (no rompe)", () => {
    const html = '<img src="{{IMG_3}}">';
    // IMG_3 no existe (solo hay 2) → se reemplaza por cadena vacía
    expect(injectImages(html, images)).toBe('<img src="">');
  });

  it("devuelve el html intacto si no hay marcadores", () => {
    const html = "<div>hola</div>";
    expect(injectImages(html, images)).toBe("<div>hola</div>");
  });
});

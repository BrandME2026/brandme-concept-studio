/**
 * Datos crudos extraídos del navegador. Todo son strings de CSS computado o
 * conteos; la normalización (hex, px, clustering) ocurre en Node (tokens.ts).
 */
export interface RawExtraction {
  title: string;
  viewport: { width: number; height: number };
  /** color CSS → conteo, por rol. */
  colors: {
    text: Record<string, number>;
    background: Record<string, number>;
    border: Record<string, number>;
  };
  /** valor de color usado en <a>/<button> con más frecuencia (candidato primary). */
  primaryCandidate: string | null;
  bodyBackground: string;
  bodyColor: string;
  /** font-family → {weights vistos, conteo, esHeading}. */
  fonts: Record<
    string,
    { weights: number[]; count: number; headingCount: number }
  >;
  baseFontSize: string;
  /** niveles tipográficos por etiqueta (h1..h6, p). */
  typeScale: Array<{
    level: string;
    fontSize: string;
    lineHeight: string;
    fontWeight: number;
  }>;
  spacing: Record<string, number>;
  radii: Record<string, number>;
  shadows: string[];
  maxWidth: string | null;
  usesFlex: boolean;
  usesGrid: boolean;
  /** Logo de la marca detectado: URL absoluta (img/icon/og) o SVG inline serializado. */
  logo: { src: string | null; kind: "img" | "svg" | "icon" | "og"; inlineSvg?: string } | null;
}

/**
 * Función serializada que se inyecta en la página vía page.evaluate().
 * NO puede referenciar nada del scope externo: todo va aquí dentro.
 */
export function extractFromDom(): RawExtraction {
  const inc = (map: Record<string, number>, key: string, by = 1) => {
    map[key] = (map[key] ?? 0) + by;
  };

  const colors = {
    text: {} as Record<string, number>,
    background: {} as Record<string, number>,
    border: {} as Record<string, number>,
  };
  const fonts: RawExtraction["fonts"] = {};
  const spacing: Record<string, number> = {};
  const radii: Record<string, number> = {};
  const shadowSet = new Set<string>();
  const primaryCounts: Record<string, number> = {};

  const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
  const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));

  for (const el of all) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue; // ignorar invisibles/diminutos
    const cs = getComputedStyle(el);

    inc(colors.text, cs.color);
    inc(colors.background, cs.backgroundColor);
    inc(colors.border, cs.borderColor);

    const family = cs.fontFamily;
    if (!fonts[family]) fonts[family] = { weights: [], count: 0, headingCount: 0 };
    fonts[family].count++;
    const weight = parseInt(cs.fontWeight, 10);
    if (!Number.isNaN(weight) && !fonts[family].weights.includes(weight)) {
      fonts[family].weights.push(weight);
    }
    if (HEADING_TAGS.has(el.tagName)) fonts[family].headingCount++;

    for (const prop of [
      cs.paddingTop,
      cs.paddingLeft,
      cs.marginTop,
      cs.gap,
    ]) {
      const n = parseFloat(prop);
      if (!Number.isNaN(n) && n > 0) inc(spacing, String(Math.round(n)));
    }

    const r = parseFloat(cs.borderRadius);
    if (!Number.isNaN(r) && r > 0) inc(radii, String(r));

    if (cs.boxShadow && cs.boxShadow !== "none") shadowSet.add(cs.boxShadow);

    if (el.tagName === "A" || el.tagName === "BUTTON") {
      inc(primaryCounts, cs.color);
      inc(primaryCounts, cs.backgroundColor);
    }
  }

  const typeScale: RawExtraction["typeScale"] = [];
  for (const level of ["h1", "h2", "h3", "p"]) {
    const el = document.querySelector<HTMLElement>(level);
    if (el) {
      const cs = getComputedStyle(el);
      typeScale.push({
        level,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
      });
    }
  }

  const primaryCandidate =
    Object.entries(primaryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // max-width del contenedor principal más ancho con límite
  let maxWidth: string | null = null;
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.maxWidth && cs.maxWidth !== "none") {
      maxWidth = cs.maxWidth;
      break;
    }
  }

  const usesFlex = all.some((el) => getComputedStyle(el).display === "flex");
  const usesGrid = all.some((el) => getComputedStyle(el).display === "grid");

  const bodyCs = getComputedStyle(document.body);

  // ── Detección del logo de la marca ───────────────────────────────────────
  const findLogo = (): RawExtraction["logo"] => {
    const abs = (u: string) => {
      try {
        return new URL(u, location.href).href;
      } catch {
        return null;
      }
    };
    // Nombre de marca derivado del hostname (frisby.com.co → "frisby").
    const brand = location.hostname.replace(/^www\./, "").split(".")[0] ?? "";
    const hint = (s: string | null) =>
      !!s && /logo|brand/i.test(s) === true ? 2 : !!s && brand && s.toLowerCase().includes(brand) ? 2 : 0;

    // 1) <img>/<svg> en header/nav con señal textual o link a la home.
    const containers = document.querySelectorAll<HTMLElement>(
      'header, nav, [role="banner"], [class*="header" i], [class*="nav" i]',
    );
    let best: { el: Element; score: number } | null = null;
    containers.forEach((c) => {
      c.querySelectorAll<HTMLElement>("img, svg").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 16 || rect.height < 16) return;
        if (/icon|social/i.test(el.className?.toString() ?? "")) return;
        let score = 1;
        if (el.tagName === "IMG") {
          const img = el as HTMLImageElement;
          score += hint(img.getAttribute("alt")) + hint(img.className) + hint(img.id);
        } else {
          score += hint(el.className?.toString() ?? "") + hint(el.id);
        }
        const a = el.closest("a");
        if (a && (a.getAttribute("href") === "/" || a.href === location.origin + "/")) score += 2;
        if (!best || score > best.score) best = { el, score };
      });
    });
    if (best) {
      const { el } = best as { el: Element };
      if (el.tagName === "IMG") {
        const src = abs((el as HTMLImageElement).src);
        if (src) return { src, kind: "img" };
      } else {
        return { src: null, kind: "svg", inlineSvg: new XMLSerializer().serializeToString(el) };
      }
    }

    // 2) apple-touch-icon / icon de mayor resolución.
    const icons = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="apple-touch-icon"], link[rel~="icon"]'),
    )
      .map((l) => ({ href: l.href, size: parseInt(l.getAttribute("sizes")?.split("x")[0] ?? "0", 10) }))
      .filter((i) => i.href)
      .sort((a, b) => b.size - a.size);
    if (icons[0] && icons[0].size >= 32) {
      const src = abs(icons[0].href);
      if (src) return { src, kind: "icon" };
    }

    // 3) og:image como último recurso.
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
    if (og) {
      const src = abs(og);
      if (src) return { src, kind: "og" };
    }
    return null;
  };

  return {
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    colors,
    primaryCandidate,
    bodyBackground: bodyCs.backgroundColor,
    bodyColor: bodyCs.color,
    fonts,
    baseFontSize: bodyCs.fontSize,
    typeScale,
    spacing,
    radii,
    shadows: Array.from(shadowSet).slice(0, 12),
    maxWidth,
    usesFlex,
    usesGrid,
    logo: findLogo(),
  };
}

/**
 * Script inyectado por LocalScrapeProvider vía page.evaluate (WO-13). Debe ser
 * autocontenido (se serializa al navegador — sin referencias de scope externo).
 * Captura CONTENIDO (texto, headings, links, meta) + candidato a logo; el
 * diseño visual es territorio de src/lib/extract/extractor-script.ts.
 */

export interface RawScrape {
  title: string;
  metaDescription: string | null;
  ogImage: string | null;
  headings: string[];
  text: string;
  links: Array<{ href: string; text: string }>;
  hasPasswordInput: boolean;
  scriptCount: number;
  logo: { kind: "img" | "svg" | "icon" | "og"; src?: string; inlineSvg?: string } | null;
}

export function scrapeFromDom(): RawScrape {
  const meta = (name: string, attr: "name" | "property"): string | null =>
    document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)?.content ?? null;

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0 && t.length < 300)
    .slice(0, 60);

  const text = (document.body?.innerText ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    .map((a) => ({
      href: a.href,
      text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    }))
    .filter((l) => l.href.startsWith("http"))
    .slice(0, 300);

  // Logo: img/svg en header/nav con señales en alt/class/id (versión de
  // contenido del findLogo del extractor visual) → og:image → icon.
  function findLogo(): RawScrape["logo"] {
    const containers = document.querySelectorAll(
      'header, nav, [role="banner"], [class*="header" i], [class*="nav" i]',
    );
    for (const container of Array.from(containers)) {
      for (const el of Array.from(container.querySelectorAll("img, svg"))) {
        const hay = `${el.getAttribute("alt") ?? ""} ${el.className ?? ""} ${el.id ?? ""}`
          .toString()
          .toLowerCase();
        const inHomeLink = el.closest('a[href="/"], a[href*="://"]') !== null;
        if (/logo|brand/.test(hay) || (el.tagName === "IMG" && inHomeLink)) {
          if (el.tagName === "SVG") {
            const svg = el.outerHTML;
            if (svg.length < 100_000) return { kind: "svg", inlineSvg: svg };
          } else {
            const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
            if (src) return { kind: "img", src };
          }
        }
      }
    }
    const og = meta("og:image", "property");
    if (og) return { kind: "og", src: og };
    const icon = document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"], link[rel="icon"], link[rel="shortcut icon"]',
    );
    if (icon?.href) return { kind: "icon", src: icon.href };
    return null;
  }

  return {
    title: document.title ?? "",
    metaDescription: meta("description", "name"),
    ogImage: meta("og:image", "property"),
    headings,
    text,
    links,
    hasPasswordInput: document.querySelector('input[type="password"]') !== null,
    scriptCount: document.querySelectorAll("script").length,
    logo: findLogo(),
  };
}

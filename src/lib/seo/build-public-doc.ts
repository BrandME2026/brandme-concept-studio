/**
 * Documento HTML COMPLETO e indexable para la página pública /p/[slug].
 * A diferencia de build-srcdoc (iframe del preview), este se SIRVE como documento
 * propio (route handler) con <head> SEO real: meta, canonical, OG, JSON-LD.
 * El <body> es el HTML generado por el LLM (ya con {{IMG}}/{{LOGO}} sustituidos).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Escapa para insertar en atributos/texto HTML (evita romper el markup/meta). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface PublicDocMeta {
  slug: string | null;
  name: string | null;
  brand: string | null;
  city: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  screenshot: string | null;
  lang?: "es" | "en";
}

export function buildPublicDoc(html: string, meta: PublicDocMeta): string {
  const lang = meta.lang ?? "es";
  const title = meta.metaTitle || meta.name || "Francast.ai";
  const description =
    meta.metaDescription ||
    (meta.brand ? `${meta.brand}${meta.city ? ` en ${meta.city}` : ""} — Francast.ai` : "Francast.ai");
  const canonical = meta.slug ? `${SITE_URL}/p/${meta.slug}` : SITE_URL;
  const ogImage = meta.screenshot && meta.screenshot.startsWith("http") ? meta.screenshot : "";

  // JSON-LD LocalBusiness con marca + ciudad (ayuda a Google a entender la página).
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: meta.brand || title,
    description,
    url: canonical,
    ...(meta.city ? { areaServed: meta.city } : {}),
  });

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<script type="application/ld+json">${jsonLd}</script>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.css">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js"></script>
<style>*{box-sizing:border-box} body{margin:0} [data-aos]{pointer-events:auto}</style>
</head>
<body>
${html}
<script>
  (function () {
    function boot() {
      try { if (window.gsap && window.ScrollTrigger) window.gsap.registerPlugin(window.ScrollTrigger); } catch (e) {}
      try { if (window.AOS) window.AOS.init({ duration: 700, once: true, offset: 60 }); } catch (e) {}
      try { if (typeof window.__init__ === "function") window.__init__(); } catch (e) {}
      try { window.ScrollTrigger && window.ScrollTrigger.refresh(); } catch (e) {}
    }
    if (document.readyState === "complete") boot();
    else window.addEventListener("load", boot);
  })();
</script>
</body>
</html>`;
}

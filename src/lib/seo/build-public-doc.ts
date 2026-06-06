/**
 * Documento HTML COMPLETO e indexable para la página pública /p/[slug].
 * A diferencia de build-srcdoc (iframe del preview), este se SIRVE como documento
 * propio (route handler) con <head> SEO real: meta, canonical, OG, JSON-LD.
 * El <body> es el HTML generado por el LLM (ya con {{IMG}}/{{LOGO}} sustituidos).
 *
 * SEGURIDAD: el route handler sirve este documento con cabecera
 * `Content-Security-Policy: sandbox allow-scripts` → origen opaco, los scripts del
 * HTML del LLM NO acceden a cookies/storage de la app.
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

/**
 * Escapa una cadena JSON para incrustarla en un <script>: neutraliza los chars que
 * podrían cerrar el tag (`<`, `>`, `&`) o romper el parser (U+2028/U+2029).
 */
function escapeJsonForScript(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
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

/** iframe de primera parte con el formulario de captura. Va aquí (al servir) porque
 *  necesita el slug, que solo se conoce en este punto. El iframe SÍ puede hacer fetch
 *  a /api/leads (es nuestra app), a diferencia del HTML del LLM bajo sandbox. */
function leadFormIframe(slug: string | null, brand: string | null, lang: "es" | "en"): string {
  if (!slug) return "";
  const qs = new URLSearchParams({ slug, brand: brand ?? "", lang }).toString();
  // sandbox propio del iframe: allow-same-origin + allow-scripts para que el widget de
  // primera parte pueda hacer fetch a /api/leads (el documento padre va sin same-origin).
  return `<iframe src="/embed/lead-form?${qs}" title="Contacto" loading="lazy" sandbox="allow-same-origin allow-scripts allow-forms" style="width:100%;max-width:440px;border:0;height:430px;margin:0 auto;display:block"></iframe>`;
}

/** Burbuja flotante (abajo-izquierda) que abre el agente de captación en un iframe. */
function floatingAgent(
  slug: string,
  brand: string | null,
  city: string | null,
  lang: "es" | "en",
): string {
  const qs = new URLSearchParams({ slug, brand: brand ?? "", city: city ?? "", lang }).toString();
  const label = lang === "en" ? "Chat" : "Asesor";
  // Toggle por JS inline (sin frameworks). El iframe carga lazy al abrir.
  return `
<div id="fc-agent" style="position:fixed;left:20px;bottom:20px;z-index:9998;font-family:system-ui,sans-serif">
  <div id="fc-agent-box" style="display:none;width:360px;max-width:90vw;height:480px;max-height:70vh;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);overflow:hidden;margin-bottom:10px">
    <iframe data-src="/embed/agent?${qs}" title="${esc(label)}" sandbox="allow-same-origin allow-scripts allow-forms" style="width:100%;height:100%;border:0"></iframe>
  </div>
  <button id="fc-agent-btn" type="button" aria-label="${esc(label)}" style="display:flex;align-items:center;gap:8px;background:#111;color:#fff;border:none;border-radius:999px;padding:12px 18px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)">💬 ${esc(label)}</button>
</div>
<script>
  (function(){
    var btn=document.getElementById('fc-agent-btn'),box=document.getElementById('fc-agent-box');
    var f=box&&box.querySelector('iframe'),loaded=false;
    if(!btn||!box)return;
    btn.addEventListener('click',function(){
      var open=box.style.display==='block';
      box.style.display=open?'none':'block';
      if(!open&&!loaded&&f){f.src=f.getAttribute('data-src');loaded=true;}
    });
  })();
</script>`;
}

export function buildPublicDoc(html: string, meta: PublicDocMeta): string {
  const lang = meta.lang ?? "es";
  const title = meta.metaTitle || meta.name || "Francast.ai";
  const description =
    meta.metaDescription ||
    (meta.brand ? `${meta.brand}${meta.city ? ` en ${meta.city}` : ""} — Francast.ai` : "Francast.ai");
  const canonical = meta.slug ? `${SITE_URL}/p/${meta.slug}` : SITE_URL;
  const ogImage = meta.screenshot && meta.screenshot.startsWith("http") ? meta.screenshot : "";

  // Sustituir el marcador del formulario por el iframe de captura (con el slug real).
  const bodyHtml = html.replace(
    /\{\{LEAD_FORM\}\}/g,
    leadFormIframe(meta.slug, meta.brand, lang),
  );

  // Agente de captación flotante (burbuja abajo-izquierda; WhatsApp suele ir abajo-derecha).
  const agentWidget = meta.slug ? floatingAgent(meta.slug, meta.brand, meta.city, lang) : "";

  // JSON-LD LocalBusiness con marca + ciudad (ayuda a Google a entender la página).
  const jsonLd = escapeJsonForScript(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: meta.brand || title,
      description,
      url: canonical,
      ...(meta.city ? { areaServed: meta.city } : {}),
    }),
  );

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
${bodyHtml}
${agentWidget}
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

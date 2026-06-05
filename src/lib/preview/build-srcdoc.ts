/**
 * Envuelve el HTML generado por el LLM en un documento autocontenido para el iframe:
 * Tailwind (estilos) + GSAP/ScrollTrigger + AOS (animaciones "vivas"), todo por CDN.
 *
 * El JS que produce el modelo se define como `window.__init__` en el HTML; el runtime
 * de aquí lo ejecuta tras cargar las librerías, envuelto en try/catch para que un fallo
 * de animación no deje la página en blanco (degrada a estática).
 */
export function buildSrcDoc(html: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
      try {
        if (window.gsap && window.ScrollTrigger) {
          window.gsap.registerPlugin(window.ScrollTrigger);
        }
      } catch (e) { console.warn("gsap init", e); }
      try {
        if (window.AOS) window.AOS.init({ duration: 700, once: true, offset: 60 });
      } catch (e) { console.warn("aos init", e); }
      // JS de la propuesta (animaciones/componentes definidos por el modelo).
      try {
        if (typeof window.__init__ === "function") window.__init__();
      } catch (e) { console.warn("__init__ error", e); }
      // Recalcular ScrollTrigger tras layout/imagenes.
      try { window.ScrollTrigger && window.ScrollTrigger.refresh(); } catch (e) {}
    }
    if (document.readyState === "complete") boot();
    else window.addEventListener("load", boot);
  })();
</script>
</body>
</html>`;
}

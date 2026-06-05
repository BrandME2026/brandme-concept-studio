/**
 * Envuelve el HTML generado por el LLM en un documento autocontenido con Tailwind
 * por CDN, listo para renderizar en un iframe sandboxed (srcDoc).
 */
export function buildSrcDoc(html: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<style>*{box-sizing:border-box} body{margin:0}</style>
</head>
<body>
${html}
</body>
</html>`;
}

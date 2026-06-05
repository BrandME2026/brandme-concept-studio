/**
 * Sustituye los marcadores {{IMG_n}} que el LLM colocó en el HTML por las data URLs
 * reales de las imágenes que subió el usuario (1-indexado). Marcadores sin imagen
 * correspondiente se reemplazan por cadena vacía para no romper el HTML.
 */
export function injectImages(html: string, images: string[]): string {
  return html.replace(/\{\{IMG_(\d+)\}\}/g, (_match, n) => {
    const idx = Number(n) - 1;
    return images[idx] ?? "";
  });
}

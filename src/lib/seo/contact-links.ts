/**
 * Construye los enlaces de contacto (WhatsApp / correo) para las páginas generadas.
 * Datos REALES que da el consultor — si falta o es inválido, devuelve "" y el botón
 * simplemente no se renderiza (no inventamos contactos ni generamos enlaces rotos).
 */

/** Mensaje pre-escrito que el interesado envía, con marca + ciudad cuando hay. */
function prefillMessage(brand: string, city: string | null): string {
  const where = city ? ` en ${city}` : "";
  return `Hola, me interesa la franquicia de ${brand}${where}. ¿Me das más información?`;
}

/**
 * wa.me solo acepta dígitos con código de país. Normaliza quitando todo lo no numérico.
 * Exige al menos 8 dígitos (un número plausible con país); si no, devuelve "".
 */
export function buildWhatsAppLink(
  whatsapp: string | null | undefined,
  brand: string,
  city: string | null,
): string {
  if (!whatsapp) return "";
  const digits = whatsapp.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  const text = encodeURIComponent(prefillMessage(brand, city));
  return `https://wa.me/${digits}?text=${text}`;
}

/**
 * tel: con el número normalizado. Conserva un "+" inicial (código de país) y dígitos.
 * Exige 8-15 dígitos como en WhatsApp; si no es plausible, devuelve "".
 */
export function buildPhoneLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  const plus = phone.trim().startsWith("+") ? "+" : "";
  return `tel:${plus}${digits}`;
}

/** mailto con asunto pre-llenado. Valida un email mínimamente; si no, "". */
export function buildMailtoLink(
  email: string | null | undefined,
  brand: string,
  city: string | null,
): string {
  if (!email) return "";
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "";
  const where = city ? ` en ${city}` : "";
  const subject = encodeURIComponent(`Interés en franquicia ${brand}${where}`);
  return `mailto:${e}?subject=${subject}`;
}

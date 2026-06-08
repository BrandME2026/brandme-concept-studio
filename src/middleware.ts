import { NextResponse } from "next/server";

/**
 * Headers de seguridad globales (defensa en profundidad). Se aplican a toda la app
 * EXCEPTO /p/* — esas rutas sirven el HTML del LLM con su propia CSP sandbox (origen
 * opaco) desde el route handler; el middleware NO debe pisarla. Los /embed/* sí pasan
 * por aquí: X-Frame-Options SAMEORIGIN los permite porque se cargan en el documento
 * de la página pública, que es del mismo origen.
 */
export function middleware() {
  const res = NextResponse.next();
  const h = res.headers;
  // HSTS: fuerza HTTPS en visitas futuras (Railway sirve por TLS).
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Anti-clickjacking: la app no debe poder embeberse en sitios de terceros.
  h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // La app no usa cámara/micro/geolocalización: denegarlas reduce superficie.
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

// Excluir /p/ (CSP propia), assets estáticos y favicon. El resto pasa por el middleware.
export const config = {
  matcher: ["/((?!p/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt).*)"],
};

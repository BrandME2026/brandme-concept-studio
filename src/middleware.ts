import { NextResponse, type NextRequest } from "next/server";

/**
 * Headers de seguridad globales (defensa en profundidad). Se aplican a toda la app
 * EXCEPTO /p/* — esas rutas sirven el HTML del LLM con su propia CSP sandbox (origen
 * opaco) desde el route handler; el middleware NO debe pisarla.
 *
 * CASO /embed/* (form de captura + agente): se incrustan DENTRO de la página pública
 * /p/[slug], que corre bajo CSP `sandbox` → su origen es OPACO. Con X-Frame-Options:
 * SAMEORIGIN el navegador los bloquea ("refused to connect") porque el origen opaco no
 * cuenta como "same origin". Por eso a /embed/* NO les ponemos X-Frame-Options y usamos
 * CSP `frame-ancestors` para permitir el embebido desde nuestro propio sitio.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const h = res.headers;
  // HSTS: fuerza HTTPS en visitas futuras (Railway sirve por TLS).
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const isEmbed = req.nextUrl.pathname.startsWith("/embed/");
  if (isEmbed) {
    // Permitir el embebido SOLO desde nuestro propio sitio (incl. el origen opaco del
    // sandbox de /p/, que se resuelve por la cadena de framing). No usamos el token
    // `https:` (dejaría que cualquier sitio HTTPS embeba el form → clickjacking/phishing).
    h.set("Content-Security-Policy", "frame-ancestors 'self'");
  } else {
    // El resto de la app no debe embeberse en sitios de terceros (anti-clickjacking).
    h.set("X-Frame-Options", "SAMEORIGIN");
  }
  return res;
}

// Excluir /p/ (CSP propia), assets estáticos y favicon. El resto pasa por el middleware.
export const config = {
  matcher: ["/((?!p/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt).*)"],
};

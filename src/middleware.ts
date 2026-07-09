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
const SESSION_COOKIE = "bmc_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 año

export function middleware(req: NextRequest) {
  // WO-3: la cookie de sesión se acuña AQUÍ y solo en navegaciones de documento
  // (Accept: text/html). Las APIs ya no crean sesión: sin cookie → 401. El header
  // Cookie del request se reescribe para que cookies() downstream la vea ya en
  // el primer render.
  let res: NextResponse;
  const isDocument = req.headers.get("accept")?.includes("text/html") ?? false;
  if (isDocument && !req.cookies.get(SESSION_COOKIE)) {
    const id = crypto.randomUUID();
    const requestHeaders = new Headers(req.headers);
    const cookieHeader = requestHeaders.get("cookie");
    requestHeaders.set(
      "cookie",
      cookieHeader ? `${cookieHeader}; ${SESSION_COOKIE}=${id}` : `${SESSION_COOKIE}=${id}`,
    );
    res = NextResponse.next({ request: { headers: requestHeaders } });
    res.cookies.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });
  } else {
    res = NextResponse.next();
  }
  const h = res.headers;
  // HSTS con preload (AC-SEC-002.2): fuerza HTTPS en visitas futuras.
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // CSP de las páginas HTML de la app (WO-32, AC-SEC-002.1). Lista de fuentes
  // APROBADA y documentada: 'unsafe-inline' es requerido por la hydration de
  // Next y los estilos inline de Tailwind; los CDNs son los MISMOS ya aprobados
  // para el contenido LLM de /p/[slug] — el preview del studio es un iframe
  // srcdoc que HEREDA esta CSP, así que debe poder cargar esos CDNs. Cambios a
  // esta lista rompen el spec e2e de headers (gate anti-drift, ADR-001).
  const APP_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "frame-src 'self'",
  ].join("; ");

  const isEmbed = req.nextUrl.pathname.startsWith("/embed/");
  if (isEmbed) {
    // Permitir el embebido SOLO desde nuestro propio sitio (incl. el origen opaco del
    // sandbox de /p/, que se resuelve por la cadena de framing). No usamos el token
    // `https:` (dejaría que cualquier sitio HTTPS embeba el form → clickjacking/phishing).
    h.set("Content-Security-Policy", `${APP_CSP}; frame-ancestors 'self'`);
  } else {
    // El resto de la app no debe embeberse en sitios de terceros (anti-clickjacking).
    h.set("X-Frame-Options", "SAMEORIGIN");
    if (isDocument) {
      h.set("Content-Security-Policy", APP_CSP);
    }
  }
  return res;
}

// Excluir /p/ (CSP propia), assets estáticos y favicon. El resto pasa por el middleware.
export const config = {
  matcher: ["/((?!p/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt).*)"],
};

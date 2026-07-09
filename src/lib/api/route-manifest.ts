/**
 * Manifiesto de aislamiento por endpoint (WO-3, AC-PF-002.3). TODA ruta de
 * src/app (route.ts / sitemap.ts) y toda página server que toque DB debe estar
 * clasificada aquí. El test tests/db/endpoint-registry.test.ts falla nombrando
 * cualquier endpoint sin clasificar — un endpoint nuevo sin decisión de
 * aislamiento es un fallo de CI, no un descuido silencioso.
 */

export type RouteAccess =
  /** Requiere sesión → tenantRoute + withTenant; sin cookie responde 401. */
  | "tenant"
  /** Superficie pública: acceso a datos SOLO bajo withSystemContext(reason). */
  | "public-system"
  /** No toca la base de datos. */
  | "no-db";

export interface RouteEntry {
  /** Ruta relativa a src/app, sin el archivo (p.ej. "api/generate"). */
  route: string;
  access: RouteAccess;
}

export const ROUTE_MANIFEST: RouteEntry[] = [
  // ── tenant (consultor autenticado por sesión) ─────────────────────────────
  { route: "api/auth/link", access: "tenant" }, // internamente system para el merge
  { route: "api/checkout", access: "tenant" },
  { route: "api/conversations", access: "tenant" },
  { route: "api/conversations/[id]", access: "tenant" },
  { route: "api/generate", access: "tenant" },
  { route: "api/history", access: "tenant" },
  { route: "api/history/[id]", access: "tenant" },
  { route: "api/leads", access: "tenant" }, // MIXTA: GET tenant (leads del consultor); POST public-system (visitante anónimo)
  { route: "api/publish", access: "tenant" },
  { route: "api/subscription", access: "tenant" },
  { route: "c/[conversationId]", access: "tenant" }, // página server

  // ── public-system (visitante anónimo; datos bajo withSystemContext) ──────
  { route: "api/agent", access: "public-system" },
  { route: "api/discoverability/skills/[[...path]]", access: "public-system" }, // /.well-known/skills (rewrite)
  { route: "api/chat", access: "public-system" },
  { route: "api/gallery", access: "public-system" },
  { route: "api/gallery/[id]", access: "public-system" },
  { route: "api/stripe/webhook", access: "public-system" },
  { route: "llms.txt", access: "public-system" },
  { route: "p/[slug]", access: "public-system" },
  { route: "p/[slug]/llms.txt", access: "public-system" },
  { route: "[consultantSlug]/[brandSlug]", access: "public-system" }, // BrandMePage (WO-15): solo published
  { route: "[consultantSlug]/[brandSlug]/llms.txt", access: "public-system" }, // 404 salvo published
  { route: "preview/[token]", access: "public-system" }, // preview time-limited, noindex
  { route: "sitemap", access: "public-system" },
  { route: "webs", access: "public-system" }, // página server (galería)

  // ── no-db ─────────────────────────────────────────────────────────────────
  { route: "api/extract", access: "no-db" },
  { route: "api/resolve", access: "no-db" },
  { route: "api/speech-to-text", access: "no-db" },
  { route: "api/text-to-speech", access: "no-db" },
  { route: "api/voice-capabilities", access: "no-db" },
];

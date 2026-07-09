import { NextResponse } from "next/server";
import { streamText, Output } from "ai";
import { z } from "zod";
import {
  getDesignModel,
  assertOpenRouterConfigured,
  REASONING_PROVIDER_OPTIONS,
} from "@/lib/ai/openrouter";
import { generateSystemPrompt } from "@/lib/ai/prompts";
import { buildGenerateMessages } from "@/lib/ai/build-messages";
import { designProposalSchema, tokensSchema, QUALITY_VALUES } from "@/lib/schemas";
import { serializeDesignMd } from "@/lib/ai/design-md";
import { injectImages } from "@/lib/preview/inject-images";
import { readSessionId } from "@/lib/session";
import { saveGeneration, findGenerationByBrandCity, uniqueSlug } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";
import { withSystemContext, withTenant } from "@/lib/db/tenant-context";
import { tenantRoute } from "@/lib/api/tenant-route";
import { isStripeConfigured } from "@/lib/stripe/client";
import { slugify } from "@/lib/seo/slug";
import { buildWhatsAppLink, buildMailtoLink, buildPhoneLink } from "@/lib/seo/contact-links";
import { compileTailwindForHtml } from "@/lib/seo/compile-css";
import { checkRateLimit, clientKey, llmBudget, tooMany, budgetExceeded } from "@/lib/security/rate-limit";
import type { DesignTokens } from "@/types/design";
import { captureError } from "@/lib/observability/observability";

export const runtime = "nodejs";
export const maxDuration = 120;

// Topes de tamaño anti-payload-bomb (un solo request no debe inflar coste/RAM).
const MAX_SCREENSHOT = 14_000_000; // ~14MB en base64 data-URI
const MAX_IMG = 8_000_000;

const generateBodySchema = z.object({
  tokens: tokensSchema,
  screenshot: z.string().max(MAX_SCREENSHOT),
  brief: z.string().max(2000).default("Propón un diseño inspirado en esta web."),
  language: z.enum(["es", "en"]).default("es"),
  // Imágenes del usuario (data URLs) para incrustar en el diseño generado.
  images: z.array(z.string().max(MAX_IMG)).max(6).default([]),
  // Logo subido por el usuario (data URL); si viene, MANDA sobre el logo extraído.
  logo: z.string().max(MAX_IMG).optional(),
  // Calidad/modelo (allowlist); "alta" = GPT-5.5.
  quality: z.enum(QUALITY_VALUES).default("alta"),
  // Contexto de marca para personalización + SEO de la página generada.
  seo: z
    .object({
      brand: z.string().max(120).optional(),
      city: z.string().max(120).optional(),
      positioning: z.string().max(400).optional(),
      whatsapp: z.string().max(40).optional(),
      email: z.string().max(160).optional(),
      phone: z.string().max(40).optional(),
      sellingPoints: z.string().max(800).optional(),
      formFields: z
        .array(z.enum(["nombre", "email", "telefono", "ciudad", "inversion", "mensaje"]))
        .max(6)
        .optional(),
    })
    .optional(),
});

/**
 * Stream NDJSON: una línea JSON por evento. El usuario ve la propuesta construirse
 * en vivo (nombre → colores → tipografía → html) en vez de un spinner mudo.
 *  {type:"partial", object}  → objeto parcial conforme se genera
 *  {type:"progress", field}  → campo de alto nivel recién completado
 *  {type:"reasoning", text}  → fragmento del razonamiento del modelo (si lo emite)
 *  {type:"done", proposal, designMd, html}
 *  {type:"error", message}
 */
const postHandler = tenantRoute(async (req, _ctx, { consultantId }) => {
  const parsed = generateBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_INPUT", message: "Faltan tokens o screenshot" },
      },
      { status: 400 },
    );
  }

  const tokens = parsed.data.tokens as unknown as DesignTokens;
  const { screenshot, brief, language, images, logo: userLogo, quality, seo } = parsed.data;

  // Sesión para la columna de trazabilidad; tenantRoute garantiza la cookie.
  const sessionId = (await readSessionId())!;
  const sourceUrl = tokens?.meta?.url ?? "";

  // Anti-duplicado (antes de gastar tokens del LLM): si ya existe una página para
  // esta marca+ciudad DEL TENANT, la reusamos en vez de generar otra clónica.
  const dupBrand = seo?.brand?.trim();
  if (isDbConfigured() && dupBrand) {
    try {
      const existing = await withTenant(consultantId, () =>
        findGenerationByBrandCity(dupBrand, seo?.city?.trim() ?? null),
      );
      if (existing?.slug) {
        return NextResponse.json({
          success: true,
          data: {
            duplicate: true,
            slug: existing.slug,
            message: "Ya existe una web para esta marca y ciudad.",
          },
        });
      }
    } catch (e) {
      // Si el check falla, no bloqueamos la generación (degradación elegante).
      captureError(e, "[generate] check de duplicado falló");
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      // Escritura segura: si el cliente desconectó o el stream ya cerró, no relanzar.
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        const result = streamText({
          model: await getDesignModel(quality),
          experimental_output: Output.object({ schema: designProposalSchema }),
          system: generateSystemPrompt(language, images.length, Boolean(userLogo || tokens?.meta?.logo), seo),
          messages: buildGenerateMessages(tokens, screenshot, brief, images),
          providerOptions: REASONING_PROVIDER_OPTIONS,
        });

        // Consumimos dos vistas del mismo stream interno en paralelo:
        // - fullStream: para el razonamiento del modelo (reasoning-delta).
        // - partialOutputStream: para el objeto parcial → 6 pasos del studio.
        const reasoningPump = (async () => {
          for await (const part of result.fullStream) {
            if (closed) break;
            if (part.type === "reasoning-delta") {
              send({ type: "reasoning", text: part.text });
            }
          }
        })();

        const seenFields = new Set<string>();
        const partialPump = (async () => {
          for await (const partial of result.partialOutputStream) {
            if (closed) break;
            send({ type: "partial", object: partial });
            for (const field of Object.keys(partial ?? {})) {
              if (!seenFields.has(field)) {
                seenFields.add(field);
                send({ type: "progress", field });
              }
            }
          }
        })();

        await Promise.all([reasoningPump, partialPump]);

        const object = await result.output;
        const designMd = serializeDesignMd(object);
        // Sustituir los marcadores {{IMG_n}} por las imágenes del usuario y {{LOGO}}
        // por el logo oficial extraído (data URI). Si no hay logo, se limpia el marcador.
        let html = injectImages(object.html, images);
        // Logo subido por el usuario MANDA sobre el extraído de la web.
        html = html.replace(/\{\{LOGO\}\}/g, userLogo ?? tokens?.meta?.logo ?? "");

        const brand = seo?.brand ?? object.name;
        const city = seo?.city ?? null;
        const slugBase = slugify(brand, city);

        // CONTACTO (captación): sustituir los marcadores por enlaces reales. Si el consultor
        // no dio el dato, el marcador se limpia (el botón no aparece) — nada inventado.
        const waLink = buildWhatsAppLink(seo?.whatsapp, brand, city);
        const mailLink = buildMailtoLink(seo?.email, brand, city);
        const phoneLink = buildPhoneLink(seo?.phone);
        html = html.replace(/\{\{WHATSAPP_URL\}\}/g, waLink);
        html = html.replace(/\{\{EMAIL\}\}/g, mailLink);
        html = html.replace(/\{\{PHONE_URL\}\}/g, phoneLink);

        // SEO/velocidad: compilar el CSS de Tailwind de ESTE HTML para servirlo inline
        // (evita el CDN-JIT en el navegador → mejor LCP). Si falla, css=null → fallback CDN.
        const css = await compileTailwindForHtml(html);

        // Guardar en el historial (secundario: no romper la generación si falla).
        // El slug único se reserva bajo system scope (la unicidad es GLOBAL entre
        // tenants); el INSERT corre en su propio bloque withTenant — la llamada al
        // LLM ya terminó, ningún contexto de DB estuvo abierto durante el stream.
        let slug: string | null = null;
        if (isDbConfigured()) {
          try {
            const finalSlug = slugBase
              ? await withSystemContext("slug-unico", () => uniqueSlug(slugBase))
              : null;
            const saved = await withTenant(consultantId, () =>
              saveGeneration({
              sessionId,
              url: sourceUrl,
              name: object.name,
              designMd,
              html,
              screenshot,
              interactions: object.interactions ?? null,
              slug: finalSlug,
              brand,
              city,
              metaTitle: object.seo?.metaTitle ?? null,
              metaDescription: object.seo?.metaDescription ?? null,
              whatsapp: seo?.whatsapp ?? null,
              email: seo?.email ?? null,
              phone: seo?.phone ?? null,
              keywords: object.seo?.keywords ?? null,
              faq: object.faq ?? null,
              css,
              formFields: seo?.formFields ?? null,
              // Sin Stripe configurado → publicar gratis (legacy): nace publicada.
              // Con Stripe → nace en borrador hasta que el usuario pague y publique.
              published: !isStripeConfigured(),
              }),
            );
            slug = saved.slug;
          } catch (e) {
            captureError(e, "[generate] no se pudo guardar en historial");
          }
        }

        send({ type: "done", proposal: object, designMd, html, slug, brand, city });
      } catch (err) {
        captureError(err, "[generate] fallo generando propuesta");
        send({ type: "error", message: "No se pudo generar la propuesta" });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // ya cerrado por el cliente
          }
        }
      }
    },
    cancel() {
      // El cliente abortó la conexión: detener el bucle de escritura.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}, { limit: "generate" });

export async function POST(req: Request, ctx: unknown) {
  // Anti-abuso: rate-limit por IP + tope diario global (operación CARA: GPT-5.5/Sonnet).
  const rl = await checkRateLimit("generate", `generate:${clientKey(req)}`);
  if (!rl.ok) return tooMany(rl.retryAfter);
  if (!(await llmBudget.tryConsume())) {
    console.warn("[generate] tope diario de LLM alcanzado", llmBudget.status());
    return budgetExceeded();
  }

  try {
    assertOpenRouterConfigured();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOT_CONFIGURED",
          message: "El servicio de IA no está configurado (falta OPENROUTER_API_KEY).",
        },
      },
      { status: 503 },
    );
  }

  return postHandler(req, ctx);
}

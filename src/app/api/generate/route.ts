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
import { getSessionId } from "@/lib/session";
import { saveGeneration } from "@/lib/db/history";
import { isDbConfigured } from "@/lib/db/client";
import type { DesignTokens } from "@/types/design";

export const runtime = "nodejs";
export const maxDuration = 120;

const generateBodySchema = z.object({
  tokens: tokensSchema,
  screenshot: z.string(),
  brief: z.string().default("Propón un diseño inspirado en esta web."),
  language: z.enum(["es", "en"]).default("es"),
  // Imágenes del usuario (data URLs) para incrustar en el diseño generado.
  images: z.array(z.string()).max(6).default([]),
  // Calidad/modelo (allowlist); "alta" = GPT-5.5.
  quality: z.enum(QUALITY_VALUES).default("alta"),
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
export async function POST(req: Request) {
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
  const { screenshot, brief, language, images, quality } = parsed.data;

  // Sesión para el historial (cookie); se lee aquí, fuera del stream.
  const sessionId = await getSessionId();
  const sourceUrl = tokens?.meta?.url ?? "";

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
          model: getDesignModel(quality),
          experimental_output: Output.object({ schema: designProposalSchema }),
          system: generateSystemPrompt(language, images.length),
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
        // Sustituir los marcadores {{IMG_n}} por las imágenes reales del usuario.
        const html = injectImages(object.html, images);
        send({ type: "done", proposal: object, designMd, html });

        // Guardar en el historial (secundario: no romper la generación si falla).
        if (isDbConfigured()) {
          try {
            await saveGeneration({
              sessionId,
              url: sourceUrl,
              name: object.name,
              designMd,
              html,
              screenshot,
              interactions: object.interactions ?? null,
            });
          } catch (e) {
            console.error("[generate] no se pudo guardar en historial", e);
          }
        }
      } catch (err) {
        console.error("[generate] fallo generando propuesta", err);
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
}

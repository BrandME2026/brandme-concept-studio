import { NextResponse } from "next/server";
import { streamObject } from "ai";
import { z } from "zod";
import { designModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import { generateSystemPrompt } from "@/lib/ai/prompts";
import { buildGenerateMessages } from "@/lib/ai/build-messages";
import { designProposalSchema, tokensSchema } from "@/lib/schemas";
import { serializeDesignMd } from "@/lib/ai/design-md";
import type { DesignTokens } from "@/types/design";

export const runtime = "nodejs";
export const maxDuration = 120;

const generateBodySchema = z.object({
  tokens: tokensSchema,
  screenshot: z.string(),
  brief: z.string().default("Propón un diseño inspirado en esta web."),
  language: z.enum(["es", "en"]).default("es"),
});

/**
 * Stream NDJSON: una línea JSON por evento. El usuario ve la propuesta construirse
 * en vivo (nombre → colores → tipografía → html) en vez de un spinner mudo.
 *  {type:"partial", object}  → objeto parcial conforme se genera
 *  {type:"progress", field}  → campo de alto nivel recién completado
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
  const { screenshot, brief, language } = parsed.data;

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
        const result = streamObject({
          model: designModel,
          schema: designProposalSchema,
          system: generateSystemPrompt(language),
          messages: buildGenerateMessages(tokens, screenshot, brief),
        });

        const seenFields = new Set<string>();
        for await (const partial of result.partialObjectStream) {
          if (closed) break;
          send({ type: "partial", object: partial });
          for (const field of Object.keys(partial ?? {})) {
            if (!seenFields.has(field)) {
              seenFields.add(field);
              send({ type: "progress", field });
            }
          }
        }

        const object = await result.object;
        const designMd = serializeDesignMd(object);
        send({ type: "done", proposal: object, designMd, html: object.html });
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

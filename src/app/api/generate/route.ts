import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { designModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import { GENERATE_SYSTEM_PROMPT } from "@/lib/ai/prompts";
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
});

export async function POST(req: Request) {
  assertOpenRouterConfigured();

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

  // tokensSchema valida la forma mínima; los tokens provienen de nuestra extracción.
  const tokens = parsed.data.tokens as unknown as DesignTokens;
  const { screenshot, brief } = parsed.data;

  try {
    const { object } = await generateObject({
      model: designModel,
      schema: designProposalSchema,
      system: GENERATE_SYSTEM_PROMPT,
      messages: buildGenerateMessages(tokens, screenshot, brief),
    });

    const designMd = serializeDesignMd(object);
    return NextResponse.json({
      success: true,
      data: { proposal: object, designMd, html: object.html },
    });
  } catch (err) {
    console.error("[generate] fallo generando propuesta", err);
    return NextResponse.json(
      {
        success: false,
        error: { code: "GENERATION_FAILED", message: "No se pudo generar la propuesta" },
      },
      { status: 502 },
    );
  }
}

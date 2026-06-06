import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { chatModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import {
  CHAT_SYSTEM_PROMPT,
  conversationalChatPrompt,
  tokensContext,
  type Language,
} from "@/lib/ai/prompts";
import { isDbConfigured } from "@/lib/db/client";
import { listAllGenerations } from "@/lib/db/history";
import type { DesignTokens } from "@/types/design";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: UIMessage[];
  tokens?: DesignTokens;
  language?: Language;
}

/** Tejido de ejemplos reales del historial para el prompt conversacional. */
async function realExamples(): Promise<string> {
  if (!isDbConfigured()) return "";
  try {
    const gens = await listAllGenerations(8);
    return gens
      .map((g) => {
        let host = g.url;
        try {
          host = new URL(g.url).hostname.replace(/^www\./, "");
        } catch {
          /* dejar */
        }
        return `- "${g.name}" (${host})`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    assertOpenRouterConfigured();
  } catch {
    return Response.json(
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

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: "BAD_JSON", message: "Cuerpo inválido" } },
      { status: 400 },
    );
  }
  const { messages, tokens, language = "es" } = body;
  const modelMessages = await convertToModelMessages(messages);

  // Chat del STUDIO (con tokens): afinar diseño, comportamiento de hoy, sin tool.
  if (tokens) {
    const result = streamText({
      model: chatModel,
      system: `${CHAT_SYSTEM_PROMPT}\n\n${tokensContext(tokens)}`,
      messages: modelMessages,
    });
    return result.toUIMessageStreamResponse();
  }

  // Chat de la HOME (sin tokens): agente conversacional con la tool launchBrand.
  const result = streamText({
    model: chatModel,
    system: conversationalChatPrompt(language, await realExamples()),
    messages: modelMessages,
    tools: {
      // Sin execute: el efecto (resolver marca → ir al studio) ocurre en el cliente.
      launchBrand: tool({
        description:
          "Lanza el flujo para generar la página de una marca de franquicia. Llámala cuando el usuario quiera lanzar/crear la página de una marca concreta.",
        inputSchema: z.object({
          brand: z.string().describe("Nombre de la marca a lanzar, ej. 'Burger King'"),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

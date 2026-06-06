import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { chatModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import {
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

  // Un solo chat unificado. System conversacional; si ya hay página (llegan tokens),
  // se añade el contexto de diseño para afinar.
  const baseSystem = conversationalChatPrompt(language, await realExamples());
  const system = tokens ? `${baseSystem}\n\n${tokensContext(tokens)}` : baseSystem;

  // Tools sin execute: el efecto ocurre en el cliente (onToolCall).
  const result = streamText({
    model: chatModel,
    system,
    messages: modelMessages,
    tools: {
      launchBrand: tool({
        description:
          "Lanza el flujo para generar la página de una marca. Llámala SOLO tras conocer al usuario y recibir su confirmación, y cuando AÚN no hay página generada. Pasa el contexto reunido.",
        inputSchema: z.object({
          brand: z.string().describe("Nombre de la marca a lanzar, ej. 'Burger King'"),
          url: z
            .string()
            .optional()
            .describe("URL oficial de la marca SI el usuario la dio (ej. https://www.bk.com); si no, omitir"),
          nameAndFirm: z
            .string()
            .optional()
            .describe("Nombre y firma del usuario, si lo sabes"),
          markets: z.string().optional().describe("Mercados/ciudades, si los sabes"),
          positioning: z
            .string()
            .optional()
            .describe("Posicionamiento o cliente ideal, si surgió"),
        }),
      }),
      refineDesign: tool({
        description:
          "Regenera la página YA generada con un cambio de diseño. Llámala solo si ya existe una página y el usuario pide un ajuste visual.",
        inputSchema: z.object({
          instructions: z
            .string()
            .describe("Qué cambiar, ej. 'más oscuro, tipografía serif'"),
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

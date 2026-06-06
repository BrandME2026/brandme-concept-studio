import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { chatModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import { CHAT_SYSTEM_PROMPT, tokensContext } from "@/lib/ai/prompts";
import type { DesignTokens } from "@/types/design";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: UIMessage[];
  tokens?: DesignTokens;
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
  const { messages, tokens } = body;

  const system = tokens
    ? `${CHAT_SYSTEM_PROMPT}\n\n${tokensContext(tokens)}`
    : CHAT_SYSTEM_PROMPT;

  const result = streamText({
    model: chatModel,
    system,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}

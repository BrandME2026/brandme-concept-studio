import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { designModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import { CHAT_SYSTEM_PROMPT, tokensContext } from "@/lib/ai/prompts";
import type { DesignTokens } from "@/types/design";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: UIMessage[];
  tokens?: DesignTokens;
}

export async function POST(req: Request) {
  assertOpenRouterConfigured();

  const { messages, tokens }: ChatBody = await req.json();

  const system = tokens
    ? `${CHAT_SYSTEM_PROMPT}\n\n${tokensContext(tokens)}`
    : CHAT_SYSTEM_PROMPT;

  const result = streamText({
    model: designModel,
    system,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}

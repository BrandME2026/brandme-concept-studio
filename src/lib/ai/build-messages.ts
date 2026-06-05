import type { ModelMessage } from "ai";
import type { DesignTokens } from "@/types/design";
import { tokensContext } from "./prompts";

/**
 * Mensaje multimodal para la generación: tokens estructurados + screenshot de la
 * web de referencia + el brief de la conversación. La imagen va una sola vez aquí
 * (no en cada turno de chat) para controlar coste.
 */
export function buildGenerateMessages(
  tokens: DesignTokens,
  screenshot: string,
  brief: string,
): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${tokensContext(tokens)}\n\nBrief de la propuesta:\n${brief}`,
        },
        { type: "image", image: screenshot },
      ],
    },
  ];
}

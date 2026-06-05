import type { ModelMessage } from "ai";
import type { DesignTokens } from "@/types/design";
import { tokensContext } from "./prompts";

/**
 * Mensaje multimodal para la generación: tokens estructurados + screenshot de la
 * web de referencia + el brief + las imágenes que subió el usuario (para que el
 * modelo las vea y las coloque en el HTML con los marcadores {{IMG_n}}).
 */
export function buildGenerateMessages(
  tokens: DesignTokens,
  screenshot: string,
  brief: string,
  userImages: string[] = [],
): ModelMessage[] {
  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: string }
  > = [
    {
      type: "text",
      text: `${tokensContext(tokens)}\n\nBrief de la propuesta:\n${brief}`,
    },
    { type: "text", text: "Screenshot de la web de referencia:" },
    { type: "image", image: screenshot },
  ];

  if (userImages.length > 0) {
    content.push({
      type: "text",
      text: `Imágenes subidas por el usuario (úsalas como {{IMG_1}}…{{IMG_${userImages.length}}}, en este orden):`,
    });
    userImages.forEach((img) => content.push({ type: "image", image: img }));
  }

  return [{ role: "user", content }];
}

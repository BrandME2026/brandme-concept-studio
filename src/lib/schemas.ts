import { z } from "zod";

/** Input de URL a extraer. Solo http/https. */
export const urlInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url("Introduce una URL válida")
    .refine(
      (u) => u.startsWith("http://") || u.startsWith("https://"),
      "La URL debe empezar por http:// o https://",
    ),
});

export type UrlInput = z.infer<typeof urlInputSchema>;

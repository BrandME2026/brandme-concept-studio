import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { chatModel, assertOpenRouterConfigured } from "@/lib/ai/openrouter";
import { saveLead, slugExists } from "@/lib/db/leads";
import { isDbConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Agente de captación embebido en las páginas públicas. Conversa con el VISITANTE
// (futuro franquiciado), responde sobre la franquicia y captura sus datos como lead.
// Modelo barato (chatModel = DeepSeek) por coste — ver memoria model-routing-by-cost.
interface AgentBody {
  messages: UIMessage[];
  slug: string;
  brand?: string;
  city?: string;
  language?: "es" | "en";
}

function agentSystem(brand: string, city: string, lang: "es" | "en"): string {
  const where = city ? ` en ${city}` : "";
  if (lang === "en") {
    return `You are a friendly franchise advisor for ${brand}${where}. Answer the visitor's questions about opening/investing in this franchise, be concise and warm. Your GOAL is to capture their contact so a human can follow up. Naturally ask for their name and a phone or email. As SOON as you have a name AND (phone OR email), call the captureLead tool with the data. Do not ask for everything at once. Reply in English.`;
  }
  return `Eres un asesor cordial de la franquicia ${brand}${where}. Responde las dudas del visitante sobre abrir/invertir en esta franquicia, breve y cálido. Tu OBJETIVO es captar su contacto para que un humano le dé seguimiento. Pide con naturalidad su nombre y un teléfono o correo. EN CUANTO tengas nombre Y (teléfono O correo), llama la herramienta captureLead con los datos. No pidas todo de golpe. Responde en español.`;
}

const fail = (code: string, message: string, status: number) =>
  Response.json({ success: false, error: { code, message } }, { status });

export async function POST(req: Request) {
  try {
    assertOpenRouterConfigured();
  } catch {
    return fail("NOT_CONFIGURED", "IA no configurada", 503);
  }

  let body: AgentBody;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_JSON", "Cuerpo inválido", 400);
  }

  const { messages, slug, brand = "", city = "", language = "es" } = body;
  if (!slug) return fail("NO_SLUG", "Falta slug", 400);

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: chatModel,
    system: agentSystem(brand, city, language),
    messages: modelMessages,
    tools: {
      captureLead: tool({
        description:
          "Guarda los datos del interesado. Llámala SOLO cuando tengas nombre y al menos un teléfono o correo.",
        inputSchema: z.object({
          name: z.string().describe("Nombre del interesado"),
          phone: z.string().optional().describe("Teléfono/WhatsApp si lo dio"),
          email: z.string().optional().describe("Correo si lo dio"),
          message: z.string().optional().describe("Resumen de lo que busca, si aplica"),
        }),
        execute: async ({ name, phone, email, message }) => {
          if (!isDbConfigured()) return { ok: false };
          if (!phone && !email) return { ok: false, reason: "sin contacto" };
          try {
            if (!(await slugExists(slug))) return { ok: false, reason: "slug inválido" };
            await saveLead({
              slug,
              brand: brand || null,
              city: city || null,
              name,
              phone: phone || null,
              email: email || null,
              message: message || null,
              source: "agent",
            });
            return { ok: true };
          } catch (e) {
            console.error("[agent] captureLead falló", e);
            return { ok: false };
          }
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}

import { redirect } from "next/navigation";
import type { UIMessage } from "ai";
import { AppShell } from "@/components/app-shell";
import { getSessionId } from "@/lib/session";
import { getConversation } from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";

/** Conversación rehidratada: mismo AppShell con sus mensajes y página previa. */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  if (!isDbConfigured()) redirect("/");

  const sessionId = await getSessionId();
  const conv = await getConversation(conversationId, sessionId);
  if (!conv) redirect("/");

  return (
    <main className="flex flex-1 flex-col">
      <AppShell
        initial={{
          id: conv.id,
          messages: (conv.messages as UIMessage[]) ?? [],
          url: conv.url,
          generatedHtml: conv.generatedHtml,
          designMd: conv.designMd,
          name: conv.name,
        }}
      />
    </main>
  );
}

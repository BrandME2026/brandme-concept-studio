import { redirect } from "next/navigation";
import type { UIMessage } from "ai";
import { AppShell } from "@/components/app-shell";
import { resolveConsultantId } from "@/lib/tenant";
import { getConversation } from "@/lib/db/conversations";
import { isDbConfigured } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant-context";

/** Conversación rehidratada: mismo AppShell con sus mensajes y página previa. */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  if (!isDbConfigured()) redirect("/");

  const consultantId = await resolveConsultantId();
  if (!consultantId) redirect("/");

  const conv = await withTenant(consultantId, () => getConversation(conversationId));
  if (!conv) redirect("/");

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden">
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

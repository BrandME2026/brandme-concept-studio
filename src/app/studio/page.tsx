import { redirect } from "next/navigation";
import { StudioClient } from "@/components/studio-client";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;
  if (!url) redirect("/");

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <StudioClient url={url} />
    </main>
  );
}

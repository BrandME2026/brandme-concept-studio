"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PreviewFrame } from "@/components/preview-frame";
import { useT } from "@/lib/i18n/context";

interface PublicRecord {
  id: string;
  url: string;
  name: string;
  html: string;
}

/** Vista pública de una página generada (referencia desde la galería de la home). */
export default function PublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useT();
  const [rec, setRec] = useState<PublicRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/gallery/${id}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setRec(j.data) : setError(j.error?.message ?? "Error")))
      .catch(() => setError(t("history.loadError")));
  }, [id, t]);

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <Link href="/" className="eyebrow text-body hover:opacity-70">
          ← Francast.ai
        </Link>
        <span className="truncate text-sm font-semibold text-ink">{rec?.name ?? "…"}</span>
        <span className="w-16" />
      </header>

      {error && <p className="p-6 text-accent-orange">{error}</p>}
      {rec && (
        <div className="flex-1 overflow-hidden">
          <PreviewFrame html={rec.html} />
        </div>
      )}
    </main>
  );
}

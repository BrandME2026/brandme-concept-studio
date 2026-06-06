"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PreviewFrame } from "@/components/preview-frame";
import { ProposalActions } from "@/components/proposal-actions";

interface Record {
  id: string;
  url: string;
  name: string;
  designMd: string;
  html: string;
  interactions: string | null;
}

export default function HistorialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [rec, setRec] = useState<Record | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/history/${id}`)
      .then((r) => r.json())
      .then((j) => (j.success ? setRec(j.data) : setError(j.error?.message ?? "Error")))
      .catch(() => setError("No se pudo cargar"));
  }, [id]);

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <Link href="/historial" className="eyebrow text-body hover:opacity-70">
          ← Historial
        </Link>
        <span className="truncate text-sm font-semibold text-ink">
          {rec?.name ?? "…"}
        </span>
        {rec ? (
          <ProposalActions
            html={rec.html}
            designMd={rec.designMd}
            name={rec.name}
            shareId={rec.id}
          />
        ) : (
          <span className="w-16" />
        )}
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

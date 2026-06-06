"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { urlInputSchema, looksLikeUrl } from "@/lib/schemas";

export function UrlInputForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function goToStudio(url: string) {
    router.push(`/studio?url=${encodeURIComponent(url)}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const input = query.trim();

    // Ya es una URL/dominio: flujo directo de extracción (sin resolver por LLM).
    if (looksLikeUrl(input)) {
      const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
      const parsed = urlInputSchema.safeParse({ url: withScheme });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "URL no válida");
        return;
      }
      goToStudio(parsed.data.url);
      return;
    }

    // Es un nombre de marca/cadena: resolver a URL oficial en el servidor.
    setLoading(true);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: input }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success && json.data?.url) {
        goToStudio(json.data.url);
        return;
      }
      setError(
        json?.error?.message ??
          "No identifiqué la web. Pega la URL oficial e inténtalo de nuevo.",
      );
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          placeholder="Escribe una cadena (ej. Starbucks) o pega una URL"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Nombre de la cadena o URL a analizar"
          disabled={loading}
          className="flex-1 rounded-sm border border-white/15 bg-surface-dark-soft px-4 py-3 text-on-dark placeholder:text-body focus:border-accent-periwinkle focus:outline-none disabled:opacity-60"
        />
        <Button type="submit" variant="mint" disabled={loading}>
          {loading ? "Buscando…" : "Generar propuesta"}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-accent-orange" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

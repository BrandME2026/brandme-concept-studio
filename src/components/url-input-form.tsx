"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { urlInputSchema } from "@/lib/schemas";

export function UrlInputForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = urlInputSchema.safeParse({ url });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "URL no válida");
      return;
    }
    setError(null);
    router.push(`/studio?url=${encodeURIComponent(parsed.data.url)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          placeholder="https://ejemplo.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="URL a analizar"
          className="flex-1 rounded-sm border border-white/15 bg-surface-dark-soft px-4 py-3 text-on-dark placeholder:text-body focus:border-accent-periwinkle focus:outline-none"
        />
        <Button type="submit" variant="mint">
          Generar propuesta
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

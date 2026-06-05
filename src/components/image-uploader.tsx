"use client";

import { useRef } from "react";

const MAX_IMAGES = 6;
const MAX_BYTES = 4 * 1024 * 1024; // 4MB por imagen

/** Subida de imágenes (a data URL en el navegador) para incrustar en el diseño. */
export function ImageUploader({
  images,
  onChange,
  disabled,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_IMAGES - images.length;
    const accepted = Array.from(files)
      .filter((f) => f.type.startsWith("image/") && f.size <= MAX_BYTES)
      .slice(0, room);

    const dataUrls = await Promise.all(
      accepted.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(f);
          }),
      ),
    );
    onChange([...images, ...dataUrls]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="border-t border-hairline p-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow text-body">
          Imágenes ({images.length}/{MAX_IMAGES})
        </span>
        <button
          type="button"
          disabled={disabled || images.length >= MAX_IMAGES}
          onClick={() => inputRef.current?.click()}
          className="rounded-sm border border-hairline px-2 py-1 font-mono text-[10px] uppercase text-body transition-colors hover:bg-hairline disabled:opacity-50"
        >
          + Subir
        </button>
      </div>

      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={i} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Imagen ${i + 1}`}
                className="h-12 w-12 rounded-sm border border-hairline object-cover"
              />
              <span className="absolute left-0.5 top-0.5 rounded-xs bg-canvas-dark/80 px-1 font-mono text-[9px] text-on-dark">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-on-primary group-hover:flex"
                aria-label={`Quitar imagen ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-body">
        La IA las colocará en el diseño (logo, hero, etc.).
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

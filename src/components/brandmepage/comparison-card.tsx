"use client";

import { useState } from "react";
import type { ComparisonBrand } from "@/lib/brandmepage/comparison";

/**
 * Multi-Brand Comparison Card (WO-37, REQ-MBC): hasta 3 marcas lado a lado
 * (la actual + 2 seleccionables). Read-only, sin lead form (AC-MBC-003.3), sin
 * recomendación. Móvil <768px: tarjetas apiladas con navegación swipe (scroll
 * snap) + botones (AC-MBC-005). Los eventos PostHog del requirement quedan
 * como drift (sin PostHog en la plataforma aún).
 */

const MAX_SELECTED = 3;
const NA = "Información no disponible aún";

const DIMENSIONS: Array<{ key: keyof ComparisonBrand["dimensions"]; label: string }> = [
  { key: "investmentRange", label: "Inversión inicial" },
  { key: "franchiseFee", label: "Cuota de franquicia" },
  { key: "royaltyRate", label: "Regalías" },
  { key: "territoryStatus", label: "Territorio en tu zona" },
];

export function ComparisonCard({ brands, accent }: { brands: ComparisonBrand[]; accent: string }) {
  const current = brands.find((b) => b.isCurrent);
  const others = brands.filter((b) => !b.isCurrent);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mobileIndex, setMobileIndex] = useState(0);

  if (!current || others.length === 0) return null;

  const chosen = [current, ...others.filter((b) => selected.includes(b.href))];
  const atMax = chosen.length >= MAX_SELECTED;

  function toggle(href: string) {
    setSelected((prev) =>
      prev.includes(href)
        ? prev.filter((h) => h !== href)
        : prev.length < MAX_SELECTED - 1
          ? [...prev, href]
          : prev,
    );
    setMobileIndex(0);
  }

  return (
    <div data-block="comparison-card">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border px-4 py-2 text-sm font-medium underline-offset-2"
          style={{ borderColor: accent, color: accent }}
        >
          Compara esta marca con otras que represento →
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="mb-3 text-sm font-medium">
            Elige hasta {MAX_SELECTED - 1} marcas más para comparar:
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {others.map((b) => {
              const isSelected = selected.includes(b.href);
              const disabled = !isSelected && atMax;
              return (
                <button
                  key={b.href}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(b.href)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                    isSelected ? "font-semibold" : ""
                  } ${disabled ? "opacity-40" : ""}`}
                  style={isSelected ? { borderColor: accent, color: accent } : {}}
                >
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt="" className="h-4 w-4 object-contain" />
                  ) : (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: b.primaryColor ?? "#9ca3af" }}
                    />
                  )}
                  {b.brandName}
                </button>
              );
            })}
          </div>
          {atMax ? (
            <p className="mb-3 text-xs text-gray-500">Máximo {MAX_SELECTED} marcas en la comparación.</p>
          ) : null}

          {chosen.length >= 2 ? (
            <>
              {/* Desktop: tabla lado a lado */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-gray-500">Dimensión</th>
                      {chosen.map((b) => (
                        <th key={b.href} className="p-2 text-left">
                          {b.brandName}
                          {b.isCurrent ? " (esta página)" : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DIMENSIONS.map((d) => (
                      <tr key={d.key} className="border-t border-gray-100">
                        <td className="p-2 text-gray-500">{d.label}</td>
                        {chosen.map((b) => (
                          <td key={b.href} className="p-2">
                            {b.dimensions[d.key] ?? NA}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t border-gray-100">
                      <td className="p-2 text-gray-500">Página completa</td>
                      {chosen.map((b) => (
                        <td key={b.href} className="p-2">
                          {b.isCurrent ? (
                            <span className="text-gray-400">Estás aquí</span>
                          ) : (
                            <a href={b.href} className="underline" style={{ color: accent }}>
                              Ver {b.brandName} →
                            </a>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Móvil <768px: apilado, una marca a la vez, swipe + botones */}
              <div className="md:hidden">
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setMobileIndex((i) => Math.max(0, i - 1))}
                    disabled={mobileIndex === 0}
                    className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                  >
                    ← Anterior
                  </button>
                  <span className="text-xs text-gray-500">
                    {mobileIndex + 1} / {chosen.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileIndex((i) => Math.min(chosen.length - 1, i + 1))}
                    disabled={mobileIndex === chosen.length - 1}
                    className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                  >
                    Siguiente →
                  </button>
                </div>
                <div
                  className="flex snap-x snap-mandatory gap-4 overflow-x-auto"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setMobileIndex(Math.round(el.scrollLeft / el.clientWidth));
                  }}
                >
                  {/* Máx 3 tarjetas: se renderizan TODAS (review R1 — ocultar
                      las no adyacentes rompía el swipe directo a la lejana). */}
                  {chosen.map((b) => (
                    <div
                      key={b.href}
                      className="w-full flex-none snap-center rounded-lg border border-gray-200 p-4"
                    >
                      <p className="mb-2 font-semibold">
                        {b.brandName}
                        {b.isCurrent ? " (esta página)" : ""}
                      </p>
                      <dl className="space-y-2 text-sm">
                        {DIMENSIONS.map((d) => (
                          <div key={d.key}>
                            <dt className="text-gray-500">{d.label}</dt>
                            <dd>{b.dimensions[d.key] ?? NA}</dd>
                          </div>
                        ))}
                      </dl>
                      {!b.isCurrent ? (
                        <a
                          href={b.href}
                          className="mt-3 inline-block underline"
                          style={{ color: accent }}
                        >
                          Ver {b.brandName} →
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">Selecciona al menos una marca más.</p>
          )}
        </div>
      )}
    </div>
  );
}

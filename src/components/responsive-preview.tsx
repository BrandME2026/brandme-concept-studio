"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { PreviewFrame } from "./preview-frame";

/** Anchos de dispositivo para previsualizar el HTML generado. `null` = ancho completo. */
type Device = "mobile" | "tablet" | "desktop" | "custom";

const DEVICE_WIDTH: Record<Exclude<Device, "desktop">, number> = {
  mobile: 390,
  tablet: 768,
  custom: 1024, // arranque del modo personalizable; el usuario lo ajusta
};

const CUSTOM_MIN = 320;
const CUSTOM_MAX = 1920;

/**
 * Preview del HTML con barra de resoluciones (móvil/tablet/desktop/custom) y botón
 * de pantalla completa. El iframe (PreviewFrame) mantiene su sandbox; solo cambiamos
 * el ancho del contenedor, así el <meta viewport> del HTML reacciona como en un
 * dispositivo real. Reutilizable tanto inline como dentro del overlay fullscreen.
 */
export function ResponsivePreview({
  html,
  onFullscreen,
  onExitFullscreen,
}: {
  html: string;
  /** Si se pasa, muestra el botón "Pantalla completa" (modo inline). */
  onFullscreen?: () => void;
  /** Si se pasa, muestra el botón "Salir" (modo overlay). */
  onExitFullscreen?: () => void;
}) {
  const t = useT();
  const [device, setDevice] = useState<Device>("desktop");
  const [customWidth, setCustomWidth] = useState(DEVICE_WIDTH.custom);

  const width =
    device === "desktop"
      ? null
      : device === "custom"
        ? customWidth
        : DEVICE_WIDTH[device];

  const devices: { id: Device; label: string }[] = [
    { id: "mobile", label: t("preview.device.mobile") },
    { id: "tablet", label: t("preview.device.tablet") },
    { id: "desktop", label: t("preview.device.desktop") },
    { id: "custom", label: t("preview.device.custom") },
  ];

  const tab = (active: boolean) =>
    `rounded-sm px-2.5 py-1 font-mono text-xs uppercase transition-colors ${
      active ? "bg-ink text-canvas" : "text-body hover:bg-hairline"
    }`;
  const btn =
    "rounded-sm border border-hairline px-3 py-1.5 font-mono text-xs uppercase text-ink transition-colors hover:bg-hairline";

  return (
    <div className="flex h-full flex-col">
      {/* Barra de resoluciones */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <div className="flex items-center gap-1">
          {devices.map((d) => (
            <button key={d.id} className={tab(device === d.id)} onClick={() => setDevice(d.id)}>
              {d.label}
            </button>
          ))}
          {device === "custom" && (
            <span className="ml-2 flex items-center gap-2">
              <input
                type="range"
                min={CUSTOM_MIN}
                max={CUSTOM_MAX}
                step={10}
                value={customWidth}
                onChange={(e) => setCustomWidth(Number(e.target.value))}
                className="w-32 accent-ink"
                aria-label={t("preview.device.custom")}
              />
              <span className="font-mono text-xs tabular-nums text-body">{customWidth}px</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {width !== null && (
            <span className="font-mono text-xs tabular-nums text-body">{width}px</span>
          )}
          {onFullscreen && (
            <button className={btn} onClick={onFullscreen}>
              {t("preview.fullscreen")}
            </button>
          )}
          {onExitFullscreen && (
            <button className={btn} onClick={onExitFullscreen}>
              {t("preview.exit")}
            </button>
          )}
        </div>
      </div>

      {/* Lienzo del preview: centrado y con scroll cuando el dispositivo es más angosto */}
      <div className="flex-1 overflow-auto bg-canvas-dark/5 p-0">
        <div
          className="mx-auto h-full bg-canvas transition-[width] duration-200"
          style={width === null ? undefined : { width, maxWidth: "100%" }}
        >
          <PreviewFrame html={html} />
        </div>
      </div>
    </div>
  );
}

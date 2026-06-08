/**
 * Iconos SVG (estilo lucide) inline — sin dependencias. Reemplazan los emojis del
 * chat por iconografía monocromática consistente (best practice 2026: SVG, no emoji).
 * Todos heredan `currentColor` y un stroke uniforme; el tamaño se controla por CSS.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Clip de adjuntar (paperclip). */
export const PaperclipIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Base>
);

/** Altavoz activo (voz de salida ON). */
export const Volume2Icon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11 4.7a.7.7 0 0 0-1.15-.53L6 7.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3l3.85 3.33A.7.7 0 0 0 11 19.3z" />
    <path d="M16 9a5 5 0 0 1 0 6" />
    <path d="M19.5 6.5a9 9 0 0 1 0 11" />
  </Base>
);

/** Altavoz silenciado (voz de salida OFF). */
export const VolumeOffIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11 4.7a.7.7 0 0 0-1.15-.53L6 7.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3l3.85 3.33A.7.7 0 0 0 11 19.3z" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </Base>
);

/** Micrófono. */
export const MicIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </Base>
);

/** Flecha hacia arriba (enviar). */
export const ArrowUpIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </Base>
);

/** Cuadrado (detener generación). */
export const StopIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  </Base>
);

/** X (cerrar / quitar adjunto). */
export const XIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Base>
);

/** Copiar. */
export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Base>
);

/** Check (confirmación tras copiar). */
export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
);

/** Spinner giratorio (paso en curso). Anima con `animate-spin`. */
export const SpinnerIcon = ({ size = 18, className = "", ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    aria-hidden="true"
    className={`animate-spin ${className}`}
    {...props}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

/** Bandeja de entrada (interesados / prospects). */
export const InboxIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Base>
);

/** Globo (galería pública). */
export const GlobeIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
    <path d="M2 12h20" />
  </Base>
);

/** Logo de Google (multicolor) para el botón de login. No hereda currentColor. */
export const GoogleIcon = ({ size = 18, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
    />
  </svg>
);

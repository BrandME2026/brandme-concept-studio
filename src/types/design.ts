/**
 * Tipos de los design tokens extraídos de una web objetivo.
 * El formato de salida final (DESIGN.md) deriva de estos tokens normalizados.
 */

export type ColorRole = "text" | "background" | "border" | "shadow";

export interface ColorToken {
  /** Color normalizado a hex (#rrggbb). */
  value: string;
  /** Frecuencia de aparición (peso para ranking). */
  count: number;
  /** Roles donde aparece el color. */
  roles: ColorRole[];
}

export type FontRole = "heading" | "body" | "mono" | "other";

export interface FontToken {
  /** Primera familia declarada (sin fallbacks). */
  family: string;
  /** Pesos observados. */
  weights: number[];
  role: FontRole;
  usageCount: number;
}

export interface TypeScaleToken {
  /** Nivel semántico: h1..h6, body, caption. */
  level: string;
  fontSizePx: number;
  fontSizeRem: number;
  lineHeight: string;
  weight: number;
}

export interface DesignTokens {
  meta: {
    url: string;
    title: string;
    viewport: { width: number; height: number };
    extractedAt: string;
  };
  colors: {
    palette: ColorToken[];
    background: string;
    foreground: string;
    primary?: string;
    accent?: string;
  };
  typography: {
    fontFamilies: FontToken[];
    scale: TypeScaleToken[];
    baseFontSize: string;
  };
  spacing: {
    /** Todos los valores px detectados, ordenados. */
    scale: number[];
    /** Los más frecuentes (la escala real del sitio). */
    common: number[];
  };
  radii: number[];
  shadows: string[];
  layout: {
    maxWidth?: string;
    usesFlex: boolean;
    usesGrid: boolean;
  };
}

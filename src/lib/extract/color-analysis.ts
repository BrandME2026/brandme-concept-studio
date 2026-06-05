import type { ColorToken, ColorRole } from "@/types/design";

interface ClusterOptions {
  /** Umbral de distancia por debajo del cual dos colores se fusionan. */
  threshold?: number;
  /** Máximo de colores en la paleta final. */
  maxColors?: number;
}

const DEFAULT_THRESHOLD = 32;
const DEFAULT_MAX_COLORS = 10;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Distancia perceptual "redmean" — aproximación barata que pondera los canales
 * según la sensibilidad del ojo. Suficiente para fusionar grises casi idénticos
 * sin colapsar colores vívidos distintos.
 * https://www.compuphase.com/cmetric.htm
 */
function colorDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db,
  );
}

function mergeRoles(a: ColorRole[], b: ColorRole[]): ColorRole[] {
  return Array.from(new Set([...a, ...b]));
}

/**
 * Agrupa colores perceptualmente cercanos en una paleta compacta.
 * El representante de cada cluster es el color de mayor frecuencia; los counts
 * se suman y los roles se unen. Resultado ordenado por frecuencia descendente.
 */
export function clusterColors(
  colors: ColorToken[],
  options: ClusterOptions = {},
): ColorToken[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxColors = options.maxColors ?? DEFAULT_MAX_COLORS;

  if (colors.length === 0) return [];

  // Procesar de mayor a menor frecuencia para que el primero en un cluster
  // (su representante) sea el más frecuente.
  const sorted = [...colors].sort((a, b) => b.count - a.count);
  const clusters: ColorToken[] = [];

  for (const color of sorted) {
    const rgb = hexToRgb(color.value);
    const match = clusters.find(
      (c) => colorDistance(hexToRgb(c.value), rgb) < threshold,
    );

    if (match) {
      match.count += color.count;
      match.roles = mergeRoles(match.roles, color.roles);
    } else {
      clusters.push({ ...color, roles: [...color.roles] });
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  return clusters.slice(0, maxColors);
}

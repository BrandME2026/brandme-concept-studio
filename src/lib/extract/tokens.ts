import type {
  DesignTokens,
  ColorToken,
  ColorRole,
  FontToken,
  FontRole,
  TypeScaleToken,
} from "@/types/design";
import type { RawExtraction } from "./extractor-script";
import { rgbToHex, isVisibleColor, parsePx, normalizeFamily } from "./normalize";
import { clusterColors } from "./color-analysis";

/** Agrega los conteos de color crudos en ColorTokens con roles. */
function aggregateColors(raw: RawExtraction): ColorToken[] {
  const byHex = new Map<string, ColorToken>();

  const add = (cssColor: string, count: number, role: ColorRole) => {
    if (!isVisibleColor(cssColor)) return;
    const hex = rgbToHex(cssColor);
    if (!hex) return;
    const existing = byHex.get(hex);
    if (existing) {
      existing.count += count;
      if (!existing.roles.includes(role)) existing.roles.push(role);
    } else {
      byHex.set(hex, { value: hex, count, roles: [role] });
    }
  };

  for (const [c, n] of Object.entries(raw.colors.text)) add(c, n, "text");
  for (const [c, n] of Object.entries(raw.colors.background)) add(c, n, "background");
  for (const [c, n] of Object.entries(raw.colors.border)) add(c, n, "border");

  return clusterColors(Array.from(byHex.values()), { maxColors: 10 });
}

function classifyFonts(raw: RawExtraction): FontToken[] {
  const entries = Object.entries(raw.fonts).map(([family, info]) => {
    const name = normalizeFamily(family);
    const isMono = /mono|consol|courier/i.test(family);
    let role: FontRole;
    if (isMono) role = "mono";
    else if (info.headingCount > 0) role = "heading";
    else role = "body";
    return {
      family: name,
      weights: info.weights.sort((a, b) => a - b),
      role,
      usageCount: info.count,
    };
  });
  // La familia más usada no-mono que no tenga headings es "body".
  return entries.sort((a, b) => b.usageCount - a.usageCount);
}

function buildScale(raw: RawExtraction): TypeScaleToken[] {
  return raw.typeScale.map((t) => {
    const px = parsePx(t.fontSize) ?? 16;
    return {
      level: t.level,
      fontSizePx: px,
      fontSizeRem: Math.round((px / 16) * 1000) / 1000,
      lineHeight: t.lineHeight,
      weight: t.fontWeight,
    };
  });
}

export function buildDesignTokens(
  raw: RawExtraction,
  url: string,
  extractedAt: string,
): DesignTokens {
  const palette = aggregateColors(raw);

  const spacingScale = Object.keys(raw.spacing)
    .map(Number)
    .sort((a, b) => a - b);
  const spacingCommon = Object.entries(raw.spacing)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([px]) => Number(px));

  const radii = Object.keys(raw.radii)
    .map(Number)
    .filter((r) => r < 100) // descartar el pill 9999 del ranking principal
    .sort((a, b) => a - b);

  return {
    meta: {
      url,
      title: raw.title,
      viewport: raw.viewport,
      extractedAt,
    },
    colors: {
      palette,
      background: rgbToHex(raw.bodyBackground) ?? "#ffffff",
      foreground: rgbToHex(raw.bodyColor) ?? "#000000",
      primary: raw.primaryCandidate
        ? (rgbToHex(raw.primaryCandidate) ?? undefined)
        : undefined,
    },
    typography: {
      fontFamilies: classifyFonts(raw),
      scale: buildScale(raw),
      baseFontSize: raw.baseFontSize,
    },
    spacing: { scale: spacingScale, common: spacingCommon },
    radii,
    shadows: raw.shadows,
    layout: {
      maxWidth: raw.maxWidth ?? undefined,
      usesFlex: raw.usesFlex,
      usesGrid: raw.usesGrid,
    },
  };
}

import type { DesignProposal } from "@/lib/schemas";

/**
 * Serializa la propuesta del LLM al formato DESIGN.md (frontmatter YAML + secciones),
 * el mismo formato que usa el CLI getdesign. Código determinista: el modelo aporta el
 * juicio (los valores), no el formato.
 */
export function serializeDesignMd(p: DesignProposal): string {
  const frontmatter = `---
version: alpha
name: ${p.name}
description: ${p.description}

colors:
  primary: "${p.colors.primary}"
  canvas: "${p.colors.canvas}"
  ink: "${p.colors.ink}"
  accent: "${p.colors.accent}"

typography:
  display: ${p.typography.displayFamily}
  body: ${p.typography.bodyFamily}
---`;

  const scaleRows = p.typography.scale
    .map((s) => `| \`${s.level}\` | ${s.sizePx}px | ${s.weight} |`)
    .join("\n");

  const principles = p.principles.map((pr) => `- ${pr}`).join("\n");

  return `${frontmatter}

## Overview

${p.description}

## Colors

- **Primary** (\`${p.colors.primary}\`): color de acción / CTA.
- **Canvas** (\`${p.colors.canvas}\`): fondo principal.
- **Ink** (\`${p.colors.ink}\`): texto principal.
- **Accent** (\`${p.colors.accent}\`): acento de marca.

## Typography

Display: **${p.typography.displayFamily}** · Body: **${p.typography.bodyFamily}**

| Nivel | Tamaño | Peso |
|---|---|---|
${scaleRows}

## Do's and Don'ts

### Do
${principles}
`;
}

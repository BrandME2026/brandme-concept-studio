# NOTA BrandMe (leer antes de usar)
#
# Este DESIGN.md es el template GLOBAL base (Factory Base), NO el diseño de BrandMe.
# Los docs de requerimientos de BrandMe NO definen un design system corporativo propio.
# El diseño real del proyecto vive en:
#   - docs/DESIGN-SYSTEM.md  → identity tokens DINÁMICOS por marca (Agent 02) + a11y + Web Vitals
#   - docs/STRUCTURE.md      → estructura de bloques y templates de cada superficie
#
# Estos tokens de abajo aplican como punto de partida SOLO para el Consultant Portal y el Admin
# Console (superficies de plataforma que el cliente no especificó). Personalizarlos es una
# decisión pendiente nuestra (ver docs/DESIGN-SYSTEM.md §1). Las BrandMePages públicas NO usan
# estos tokens: se estilizan con los tokens extraídos de cada marca.
---
version: alpha
name: Factory Base
description: Design system base para software factory. Neutral, profesional, moderno. Override por proyecto.

colors:
  primary: "#0A0A0B"
  on-primary: "#FFFFFF"
  secondary: "#52525B"
  on-secondary: "#FAFAFA"
  tertiary: "#2563EB"
  on-tertiary: "#FFFFFF"
  neutral: "#71717A"
  surface: "#FFFFFF"
  on-surface: "#09090B"
  surface-muted: "#F4F4F5"
  surface-accent: "#F0F5FF"
  border: "#E4E4E7"
  border-strong: "#D4D4D8"
  error: "#DC2626"
  on-error: "#FFFFFF"
  warning: "#D97706"
  success: "#16A34A"
  info: "#2563EB"

typography:
  headline-display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.65
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.33
  mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6

rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  4xl: 96px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 10px 20px
    height: 40px
  button-primary-hover:
    backgroundColor: "#18181B"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 10px 20px
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.surface-muted}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 10px 16px
  button-ghost-hover:
    backgroundColor: "{colors.surface-muted}"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 10px 20px
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    height: 40px
  card-default:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: 24px
  badge-default:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 2px 10px
  badge-info:
    backgroundColor: "{colors.surface-accent}"
    textColor: "{colors.info}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 2px 10px
---

## Overview

Factory Base es el design system neutral y profesional para una software factory. Prioriza claridad, legibilidad y profesionalismo. Cada proyecto hereda esta base y puede sobreescribir tokens para adaptar la identidad visual al cliente.

La personalidad visual es: limpia, moderna, confiable. No busca ser llamativa sino funcional y elegante. Piensa en herramientas que usas todos los dias y no te cansan: Linear, Vercel, Notion.

El sistema esta disenado para funcionar bien en dashboards, landing pages, SaaS, y aplicaciones moviles con Ionic/React Native.

## Colors

La paleta esta construida sobre neutrals frios (zinc scale) con un azul funcional como acento.

- **Primary (#0A0A0B):** Casi negro. Headings, CTAs principales, texto de alto impacto. El micro-warmth evita la dureza del negro puro.
- **Secondary (#52525B):** Zinc 600. Texto secundario, descripciones, metadata.
- **Tertiary (#2563EB):** Azul 600. Acento funcional para links, estados activos, seleccion, y elementos interactivos. No decorativo.
- **Neutral (#71717A):** Zinc 500. Placeholders, texto deshabilitado, hints.
- **Surface (#FFFFFF):** Fondo principal. Blanco puro.
- **Surface Muted (#F4F4F5):** Zinc 100. Fondos secundarios, hovers, backgrounds alternativos en tablas.
- **Surface Accent (#F0F5FF):** Azul tintado ultra-sutil. Badges informativos, seleccion activa.
- **Border (#E4E4E7):** Zinc 200. Bordes de cards, dividers, inputs.
- **Border Strong (#D4D4D8):** Zinc 300. Bordes con mas presencia cuando se necesita separacion visual.
- **Error (#DC2626):** Rojo para estados de error, validacion fallida, acciones destructivas.
- **Warning (#D97706):** Amber para alertas y precauciones.
- **Success (#16A34A):** Verde para confirmaciones y estados exitosos.

## Typography

Inter como tipografia principal por su legibilidad excepcional en pantalla, amplio soporte de pesos, y disponibilidad universal via Google Fonts. JetBrains Mono para codigo y labels tecnicas.

- **Display (48px/700):** Hero headlines. Letter-spacing negativo (-0.025em) para compresion visual.
- **Headline LG (36px/700):** Titulos de seccion principales.
- **Headline MD (24px/600):** Subtitulos, titulos de card.
- **Body LG (18px/400):** Texto introductorio, descripciones de features.
- **Body MD (16px/400):** Texto de lectura estandar. Line-height 1.6 para comodidad.
- **Body SM (14px/400):** UI text, campos de formulario, tablas.
- **Label LG/MD/SM:** Texto de UI con peso 500. Botones, tabs, navigation, badges.
- **Mono (14px/400):** JetBrains Mono para codigo, IDs, datos tecnicos.

Principios:
- Tres pesos principales: 400 (lectura), 500 (UI/interaccion), 600-700 (titulos/enfasis)
- Letter-spacing negativo solo en headlines display y lg
- Line-height generoso (1.5-1.65) para body text

## Layout

Grid basado en 8px con scale consistente.

- **Base unit:** 8px
- **Container max:** 1200px centrado
- **Section padding:** 64px-96px vertical entre secciones principales
- **Card gap:** 16px-24px entre cards en grid
- **Content grid:** 12 columnas, gap 24px

Breakpoints:
| Name | Width | Columns |
|------|-------|---------|
| Mobile | <640px | 4 |
| Tablet | 640-1024px | 8 |
| Desktop | 1024-1280px | 12 |
| Wide | >1280px | 12, max-width 1200px |

Whitespace:
- Generoso entre secciones. El espacio comunica profesionalismo.
- Compacto dentro de componentes. La informacion esta agrupada logicamente.
- Cards: padding interno 24px. Gap entre cards 16px.

## Elevation & Depth

Sistema de sombras sutil, de baja opacidad. La elevacion se comunica con capas, no con sombras dramaticas.

| Level | Shadow | Use |
|-------|--------|-----|
| 0 (Flat) | none | Background, texto |
| 1 (Border) | 0 0 0 1px rgba(0,0,0,0.06) | Bordes sutiles via shadow, cards en reposo |
| 2 (Subtle) | 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) | Cards hover, dropdowns |
| 3 (Medium) | 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04) | Modals, popovers |
| 4 (High) | 0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04) | Dialogs, elementos flotantes |
| Focus | 0 0 0 2px #FFFFFF, 0 0 0 4px #2563EB | Focus ring accesible en todos los interactivos |

Inputs usan border solido `#E4E4E7` en reposo, focus ring azul al enfocar.

## Shapes

Border radius progresivo segun tamano del elemento:

- **None (0px):** Tablas internas, dividers
- **SM (4px):** Badges inline, tags pequenos
- **MD (8px):** Botones, inputs, elementos funcionales
- **LG (12px):** Cards, containers, modales
- **XL (16px):** Cards hero, sections destacadas
- **Full (9999px):** Pills, badges, avatares

Principio: elementos mas grandes llevan radio mas grande. Nunca pill radius en botones de accion principal.

## Components

### Buttons
- **Primary:** Fondo oscuro (#0A0A0B), texto blanco, 8px radius, 40px alto. El CTA principal.
- **Secondary:** Fondo blanco, borde zinc, texto oscuro. Accion secundaria.
- **Ghost:** Sin fondo, hover sutil. Acciones terciarias, navigation.
- **Destructive:** Fondo rojo, texto blanco. Solo para acciones irreversibles.
- Todos: font-weight 500, 14px, transicion de 150ms en hover.

### Cards
- Fondo blanco, border 1px `#E4E4E7`, radius 12px, padding 24px.
- Hover: shadow level 2.
- Clickable cards: cursor pointer, shadow transition suave.

### Inputs
- Fondo blanco, border 1px `#E4E4E7`, radius 8px, padding 10px 12px, 40px alto.
- Focus: border azul `#2563EB` + focus ring.
- Error: border rojo `#DC2626`.
- Placeholder: color `#71717A`.

### Badges
- Radius full (pill), padding 2px 10px, font 12px weight 500.
- Default: fondo zinc-100, texto zinc-600.
- Info: fondo azul tintado, texto azul.
- Success/Warning/Error: mismo patron con colores semanticos.

### Navigation
- Sticky top, fondo blanco, border-bottom 1px `#E4E4E7`.
- Links: 14px weight 500, color zinc-600, hover zinc-900.
- Logo left, nav center o left, CTA right.
- Mobile: hamburger menu.

### Tables
- Header: fondo `#F4F4F5`, texto 12px weight 500 uppercase letter-spacing 0.05em.
- Rows: border-bottom 1px `#E4E4E7`, padding 12px 16px.
- Hover row: fondo `#F4F4F5`.

### Modals
- Overlay: rgba(0,0,0,0.5) con backdrop-blur 4px.
- Container: fondo blanco, radius 12px, shadow level 3, padding 24px.
- Max-width 480px para confirmaciones, 640px para formularios.

## Do's and Don'ts

### Do
- Usar los tokens de color semanticos en lugar de colores hardcodeados
- Mantener contraste WCAG AA minimo (4.5:1 para texto, 3:1 para elementos grandes)
- Usar Inter para todo el texto UI y JetBrains Mono solo para codigo/datos tecnicos
- Aplicar focus ring visible en TODOS los elementos interactivos
- Usar spacing scale de 8px consistentemente
- Cards siempre con border sutil, nunca flotando sin contencion visual
- Transiciones suaves (150ms ease) en hover y focus states

### Don't
- No usar mas de 3 colores de acento por vista. Azul como principal, semanticos para estados.
- No usar sombras dramaticas. Maximo 0.12 opacidad.
- No usar font-weight 800-900. El rango es 400-700.
- No usar border-radius inconsistente. Seguir la escala progresiva.
- No usar colores de estado (rojo/verde/amber) para elementos decorativos
- No meter padding arbitrario. Siempre del spacing scale.
- No ignorar dark mode: esta base esta disenada para light; el override de dark mode se define por proyecto.
- No usar pill radius (9999px) en botones de accion. Solo para badges y tags.

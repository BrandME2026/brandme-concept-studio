# BrandMe v0.3 — Guía de diseño

> Síntesis fiel de los docs 6, 13, 18, 20, 32 de Drive. Fuente de verdad: `DRIVE-INDEX.md`.
> **Hallazgo clave:** BrandMe NO define un design system corporativo propio (sin paleta, tipografía
> ni logo de plataforma en los docs). El diseño tiene DOS fuentes: (a) identity tokens **dinámicos
> por marca** extraídos por Agent 02, y (b) estructura fija de bloques + Brand Template Override.
> No hay mención de Figma ni de librería de UI (shadcn/Radix/etc.) → es decisión nuestra.

## 1. Design tokens de la plataforma BrandMe

**NO ESPECIFICADO** en los docs. Lo único concreto:
- Dominio único: **`getbrandme.ai`** (sin custom domains en MVP, para acumular autoridad SEO/GEO).
- Title tag: `[Brand Name] Franchise Opportunity — [Consultant Name] | BrandMe`.
- Email de privacidad: `privacy@getbrandme.ai`.

> ⚠️ **Decisión pendiente (nuestra):** definir el design system del *Consultant Portal* y del
> *Admin Console* (paleta, tipografía, librería de componentes). No está en el spec del cliente.
> Mientras tanto, `DESIGN.md` (raíz) es el template global base, con tokens marcados como TODO.

## 2. Identity tokens dinámicos por marca (Agent 02 — Brand Extraction)

Cada BrandMePage se estiliza con tokens **extraídos del sitio de la marca**. Campos del payload:

| Token | Validación / valores |
|-------|---------------------|
| `primary_color` | color no-neutral más usado del sitio, tolerancia **ΔE2000 ≤ 10** (≥80% marcas test) |
| `secondary_palette` | subconjunto verificable del top de color del sitio |
| `typography_classification` | fuente de heading primaria o misma clasificación (≥90% marcas test) |
| `header_style` | enum: `full-width-hero` · `centered-hero` · `split-layout` · `minimal-nav` · `unknown` |

**Content signals (informan tono/copy, no estilo visual):** `brand_voice_keywords` (≥10, ≥7
verificables) · `brand_voice_descriptor` (≥2 tono + ≥1 estilo) · `avoid_list` · `faq_topic_areas`
(≥3) · `vertical_category` (12 enums) · datos FDD (solo confidence `explicit`).

### Degradación (neutral default template)
Se dispara si **<3** de estas señales extraen limpiamente: primary color, secondary palette,
primary font, ≥5 voice keywords, ≥3 FAQ topics → la página usa **styling neutro** + overlay del
consultor. No es un layout alternativo seleccionable, es un estado de fallback.

### Precedencia de assets
Brand Content Hub (admin) **sobreescribe** la extracción: logo aprobado > no-logo posture ·
hex colors aprobados > paleta extraída · copy aprobado = verbatim permitido.

## 3. Constraints de diseño / copy de la BrandMePage (Agent 04)

- Copy a **Flesch-Kincaid grado 8–10**.
- **Sin verbatim de ≥6 palabras consecutivas** del sitio original (Agent 04 dice ">5", BEX-004
  dice "≥6" — unificar a ≥6 en implementación; ver `OPEN-QUESTIONS.md`).
- **No-logo posture**: sin logos de marca salvo asset aprobado. Las brand cards usan un **swatch
  del primary color** como identificador (sin imagen).
- Sin earnings garantizados — lenguaje calificado obligatorio.
- Tono = brand voice descriptor; default si degradado: **"professional, direct, benefit-focused"**.
- Headshot: JPEG/PNG, máx **5MB**, mín **200×200px**.

## 4. Accesibilidad — WCAG 2.1 AA (obligatorio)

- AA en TODAS las superficies (portal + prospect-facing: AMA, lead form, SEO pages, BrandMePage).
- Navegación completa por teclado (incl. alternativa no-drag al pipeline drag-and-drop).
- Live-region announcements para respuestas streaming de AMA/Concierge.
- Focus trap + restauración en modales; errores vía ARIA + error summary.
- Checks automáticos de a11y **gatean cada deploy**. Verificación manual: **VoiceOver/Safari iOS**
  + **NVDA/Windows** antes de beta y launch.
- Responsive: prospect-facing hasta **375px**; portal usable a **768px+**.

## 5. Core Web Vitals (gate de cada build, p75 RUM)

| Métrica | Umbral |
|---------|--------|
| LCP | < **2.5s** |
| INP | < **200ms** |
| CLS | < **0.1** |
| TTFB | < **800ms** |

Portal: load inicial <2s p95 · navegación <500ms p95 · GET API <300ms p95 · mutaciones <800ms p95.
AMA: primer token <1.5s p50 · respuesta 2s p50 / 3s p95 / 6s p99.
Medición vía Vercel Web Analytics o RUM equivalente desde Build 4. Fallar = bloqueo de build.

## 6. SEO / metadata visual
- Open Graph (title, description 150 chars, url, image = headshot o fallback de marca).
- JSON-LD server-rendered: LocalBusiness/ProfessionalService + BreadcrumbList.

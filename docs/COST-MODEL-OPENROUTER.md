# Recompute del Cost Model — OpenRouter (2026-07-09)

> Análisis ejecutado por el agente para cerrar el banner "PENDING RECOMPUTATION"
> del doc **Technology Stack & Cost Model** en 8090. Fuente de pricing: API
> pública `GET https://openrouter.ai/api/v1/models` (2026-07-09). **Pendiente
> de sign-off de Junior** — nada de esto está sembrado en `platform_config`.

## 1. Comparativa: baseline Anthropic-directo vs OpenRouter live

| Componente ($/MTok) | Baseline (doc 8090) | OpenRouter live | Delta |
|---|---|---|---|
| Sonnet 4.6 input | 3.00 | 3.00 | ✅ 0 |
| Sonnet 4.6 output | 15.00 | 15.00 | ✅ 0 |
| Sonnet cache read | 0.30 | 0.30 | ✅ 0 |
| Sonnet cache write (5m) | 3.75 | 3.75 | ✅ 0 |
| Haiku 4.5 input | 1.00 | 1.00 | ✅ 0 |
| Haiku 4.5 output | 5.00 | 5.00 | ✅ 0 |
| Haiku cache read | 0.10 | 0.10 | ✅ 0 |
| Haiku cache write (5m) | 1.25 | 1.25 | ✅ 0 |

**Conclusión:** OpenRouter hace pass-through del list price de Anthropic para
los modelos Claude. La tabla de aliases y el grueso del proforma del doc de
8090 siguen válidos tal cual.

Otros modelos del stack actual (para `llm.pricing`):
- `openai/gpt-5.5`: 5.00 in · 30.00 out · 0.50 cache-read (generación premium del prototipo)
- `deepseek/deepseek-v4-flash`: 0.09 in · 0.18 out · 0.018 cache-read (chat/agent barato)
- `anthropic/claude-opus-4.7` (fallback): 5.00 in · 25.00 out · 0.50 cr · 6.25 cw

## 2. Los 3 riesgos del banner, resueltos

1. **"Per-token pricing differs"** → NO difiere (tabla arriba). ✅
2. **"Prompt caching not identical"** → OpenRouter soporta `cache_control` en
   Claude con los mismos rates. Nuestra implementación (WO-4/WO-7) ya setea el
   TTL explícito por invocación. ⚠️ Verificar en el primer invoice que el write
   de TTL-1h se cobra 2.0× (OpenRouter solo publica el rate 5m).
3. **"Batch API discount may not apply"** → CONFIRMADO: OpenRouter no ofrece el
   Batch API de Anthropic. Impacto: agentes 14/15/16/17/06-refresh pierden el
   50% ≈ **$1.50–$2.50/consultor/mes** (números del propio doc).

## 3. Decisión pendiente (Junior/CTO)

**(a) Recomendada — híbrido:** agentes batch van DIRECTO a Anthropic (Batch
API, 50% off) y todo lo realtime queda en OpenRouter. El `AIModelProvider`
(EP-05, WO-4) hace el swap con un adapter nuevo + config — cero cambios en
agentes. Margen ~71% del baseline se mantiene íntegro.
**(b) Absorber:** todo por OpenRouter; margen baja el equivalente de la línea
batch (~$1.50–2.50/consultor/mes a 450 consultores).

## 4. Seed propuesto para `platform_config` (tras sign-off)

```sql
UPDATE platform_config SET current_value = '{
  "anthropic/claude-sonnet-4.6":  {"input_per_mtok": 3.00, "output_per_mtok": 15.00, "cache_read_per_mtok": 0.30, "cache_write_per_mtok": 3.75},
  "anthropic/claude-haiku-4.5":   {"input_per_mtok": 1.00, "output_per_mtok": 5.00,  "cache_read_per_mtok": 0.10, "cache_write_per_mtok": 1.25},
  "anthropic/claude-opus-4.7":    {"input_per_mtok": 5.00, "output_per_mtok": 25.00, "cache_read_per_mtok": 0.50, "cache_write_per_mtok": 6.25},
  "openai/gpt-5.5":               {"input_per_mtok": 5.00, "output_per_mtok": 30.00, "cache_read_per_mtok": 0.50},
  "deepseek/deepseek-v4-flash":   {"input_per_mtok": 0.09, "output_per_mtok": 0.18,  "cache_read_per_mtok": 0.018},
  "google/gemini-3.1-pro-preview":{"input_per_mtok": 2.00, "output_per_mtok": 12.00, "cache_read_per_mtok": 0.20, "cache_write_per_mtok": 0.375}
}'::jsonb WHERE feature_area = 'llm' AND config_key = 'pricing';
-- Y definir el techo de gasto diario cuando haya proforma firmada:
-- UPDATE platform_config SET current_value = '<USD>'::jsonb WHERE feature_area='llm' AND config_key='daily_cost_cap_usd';
```

Con esto, la telemetría `llm_invocations` (WO-4) empieza a atribuir costos
reales y el `LLMBudgetBreaker` puede activarse con un techo con sentido.

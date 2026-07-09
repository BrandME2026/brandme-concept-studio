import { getConfigValue } from "@/lib/config/config-store";

/**
 * LLMBudgetBreaker (WO-4, blueprint LLMWrapper): techo de GASTO diario (USD)
 * sobre todas las invocaciones del wrapper. Gatea ANTES de cualquier transporte;
 * acumula estimated_cost_usd del día UTC; el cap vive en ConfigStore
 * (llm.daily_cost_cap_usd) — null = sin techo (hasta que el Cost Model se
 * recalcule con pricing OpenRouter; pendiente con banner en 8090).
 *
 * NO es un rate limiter (frontera del blueprint): el tope de OPERACIONES de las
 * rutas del prototipo vive en rate-limit.ts (llm.daily_cap). Contador en
 * memoria por instancia (stack note del blueprint; Redis es target multi-réplica).
 */

export class LLMBudgetExceededError extends Error {}

let day = "";
let spentUsd = 0;

function rollDay(): void {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  if (today !== day) {
    day = today;
    spentUsd = 0;
  }
}

export const llmBudgetBreaker = {
  /** Lanza LLMBudgetExceededError si el techo del día ya se alcanzó. */
  async assertWithinBudget(): Promise<void> {
    rollDay();
    const cap = await getConfigValue<number | null>("llm", "daily_cost_cap_usd", null);
    if (cap !== null && Number.isFinite(cap) && spentUsd >= cap) {
      throw new LLMBudgetExceededError(
        `Techo diario de gasto LLM alcanzado (${spentUsd.toFixed(6)} >= ${cap} USD)`,
      );
    }
  },
  /** Acumula el costo estimado de una invocación completada. */
  track(costUsd: number): void {
    rollDay();
    if (Number.isFinite(costUsd) && costUsd > 0) spentUsd += costUsd;
  },
  status() {
    rollDay();
    return { day, spentUsd };
  },
  /** Solo tests. */
  __resetForTests(): void {
    day = "";
    spentUsd = 0;
  },
};

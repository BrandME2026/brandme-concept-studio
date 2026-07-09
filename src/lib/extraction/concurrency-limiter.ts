import { getConfigNumber } from "@/lib/config/config-store";

/**
 * Agent02ConcurrencyLimiter (WO-13, AC-BEX-012): cap configurable (default 10,
 * clamp 1–50, ConfigStore `extraction.concurrency_cap`) de invocaciones LLM
 * simultáneas del Agente 02. Los jobs que llegan con el cap alcanzado se
 * ENCOLAN (FIFO) — jamás se descartan. Contadores expuestos para el System
 * Health del Admin Console (Build 6).
 *
 * In-memory por proceso (mismo trade-off documentado que el rate limit WO-9 y
 * el budget breaker WO-4): con Task Server real (Trigger.dev, WO-12+) el cap
 * pasa a ser distribuido.
 */

class Agent02ConcurrencyLimiter {
  private active = 0;
  private queue: Array<() => void> = [];

  private async cap(): Promise<number> {
    const raw = await getConfigNumber("extraction", "concurrency_cap", 10);
    return Math.min(50, Math.max(1, Math.floor(raw)));
  }

  /** Espera un slot (FIFO). Devuelve el release — llamarlo SIEMPRE en finally. */
  async acquire(): Promise<() => void> {
    const cap = await this.cap();
    if (this.active >= cap) {
      // El release TRANSFIERE el slot al waiter (active no baja): sin ventana
      // para que un acquire nuevo robe el slot entre decremento y despertar.
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    };
  }

  /** Para el área System Health (AC-BEX-012.3). */
  stats(): { active: number; queued: number } {
    return { active: this.active, queued: this.queue.length };
  }

  __resetForTests(): void {
    this.active = 0;
    this.queue = [];
  }
}

export const agent02Limiter = new Agent02ConcurrencyLimiter();

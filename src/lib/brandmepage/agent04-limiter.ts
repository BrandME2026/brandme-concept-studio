import { getConfigNumber } from "@/lib/config/config-store";
import type { RerenderTier } from "./types";

/**
 * Agent04ConcurrencyLimiter (WO-15, AC-BPG-017 / ADR-002): cap configurable
 * (brandmepage.concurrency_cap, clamp 1-50) con cola de TRES prioridades —
 * consultant > admin > batch — y FIFO dentro de cada nivel. Jamás descarta
 * jobs. Release transfiere el slot al waiter de mayor prioridad (sin ventana
 * de robo — patrón WO-13).
 */

const TIER_ORDER: RerenderTier[] = ["consultant", "admin", "batch"];

class Agent04ConcurrencyLimiter {
  private active = 0;
  private queues: Record<RerenderTier, Array<() => void>> = {
    consultant: [],
    admin: [],
    batch: [],
  };

  private async cap(): Promise<number> {
    const raw = await getConfigNumber("brandmepage", "concurrency_cap", 10);
    return Math.min(50, Math.max(1, Math.floor(raw)));
  }

  private nextWaiter(): (() => void) | undefined {
    for (const tier of TIER_ORDER) {
      const waiter = this.queues[tier].shift();
      if (waiter) return waiter;
    }
    return undefined;
  }

  async acquire(tier: RerenderTier = "consultant"): Promise<() => void> {
    const cap = await this.cap();
    if (this.active >= cap) {
      await new Promise<void>((resolve) => this.queues[tier].push(resolve));
    } else {
      this.active++;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.nextWaiter();
      if (next) next();
      else this.active--;
    };
  }

  /** Para el área System Health (AC-BPG-017.4). */
  stats(): { active: number; queued: number; queuedByTier: Record<RerenderTier, number> } {
    return {
      active: this.active,
      queued: TIER_ORDER.reduce((n, t) => n + this.queues[t].length, 0),
      queuedByTier: {
        consultant: this.queues.consultant.length,
        admin: this.queues.admin.length,
        batch: this.queues.batch.length,
      },
    };
  }

  __resetForTests(): void {
    this.active = 0;
    this.queues = { consultant: [], admin: [], batch: [] };
  }
}

export const agent04Limiter = new Agent04ConcurrencyLimiter();

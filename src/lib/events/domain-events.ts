import { captureError } from "@/lib/observability/observability";

/**
 * Bus de eventos de dominio in-process MÍNIMO (WO-15). Los blueprints hablan de
 * eventos entre agentes (brand_extraction.completed → Agente 04, etc.); sin
 * Task Server (Trigger.dev, pendiente de provisionar) este bus es el mecanismo
 * honesto: mismo contrato, entrega en el mismo proceso, fire-and-forget con
 * captura de errores. Cuando exista el Task Server, los emit se convierten en
 * triggers de jobs sin tocar a los suscriptores.
 */

export interface DomainEvents {
  "brand_extraction.completed": {
    brandId: string;
    consultantId: string | null;
    extractionId: string;
  };
  "brandmepage.generated": { pageId: string; consultantId: string };
  profile_updated: { consultantId: string };
  brand_template_activated: { brandId: string };
  brand_template_deactivated: { brandId: string };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => Promise<void> | void;

const handlers = new Map<keyof DomainEvents, Handler<never>[]>();

export function onDomainEvent<K extends keyof DomainEvents>(event: K, handler: Handler<K>): void {
  const list = handlers.get(event) ?? [];
  list.push(handler as Handler<never>);
  handlers.set(event, list);
}

/** Fire-and-forget: un suscriptor que falla se loguea, jamás rompe al emisor. */
export function emitDomainEvent<K extends keyof DomainEvents>(
  event: K,
  payload: DomainEvents[K],
): void {
  for (const handler of handlers.get(event) ?? []) {
    Promise.resolve()
      .then(() => (handler as Handler<K>)(payload))
      .catch((err) => captureError(err, `[events] suscriptor de ${event} falló`));
  }
}

export function __resetDomainEventsForTests(): void {
  handlers.clear();
}

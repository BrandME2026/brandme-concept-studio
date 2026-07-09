import { NextResponse } from "next/server";
import { getConfigNumber } from "@/lib/config/config-store";
import { db, withSystemContext } from "@/lib/db/tenant-context";

/**
 * WebhookHandlerPrimitive (WO-6, EP-02 / REQ-PF-009): base reutilizable de TODO
 * webhook entrante. Valida la firma del vendor (400 sin ejecutar negocio),
 * deduplica por (vendor, event_id) con INSERT-BEFORE-PROCESS (los replays
 * concurrentes colisionan en el índice único) y corre el handler del vendor en
 * una transacción idempotente — si el negocio falla, el rollback NO consume el
 * registro de dedup y el reintento del vendor puede procesar.
 *
 * Los vendors (Stripe hoy; Firebase/Cal.com/RB2B después) aportan SOLO su
 * adapter: estrategia de firma + routing de eventos. Nunca reimplementan
 * firma ni dedup.
 */

export interface WebhookAdapter<E, P = E> {
  vendor: string;
  /**
   * Verifica la firma y parsea el evento. DEBE ser crypto local (sin red).
   * null = firma inválida o payload malformado → 400 sin efectos.
   */
  verifyAndParse(
    rawBody: string,
    headers: Headers,
  ): Promise<{ eventId: string; event: E } | null>;
  /**
   * Llamadas de RED al vendor (p.ej. re-fetch del recurso) — corre FUERA de la
   * transacción de dedup (regla WO-3: red nunca dentro de un contexto de DB).
   */
  prepare?(event: E): Promise<P>;
  /**
   * Lógica de negocio idempotente SOLO-DB. Corre tras el insert de dedup, en la
   * MISMA transacción system (usa db()/las funciones de la capa db directamente;
   * el contexto ya está abierto).
   */
  process(prepared: P): Promise<void>;
}

const RETENTION_DAYS_DEFAULT = 30;

/** Purga oportunista de registros vencidos. Fail-soft: nunca tumba el webhook. */
async function purgeExpired(vendor: string): Promise<void> {
  try {
    await withSystemContext("webhook-purge", async () => {
      await db().query(`DELETE FROM webhook_events WHERE expires_at <= now()`);
    });
  } catch (err) {
    console.error(`[webhooks:${vendor}] purga TTL falló (no bloquea)`, err);
  }
}

export async function handleWebhook<E, P = E>(
  req: Request,
  adapter: WebhookAdapter<E, P>,
): Promise<Response> {
  const rawBody = await req.text();

  const parsed = await adapter.verifyAndParse(rawBody, req.headers);
  if (!parsed) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  // Red del vendor FUERA de cualquier contexto de DB.
  const prepared = adapter.prepare
    ? await adapter.prepare(parsed.event)
    : (parsed.event as unknown as P);

  await purgeExpired(adapter.vendor);

  const retentionDays = await getConfigNumber(
    "webhooks",
    "event_retention_days",
    RETENTION_DAYS_DEFAULT,
  );

  try {
    const outcome = await withSystemContext(`webhook-${adapter.vendor}`, async () => {
      // Insert-before-process: reserva el event_id ANTES del negocio. Un replay
      // (concurrente o posterior) hace rowCount 0 y se reconoce sin ejecutar.
      const inserted = await db().query(
        `INSERT INTO webhook_events (vendor, event_id, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))
         ON CONFLICT (vendor, event_id) DO NOTHING`,
        [adapter.vendor, parsed.eventId, retentionDays],
      );
      if ((inserted.rowCount ?? 0) === 0) return "replay" as const;
      await adapter.process(prepared);
      return "processed" as const;
    });
    return NextResponse.json({ received: true, replay: outcome === "replay" });
  } catch (err) {
    // Rollback ya aplicado por withSystemContext: el dedup NO se consumió.
    // 500 → el vendor reintenta; el reintento procesará (dedup libre) y el
    // negocio es idempotente por contrato.
    console.error(`[webhooks:${adapter.vendor}] proceso falló (${parsed.eventId})`, err);
    return NextResponse.json({ error: "Procesamiento falló" }, { status: 500 });
  }
}

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Schema tipado (Drizzle) — estado FINAL tras las migraciones de drizzle/.
 * Es la fuente de verdad de tipos y el input de drizzle-kit para generar
 * futuras migraciones por diff. Las queries de runtime siguen siendo pg crudo
 * (coexistencia deliberada, decisión 2026-07-01); ningún módulo importa esto
 * para ejecutar SQL todavía.
 *
 * Regla WO-3: toda tabla TENANT-SCOPED lleva consultant_id + política RLS
 * (FORCE). users/user_sessions/consultants/consultant_sessions son tablas de
 * identidad (resolución de tenant) y quedan fuera de RLS en este WO.
 */

// ── Identidad ────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Firebase UID
  email: text("email"),
  displayName: text("display_name"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSessions = pgTable(
  "user_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_user_sessions_user").on(t.userId)],
);

/** Tenant core (blueprint Platform Foundation, modelo Consultant). account_state llega en WO-5 (EP-01 aditivo). */
export const consultants = pgTable(
  "consultants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firebaseUid: text("firebase_uid").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_consultants_firebase_uid")
      .on(t.firebaseUid)
      .where(sql`firebase_uid IS NOT NULL`),
  ],
);

/** Mapping cookie bmc_session → consultant. La cookie identifica el navegador; el tenant es el consultant. */
export const consultantSessions = pgTable(
  "consultant_sessions",
  {
    sessionId: text("session_id").primaryKey(),
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_consultant_sessions_consultant").on(t.consultantId)],
);

/** Config runtime EP-07 (WO-7). Tabla de plataforma SIN RLS; read path = ConfigStore. */
export const platformConfig = pgTable(
  "platform_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    featureArea: text("feature_area").notNull(),
    configKey: text("config_key").notNull(),
    currentValue: jsonb("current_value"),
    defaultValue: jsonb("default_value").notNull(),
    lastModifiedAt: timestamp("last_modified_at", { withTimezone: true }).notNull().defaultNow(),
    lastModifiedBy: uuid("last_modified_by"), // FK a identidad admin llega en Build 6
  },
  (t) => [uniqueIndex("idx_platform_config_area_key").on(t.featureArea, t.configKey)],
);

/** Telemetría por invocación LLM (WO-4). Plataforma, SIN RLS; exenta de retención estándar. */
export const llmInvocations = pgTable(
  "llm_invocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelAlias: text("model_alias").notNull(),
    resolvedModelName: text("resolved_model_name").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    cacheWriteTtlVariant: text("cache_write_ttl_variant"),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    latencyMs: integer("latency_ms").notNull().default(0),
    consultantId: uuid("consultant_id").references(() => consultants.id),
    agentId: text("agent_id"),
    invocationMode: text("invocation_mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_llm_invocations_created").on(t.createdAt.desc())],
);

// ── Tablas tenant-scoped (RLS + FORCE) ───────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull(), // se conserva por trazabilidad; ya NO es frontera
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    title: text("title").notNull().default("Nueva conversación"),
    messages: jsonb("messages").notNull().default([]),
    url: text("url"),
    generatedHtml: text("generated_html"),
    designMd: text("design_md"),
    name: text("name"),
    screenshot: text("screenshot"),
    slug: text("slug"),
    brand: text("brand"),
    city: text("city"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_conversations_session").on(t.sessionId, t.updatedAt.desc()),
    index("idx_conversations_consultant").on(t.consultantId, t.updatedAt.desc()),
  ],
);

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull(),
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    url: text("url").notNull(),
    name: text("name").notNull(),
    designMd: text("design_md").notNull(),
    html: text("html").notNull(),
    screenshot: text("screenshot"),
    interactions: text("interactions"),
    slug: text("slug"),
    brand: text("brand"),
    city: text("city"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    phone: text("phone"),
    keywords: text("keywords"),
    faq: text("faq"),
    css: text("css"),
    formFields: text("form_fields"),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_generations_session").on(t.sessionId, t.createdAt.desc()),
    index("idx_generations_consultant").on(t.consultantId, t.createdAt.desc()),
    uniqueIndex("idx_generations_slug").on(t.slug).where(sql`slug IS NOT NULL`),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    brand: text("brand"),
    city: text("city"),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    message: text("message"),
    source: text("source").notNull().default("form"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_leads_slug").on(t.slug, t.createdAt.desc()),
    index("idx_leads_consultant").on(t.consultantId, t.createdAt.desc()),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    sessionId: text("session_id").primaryKey(), // PK histórica; se conserva (EP-01)
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: text("status").notNull().default("incomplete"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_subscriptions_customer").on(t.stripeCustomerId),
    index("idx_subscriptions_consultant").on(t.consultantId),
  ],
);

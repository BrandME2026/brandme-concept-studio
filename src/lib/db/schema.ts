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

/**
 * Tenant core (blueprint Platform Foundation, modelo Consultant). account_state
 * (WO-5): pending → active → subscribed → active_post_cancel; SOLO lo escribe
 * AccountStateMachine (trigger enforce_account_state_writer, migración 0011).
 */
export const consultants = pgTable(
  "consultants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firebaseUid: text("firebase_uid").references(() => users.id),
    accountState: text("account_state").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_consultants_firebase_uid")
      .on(t.firebaseUid)
      .where(sql`firebase_uid IS NOT NULL`),
  ],
);

/** Milestones write-once del onboarding (WO-5): 1 fila por consultant, timestamps UTC. */
export const onboardingSessions = pgTable("onboarding_sessions", {
  consultantId: uuid("consultant_id")
    .primaryKey()
    .references(() => consultants.id, { onDelete: "cascade" }),
  stage1SubmittedAt: timestamp("stage1_submitted_at", { withTimezone: true }),
  stage2PasswordSetAt: timestamp("stage2_password_set_at", { withTimezone: true }),
  checkoutCompletedAt: timestamp("checkout_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/** Marca de franquicia (WO-13). Entidad de PLATAFORMA (sin RLS, como platform_config). */
export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    host: text("host").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("idx_brands_host").on(t.host)],
);

/** Corrida del Agente 02 (WO-13): 1 fila por corrida; la más reciente completed es la activa. */
export const brandExtractions = pgTable(
  "brand_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    triggeredByConsultantId: uuid("triggered_by_consultant_id").references(() => consultants.id),
    status: text("status").notNull().default("running"),
    identityTokens: jsonb("identity_tokens"),
    contentSignals: jsonb("content_signals"),
    verticalCategory: text("vertical_category"),
    verticalConfidence: text("vertical_confidence"),
    verticalLowConfidenceGuess: text("vertical_low_confidence_guess"),
    fddFinancialData: jsonb("fdd_financial_data"),
    brandTestimonials: jsonb("brand_testimonials"),
    brandAccolades: jsonb("brand_accolades"),
    intakeProtocolCoverage: jsonb("intake_protocol_coverage"),
    perFieldStatus: jsonb("per_field_status"),
    degradationFlag: boolean("degradation_flag").notNull().default(false),
    complianceVerifiedAt: timestamp("compliance_verified_at", { withTimezone: true }),
    scrapeUrls: text("scrape_urls").array().notNull().default([]),
    sameAsUrls: jsonb("same_as_urls"),
    rawContent: jsonb("raw_content"),
    failureClass: text("failure_class"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_brand_extractions_brand").on(t.brandId, t.createdAt),
    index("idx_brand_extractions_consultant").on(t.triggeredByConsultantId),
  ],
);

/** Cola de admin para corridas degradadas/fallidas (WO-13); un ACTIVO por brand. */
export const brandExtractionHealthRecords = pgTable("brand_extraction_health_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandExtractionId: uuid("brand_extraction_id")
    .notNull()
    .references(() => brandExtractions.id),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  failureClass: text("failure_class").notNull(),
  affectedConsultantIds: uuid("affected_consultant_ids").array().notNull().default([]),
  consultantOptionSelected: text("consultant_option_selected").notNull().default("none"),
  urlAttempts: jsonb("url_attempts").notNull().default([]),
  resolutionPath: text("resolution_path").notNull().default("none"),
  priorityFlags: text("priority_flags").array().notNull().default([]),
  degradedAt: timestamp("degraded_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

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

/** Dedup de webhooks entrantes (WO-6, EP-02). Plataforma, SIN RLS; purga TTL oportunista. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor").notNull(),
    eventId: text("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("idx_webhook_events_vendor_event").on(t.vendor, t.eventId),
    index("idx_webhook_events_expires").on(t.expiresAt),
  ],
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

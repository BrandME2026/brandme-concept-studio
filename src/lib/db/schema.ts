import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
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
    slug: text("slug"),
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

/** Config inmutable por corrida de generación del Agente 04 (WO-15). */
export const brandmePageConfigs = pgTable(
  "brandme_page_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    source: text("source").notNull().default("agent04_dynamic"),
    brandTemplateId: uuid("brand_template_id"),
    identityTokens: jsonb("identity_tokens").notNull(),
    contentSignals: jsonb("content_signals").notNull(),
    generatedCopy: jsonb("generated_copy").notNull(),
    fddFinancialData: jsonb("fdd_financial_data"),
    sameAsUrls: jsonb("same_as_urls"),
    complianceVerifiedAt: timestamp("compliance_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_bpc_pair").on(t.consultantId, t.brandId, t.createdAt)],
);

/** Página por par consultant-brand (WO-15); state SOLO vía ApprovalGateway/ReRenderScheduler. */
export const brandmePages = pgTable(
  "brandme_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    consultantSlug: text("consultant_slug").notNull(),
    brandSlug: text("brand_slug").notNull(),
    state: text("state").notNull().default("draft"),
    configId: uuid("config_id").references(() => brandmePageConfigs.id),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_bmp_pair").on(t.consultantId, t.brandId),
    uniqueIndex("idx_bmp_slugs").on(t.consultantSlug, t.brandSlug),
    index("idx_bmp_state").on(t.state),
  ],
);

/** Overrides de contenido por campo, versionados (WO-15, REQ-BPG-014). */
export const consultantContentOverrides = pgTable("consultant_content_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandmepageId: uuid("brandmepage_id")
    .notNull()
    .references(() => brandmePages.id, { onDelete: "cascade" }),
  consultantId: uuid("consultant_id")
    .notNull()
    .references(() => consultants.id),
  fieldKey: text("field_key").notNull(),
  currentValue: text("current_value").notNull(),
  originalAgentValue: text("original_agent_value").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("live"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Template admin versionado por brand (WO-15, REQ-BPG-007); a lo sumo 1 activo. */
export const brandTemplates = pgTable("brand_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  version: integer("version").notNull().default(1),
  isActive: boolean("is_active").notNull().default(false),
  identityTokens: jsonb("identity_tokens").notNull(),
  contentSignals: jsonb("content_signals").notNull(),
  authoredBy: uuid("authored_by"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Preview links con expiración de 14 días (WO-15, REQ-BPG-011). */
export const previewLinks = pgTable("preview_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandmepageId: uuid("brandmepage_id")
    .notNull()
    .references(() => brandmePages.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Señales ACS por ZIP (WO-18). Entidad de PLATAFORMA compartida (solo system). */
export const zipDemographicData = pgTable("zip_demographic_data", {
  zipCode: text("zip_code").primaryKey(),
  medianHhIncome: integer("median_hh_income"),
  popGrowth5yrPct: numeric("pop_growth_5yr_pct", { precision: 6, scale: 3 }),
  businessOwnerPct: numeric("business_owner_pct", { precision: 6, scale: 3 }),
  ownerOccupancyRate: numeric("owner_occupancy_rate", { precision: 6, scale: 3 }),
  age3565Pct: numeric("age_35_65_pct", { precision: 6, scale: 3 }),
  age2552Pct: numeric("age_25_52_pct", { precision: 6, scale: 3 }),
  age65PlusPct: numeric("age_65_plus_pct", { precision: 6, scale: 3 }),
  householdDensityPerSqMile: numeric("household_density_per_sq_mile", { precision: 10, scale: 2 }),
  acsVintageYear: integer("acs_vintage_year").notNull(),
  dataLimited: boolean("data_limited").notNull().default(false),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Territorio confirmado por consultant (WO-18); lockeado post-Stage 1 (AC-TI-001.6). */
export const consultantTerritories = pgTable(
  "consultant_territories",
  {
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    zipCode: text("zip_code").notNull(),
    ingestionStatus: text("ingestion_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consultantId, t.zipCode] })],
);

/** Score por combinación consultant-brand-ZIP (WO-18, RLS tenant read). */
export const zipFranchiseScores = pgTable("zip_franchise_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultantId: uuid("consultant_id")
    .notNull()
    .references(() => consultants.id),
  brandId: uuid("brand_id").references(() => brands.id),
  zipCode: text("zip_code").notNull(),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  demographicComponent: numeric("demographic_component", { precision: 5, scale: 2 }).notNull(),
  performanceComponent: numeric("performance_component", { precision: 5, scale: 2 }),
  weightProfileUsed: text("weight_profile_used").notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Agregados anónimos cross-consultant por ZIP (WO-18; solo system). */
export const crossConsultantZipSignals = pgTable("cross_consultant_zip_signals", {
  zipCode: text("zip_code").primaryKey(),
  contributingConsultantCount: integer("contributing_consultant_count").notNull().default(0),
  aggregateBrandmepageViews: bigint("aggregate_brandmepage_views", { mode: "number" })
    .notNull()
    .default(0),
  aggregateLeadVolume: integer("aggregate_lead_volume").notNull().default(0),
  aggregateQualifiedLeadRate: numeric("aggregate_qualified_lead_rate", { precision: 5, scale: 2 }),
  aggregateConversionRate: numeric("aggregate_conversion_rate", { precision: 5, scale: 2 }),
  lastComputedAt: timestamp("last_computed_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Testimonials del consultant (WO-38): perfil, aplican a todas sus páginas; máx 5. */
export const testimonials = pgTable(
  "testimonials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    quote: text("quote").notNull(),
    displayName: text("display_name").notNull(),
    roleContext: text("role_context"),
    visible: boolean("visible").notNull().default(true),
    position: integer("position").notNull().default(0),
    source: text("source").notNull().default("manual"),
    sourceBrandName: text("source_brand_name"),
    sourceUrl: text("source_url"),
    status: text("status").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_testimonials_consultant").on(t.consultantId, t.position)],
);

/** Sugerencias brand-sourced descartadas (WO-38, AC-TES-005.2). */
export const testimonialDismissals = pgTable(
  "testimonial_dismissals",
  {
    consultantId: uuid("consultant_id")
      .notNull()
      .references(() => consultants.id),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => brandExtractions.id),
    quoteHash: text("quote_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consultantId, t.extractionId, t.quoteHash] })],
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

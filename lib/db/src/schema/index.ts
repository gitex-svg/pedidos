import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  index,
  uniqueIndex,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "REPRESENTATIVE",
]);

export const internalOrderStatusEnum = pgEnum("internal_order_status", [
  "DRAFT",
  "SUBMITTED",
]);

export const erpStatusEnum = pgEnum("erp_status", [
  "EM_ANALISE",
  "APROVADO",
  "FECHADO",
  "FATURADO",
  "REPROVADO",
]);

export const priceOriginEnum = pgEnum("price_origin", [
  "CUSTOMER",
  "REPRESENTATIVE",
  "STANDARD",
  "SPECIAL",
]);

export const priceTypeEnum = pgEnum("price_type", [
  "STANDARD",
  "REPRESENTATIVE",
  "CUSTOMER",
]);

export const integrationDirectionEnum = pgEnum("integration_direction", [
  "INBOUND",
  "OUTBOUND",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "SUCCESS",
  "ERROR",
]);

export const user = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("REPRESENTATIVE"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const users = user;

export const session = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("sessions_user_id_idx").on(table.userId)]);
export const sessions = session;

export const account = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  issuer: text("issuer").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("accounts_user_id_idx").on(table.userId),
  uniqueIndex("accounts_issuer_account_id_unique").on(table.issuer, table.accountId),
]);
export const accounts = account;

export const verification = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const verifications = verification;

export const representatives = pgTable("representatives", {
  id: uuid("id").defaultRandom().primaryKey(),
  erpCode: varchar("erp_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  email: varchar("email", { length: 320 }),
  userId: uuid("user_id").unique().references(() => users.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("representatives_name_idx").on(table.name),
]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  erpCode: varchar("erp_code", { length: 64 }).notNull().unique(),
  representativeId: uuid("representative_id").notNull().references(() => representatives.id),
  cnpjCpf: varchar("cnpj_cpf", { length: 32 }),
  corporateName: varchar("corporate_name", { length: 200 }).notNull(),
  tradeName: varchar("trade_name", { length: 200 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 2 }),
  active: boolean("active").notNull().default(true),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("customers_representative_idx").on(table.representativeId),
  index("customers_corporate_name_idx").on(table.corporateName),
  index("customers_trade_name_idx").on(table.tradeName),
  index("customers_cnpj_cpf_idx").on(table.cnpjCpf),
]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  erpId: varchar("erp_id", { length: 128 }).notNull().unique(),
  groupCode: varchar("group_code", { length: 2 }).notNull(),
  typeCode: varchar("type_code", { length: 2 }).notNull(),
  productCode: varchar("product_code", { length: 4 }).notNull(),
  referenceCode: varchar("reference_code", { length: 8 }).notNull(),
  code: varchar("code", { length: 64 }).notNull(),
  description: text("description").notNull(),
  collection: varchar("collection", { length: 120 }),
  packaging: varchar("packaging", { length: 120 }),
  width: varchar("width", { length: 64 }),
  color: varchar("color", { length: 120 }),
  active: boolean("active").notNull().default(true),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("products_code_idx").on(table.code),
  index("products_description_idx").on(table.description),
  index("products_identity_search_idx").on(table.groupCode, table.typeCode, table.productCode, table.referenceCode),
]);

export const priceTables = pgTable("price_tables", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  erpCode: varchar("erp_code", { length: 64 }).notNull().unique(),
  priceType: priceTypeEnum("price_type").notNull(),
  representativeId: uuid("representative_id").references(() => representatives.id, {
    onDelete: "no action",
    onUpdate: "no action",
  }),
  customerId: uuid("customer_id").references(() => customers.id, {
    onDelete: "no action",
    onUpdate: "no action",
  }),
  active: boolean("active").notNull().default(true),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check(
    "price_tables_scope_check",
    sql`(
      (${table.priceType} = 'STANDARD' AND ${table.representativeId} IS NULL AND ${table.customerId} IS NULL)
      OR (${table.priceType} = 'REPRESENTATIVE' AND ${table.representativeId} IS NOT NULL AND ${table.customerId} IS NULL)
      OR (${table.priceType} = 'CUSTOMER' AND ${table.representativeId} IS NULL AND ${table.customerId} IS NOT NULL)
    )`,
  ),
  check(
    "price_tables_validity_range_check",
    sql`${table.validFrom} IS NULL OR ${table.validUntil} IS NULL OR ${table.validFrom} <= ${table.validUntil}`,
  ),
  index("price_tables_type_active_validity_idx").on(
    table.priceType,
    table.active,
    table.validFrom,
    table.validUntil,
  ),
  index("price_tables_representative_active_idx").on(table.representativeId, table.active),
  index("price_tables_customer_active_idx").on(table.customerId, table.active),
]);

export const priceTableItems = pgTable("price_table_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  priceTableId: uuid("price_table_id").notNull().references(() => priceTables.id, {
    onDelete: "no action",
    onUpdate: "no action",
  }),
  productId: uuid("product_id").notNull().references(() => products.id, {
    onDelete: "no action",
    onUpdate: "no action",
  }),
  unitPrice: numeric("unit_price", { precision: 18, scale: 6, mode: "string" }).notNull(),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("price_table_items_table_product_unique").on(table.priceTableId, table.productId),
  index("price_table_items_table_active_idx").on(table.priceTableId, table.active),
  index("price_table_items_product_active_idx").on(table.productId, table.active),
]);

export const paymentTerms = pgTable("payment_terms", {
  id: uuid("id").defaultRandom().primaryKey(),
  erpCode: varchar("erp_code", { length: 64 }).notNull().unique(),
  description: varchar("description", { length: 240 }).notNull(),
  installments: integer("installments"),
  active: boolean("active").notNull().default(true),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("payment_terms_description_idx").on(table.description)]);

export const carriers = pgTable("carriers", {
  id: uuid("id").defaultRandom().primaryKey(),
  erpCode: varchar("erp_code", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  taxId: varchar("tax_id", { length: 32 }),
  active: boolean("active").notNull().default(true),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("carriers_name_idx").on(table.name),
  index("carriers_tax_id_idx").on(table.taxId),
]);

/**
 * `internal_number` is allocated by orders_internal_number_seq in PostgreSQL.
 * A sequence is deliberately allowed to have gaps: it is concurrency-safe and
 * never derives a number from MAX(internal_number).
 */
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  internalNumber: bigint("internal_number", { mode: "number" })
    .notNull().default(sql`nextval('orders_internal_number_seq')`),
  representativeId: uuid("representative_id").notNull().references(() => representatives.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  paymentTermId: uuid("payment_term_id").notNull().references(() => paymentTerms.id),
  carrierId: uuid("carrier_id").references(() => carriers.id),
  notes: text("notes"),
  discount1: numeric("discount1", { precision: 7, scale: 4, mode: "string" }).notNull().default("0"),
  discount2: numeric("discount2", { precision: 7, scale: 4, mode: "string" }).notNull().default("0"),
  discount3: numeric("discount3", { precision: 7, scale: 4, mode: "string" }).notNull().default("0"),
  discount4: numeric("discount4", { precision: 7, scale: 4, mode: "string" }).notNull().default("0"),
  grossTotal: numeric("gross_total", { precision: 20, scale: 2, mode: "string" }).notNull().default("0"),
  netTotal: numeric("net_total", { precision: 20, scale: 2, mode: "string" }).notNull().default("0"),
  internalStatus: internalOrderStatusEnum("internal_status").notNull().default("DRAFT"),
  erpStatus: erpStatusEnum("erp_status"),
  erpOrderNumber: varchar("erp_order_number", { length: 128 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  erpSyncedAt: timestamp("erp_synced_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("orders_internal_number_unique").on(table.internalNumber),
  index("orders_representative_created_idx").on(table.representativeId, table.createdAt),
  index("orders_customer_created_idx").on(table.customerId, table.createdAt),
  index("orders_internal_status_created_idx").on(table.internalStatus, table.createdAt),
  check("orders_discount_range_check", sql`${table.discount1} between 0 and 100 and ${table.discount2} between 0 and 100 and ${table.discount3} between 0 and 100 and ${table.discount4} between 0 and 100`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "no action", onUpdate: "no action" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  groupCode: varchar("group_code", { length: 2 }).notNull(),
  typeCode: varchar("type_code", { length: 2 }).notNull(),
  productCode: varchar("product_code", { length: 4 }).notNull(),
  referenceCode: varchar("reference_code", { length: 8 }).notNull(),
  productCodeSnapshot: varchar("product_code_snapshot", { length: 64 }).notNull(),
  descriptionSnapshot: text("description_snapshot").notNull(),
  packagingSnapshot: varchar("packaging_snapshot", { length: 120 }),
  widthSnapshot: varchar("width_snapshot", { length: 64 }),
  colorSnapshot: varchar("color_snapshot", { length: 120 }),
  quantity: numeric("quantity", { precision: 18, scale: 4, mode: "string" }).notNull(),
  suggestedUnitPrice: numeric("suggested_unit_price", { precision: 18, scale: 6, mode: "string" }).notNull(),
  suggestedPriceOrigin: priceOriginEnum("suggested_price_origin").notNull(),
  suggestedPriceTableId: uuid("suggested_price_table_id").references(() => priceTables.id, {
    onDelete: "no action", onUpdate: "no action",
  }),
  suggestedPriceTableErpCode: varchar("suggested_price_table_erp_code", { length: 64 }),
  effectiveUnitPrice: numeric("effective_unit_price", { precision: 18, scale: 6, mode: "string" }).notNull(),
  effectivePriceOrigin: priceOriginEnum("effective_price_origin").notNull(),
  isSpecialPrice: boolean("is_special_price").notNull().default(false),
  specialUnitPrice: numeric("special_unit_price", { precision: 18, scale: 6, mode: "string" }),
  discount1: numeric("discount1", { precision: 7, scale: 4, mode: "string" }).notNull(),
  discount2: numeric("discount2", { precision: 7, scale: 4, mode: "string" }).notNull(),
  discount3: numeric("discount3", { precision: 7, scale: 4, mode: "string" }).notNull(),
  discount4: numeric("discount4", { precision: 7, scale: 4, mode: "string" }).notNull(),
  discountsApplied: boolean("discounts_applied").notNull(),
  netUnitPrice: numeric("net_unit_price", { precision: 18, scale: 6, mode: "string" }).notNull(),
  grossTotal: numeric("gross_total", { precision: 20, scale: 2, mode: "string" }).notNull(),
  netTotal: numeric("net_total", { precision: 20, scale: 2, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("order_items_order_idx").on(table.orderId),
  index("order_items_product_idx").on(table.productId),
  check("order_items_quantity_positive_check", sql`${table.quantity} > 0`),
  check("order_items_special_check", sql`(${table.isSpecialPrice} = false and ${table.specialUnitPrice} is null) or (${table.isSpecialPrice} = true and ${table.specialUnitPrice} > 0)`),
  check("order_items_discount_range_check", sql`${table.discount1} between 0 and 100 and ${table.discount2} between 0 and 100 and ${table.discount3} between 0 and 100 and ${table.discount4} between 0 and 100`),
]);

export const integrationLogs = pgTable("integration_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  correlationId: uuid("correlation_id").notNull(),
  entity: varchar("entity", { length: 64 }).notNull(),
  direction: integrationDirectionEnum("direction").notNull().default("INBOUND"),
  endpoint: varchar("endpoint", { length: 200 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  status: integrationStatusEnum("status").notNull(),
  entityId: uuid("entity_id"),
  externalId: varchar("external_id", { length: 128 }),
  errorMessage: text("error_message"),
  received: integer("received").notNull().default(0),
  created: integer("created_count").notNull().default(0),
  updated: integer("updated_count").notNull().default(0),
  ignored: integer("ignored_count").notNull().default(0),
  errors: integer("error_count").notNull().default(0),
  errorDetails: jsonb("error_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("integration_logs_correlation_idx").on(table.correlationId),
  index("integration_logs_entity_created_idx").on(table.entity, table.createdAt),
]);

export const insertUserSchema = createInsertSchema(user);
export const insertSessionSchema = createInsertSchema(session);
export const insertRepresentativeSchema = createInsertSchema(representatives);
export const insertCustomerSchema = createInsertSchema(customers);
export const insertProductSchema = createInsertSchema(products);
export const insertPaymentTermSchema = createInsertSchema(paymentTerms);
export const insertCarrierSchema = createInsertSchema(carriers);
export const insertPriceTableSchema = createInsertSchema(priceTables);
export const insertPriceTableItemSchema = createInsertSchema(priceTableItems);
export const insertOrderSchema = createInsertSchema(orders);
export const insertOrderItemSchema = createInsertSchema(orderItems);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Representative = typeof representatives.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PriceTable = typeof priceTables.$inferSelect;
export type PriceTableItem = typeof priceTableItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertUser = typeof user.$inferInsert;
export type InsertSession = typeof session.$inferInsert;
export type InsertRepresentative = typeof representatives.$inferInsert;
export type InsertPriceTable = typeof priceTables.$inferInsert;
export type InsertPriceTableItem = typeof priceTableItems.$inferInsert;
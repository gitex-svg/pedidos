import {
  boolean,
  integer,
  jsonb,
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

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Representative = typeof representatives.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type InsertUser = typeof user.$inferInsert;
export type InsertSession = typeof session.$inferInsert;
export type InsertRepresentative = typeof representatives.$inferInsert;
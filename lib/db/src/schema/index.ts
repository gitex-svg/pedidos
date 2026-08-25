import {
  boolean,
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
});

export const insertUserSchema = createInsertSchema(user);
export const insertSessionSchema = createInsertSchema(session);
export const insertRepresentativeSchema = createInsertSchema(representatives);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Representative = typeof representatives.$inferSelect;
export type InsertUser = typeof user.$inferInsert;
export type InsertSession = typeof session.$inferInsert;
export type InsertRepresentative = typeof representatives.$inferInsert;
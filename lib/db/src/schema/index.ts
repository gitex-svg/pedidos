import {
  boolean,
  pgEnum,
  pgTable,
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

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("REPRESENTATIVE"),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

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

export const insertUserSchema = createInsertSchema(users);
export const insertSessionSchema = createInsertSchema(sessions);
export const insertRepresentativeSchema = createInsertSchema(representatives);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Representative = typeof representatives.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type InsertSession = typeof sessions.$inferInsert;
export type InsertRepresentative = typeof representatives.$inferInsert;
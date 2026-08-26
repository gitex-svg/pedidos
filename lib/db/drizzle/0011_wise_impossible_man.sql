ALTER TABLE "orders" ADD COLUMN "representative_erp_code_snapshot" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_erp_code_snapshot" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_term_erp_code_snapshot" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carrier_erp_code_snapshot" varchar(64);--> statement-breakpoint
UPDATE "orders" AS "o"
SET
  "representative_erp_code_snapshot" = (SELECT "r"."erp_code" FROM "representatives" AS "r" WHERE "r"."id" = "o"."representative_id"),
  "customer_erp_code_snapshot" = (SELECT "c"."erp_code" FROM "customers" AS "c" WHERE "c"."id" = "o"."customer_id"),
  "payment_term_erp_code_snapshot" = (SELECT "p"."erp_code" FROM "payment_terms" AS "p" WHERE "p"."id" = "o"."payment_term_id"),
  "carrier_erp_code_snapshot" = (SELECT "ca"."erp_code" FROM "carriers" AS "ca" WHERE "ca"."id" = "o"."carrier_id")
WHERE "o"."internal_status" = 'SUBMITTED';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_submitted_header_snapshots_check" CHECK ("orders"."internal_status" = 'DRAFT' or ("orders"."representative_erp_code_snapshot" is not null and "orders"."customer_erp_code_snapshot" is not null and "orders"."payment_term_erp_code_snapshot" is not null));
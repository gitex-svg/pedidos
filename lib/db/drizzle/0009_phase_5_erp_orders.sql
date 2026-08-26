CREATE TYPE "public"."order_status_type" AS ENUM('INTERNAL', 'ERP');
--> statement-breakpoint
CREATE TYPE "public"."order_status_source" AS ENUM('SYSTEM', 'REPRESENTATIVE', 'ERP', 'ADMIN');
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "erp_import_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "erp_last_status_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "product_erp_id_snapshot" varchar(128);
--> statement-breakpoint
UPDATE "order_items" SET "product_erp_id_snapshot" = "products"."erp_id"
FROM "products" WHERE "order_items"."product_id" = "products"."id";
--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "product_erp_id_snapshot" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE "order_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "status_type" "order_status_type" NOT NULL,
  "previous_status" varchar(32),
  "new_status" varchar(32) NOT NULL,
  "source" "order_status_source" NOT NULL,
  "correlation_id" uuid,
  "source_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk"
FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_erp_import_id_unique" ON "orders" USING btree ("erp_import_id");
--> statement-breakpoint
CREATE INDEX "orders_submitted_queue_idx" ON "orders" USING btree ("internal_status","erp_synced_at","submitted_at","id");
--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at","id");
--> statement-breakpoint
CREATE INDEX "order_status_history_correlation_idx" ON "order_status_history" USING btree ("correlation_id");
--> statement-breakpoint
INSERT INTO "order_status_history" (
  "order_id", "status_type", "previous_status", "new_status", "source", "created_at"
)
SELECT "id", 'INTERNAL', 'DRAFT', 'SUBMITTED', 'SYSTEM', COALESCE("submitted_at", "updated_at")
FROM "orders"
WHERE "internal_status" = 'SUBMITTED';
CREATE TYPE "public"."price_type" AS ENUM('STANDARD', 'REPRESENTATIVE', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "price_table_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_table_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_price" numeric(18, 6) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"erp_code" varchar(64) NOT NULL,
	"price_type" "price_type" NOT NULL,
	"representative_id" uuid,
	"customer_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"source_updated_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_tables_erp_code_unique" UNIQUE("erp_code"),
	CONSTRAINT "price_tables_scope_check" CHECK ((
      ("price_tables"."price_type" = 'STANDARD' AND "price_tables"."representative_id" IS NULL AND "price_tables"."customer_id" IS NULL)
      OR ("price_tables"."price_type" = 'REPRESENTATIVE' AND "price_tables"."representative_id" IS NOT NULL AND "price_tables"."customer_id" IS NULL)
      OR ("price_tables"."price_type" = 'CUSTOMER' AND "price_tables"."representative_id" IS NULL AND "price_tables"."customer_id" IS NOT NULL)
    ))
);
--> statement-breakpoint
ALTER TABLE "price_table_items" ADD CONSTRAINT "price_table_items_price_table_id_price_tables_id_fk" FOREIGN KEY ("price_table_id") REFERENCES "public"."price_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_table_items" ADD CONSTRAINT "price_table_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tables" ADD CONSTRAINT "price_tables_representative_id_representatives_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tables" ADD CONSTRAINT "price_tables_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_table_items_table_product_unique" ON "price_table_items" USING btree ("price_table_id","product_id");--> statement-breakpoint
CREATE INDEX "price_table_items_table_active_idx" ON "price_table_items" USING btree ("price_table_id","active");--> statement-breakpoint
CREATE INDEX "price_table_items_product_active_idx" ON "price_table_items" USING btree ("product_id","active");--> statement-breakpoint
CREATE INDEX "price_tables_type_active_validity_idx" ON "price_tables" USING btree ("price_type","active","valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "price_tables_representative_active_idx" ON "price_tables" USING btree ("representative_id","active");--> statement-breakpoint
CREATE INDEX "price_tables_customer_active_idx" ON "price_tables" USING btree ("customer_id","active");
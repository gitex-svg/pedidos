CREATE SEQUENCE IF NOT EXISTS "orders_internal_number_seq" AS bigint START WITH 1 INCREMENT BY 1;
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"group_code" varchar(2) NOT NULL,
	"type_code" varchar(2) NOT NULL,
	"product_code" varchar(4) NOT NULL,
	"reference_code" varchar(8) NOT NULL,
	"product_code_snapshot" varchar(64) NOT NULL,
	"description_snapshot" text NOT NULL,
	"packaging_snapshot" varchar(120),
	"width_snapshot" varchar(64),
	"color_snapshot" varchar(120),
	"quantity" numeric(18, 4) NOT NULL,
	"suggested_unit_price" numeric(18, 6) NOT NULL,
	"suggested_price_origin" "price_origin" NOT NULL,
	"suggested_price_table_id" uuid,
	"suggested_price_table_erp_code" varchar(64),
	"effective_unit_price" numeric(18, 6) NOT NULL,
	"effective_price_origin" "price_origin" NOT NULL,
	"is_special_price" boolean DEFAULT false NOT NULL,
	"special_unit_price" numeric(18, 6),
	"discount1" numeric(7, 4) NOT NULL,
	"discount2" numeric(7, 4) NOT NULL,
	"discount3" numeric(7, 4) NOT NULL,
	"discount4" numeric(7, 4) NOT NULL,
	"discounts_applied" boolean NOT NULL,
	"net_unit_price" numeric(18, 6) NOT NULL,
	"gross_total" numeric(20, 2) NOT NULL,
	"net_total" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive_check" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_special_check" CHECK (("order_items"."is_special_price" = false and "order_items"."special_unit_price" is null) or ("order_items"."is_special_price" = true and "order_items"."special_unit_price" > 0)),
	CONSTRAINT "order_items_discount_range_check" CHECK ("order_items"."discount1" between 0 and 100 and "order_items"."discount2" between 0 and 100 and "order_items"."discount3" between 0 and 100 and "order_items"."discount4" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"internal_number" bigint DEFAULT nextval('orders_internal_number_seq') NOT NULL,
	"representative_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_term_id" uuid NOT NULL,
	"carrier_id" uuid,
	"notes" text,
	"discount1" numeric(7, 4) DEFAULT '0' NOT NULL,
	"discount2" numeric(7, 4) DEFAULT '0' NOT NULL,
	"discount3" numeric(7, 4) DEFAULT '0' NOT NULL,
	"discount4" numeric(7, 4) DEFAULT '0' NOT NULL,
	"gross_total" numeric(20, 2) DEFAULT '0' NOT NULL,
	"net_total" numeric(20, 2) DEFAULT '0' NOT NULL,
	"internal_status" "internal_order_status" DEFAULT 'DRAFT' NOT NULL,
	"erp_status" "erp_status",
	"erp_order_number" varchar(128),
	"submitted_at" timestamp with time zone,
	"erp_synced_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_discount_range_check" CHECK ("orders"."discount1" between 0 and 100 and "orders"."discount2" between 0 and 100 and "orders"."discount3" between 0 and 100 and "orders"."discount4" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_suggested_price_table_id_price_tables_id_fk" FOREIGN KEY ("suggested_price_table_id") REFERENCES "public"."price_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_representative_id_representatives_id_fk" FOREIGN KEY ("representative_id") REFERENCES "public"."representatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_term_id_payment_terms_id_fk" FOREIGN KEY ("payment_term_id") REFERENCES "public"."payment_terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_internal_number_unique" ON "orders" USING btree ("internal_number");--> statement-breakpoint
CREATE INDEX "orders_representative_created_idx" ON "orders" USING btree ("representative_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_created_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_internal_status_created_idx" ON "orders" USING btree ("internal_status","created_at");
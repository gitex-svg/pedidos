CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "erp_code" varchar(64) NOT NULL UNIQUE,
  "representative_id" uuid NOT NULL REFERENCES "representatives"("id"),
  "cnpj_cpf" varchar(32), "corporate_name" varchar(200) NOT NULL, "trade_name" varchar(200),
  "city" varchar(120), "state" varchar(2), "active" boolean DEFAULT true NOT NULL,
  "source_updated_at" timestamp with time zone NOT NULL,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "erp_id" varchar(128) NOT NULL UNIQUE,
  "group_code" varchar(2) NOT NULL, "type_code" varchar(2) NOT NULL,
  "product_code" varchar(4) NOT NULL, "reference_code" varchar(8) NOT NULL,
  "code" varchar(64) NOT NULL, "description" text NOT NULL, "collection" varchar(120), "packaging" varchar(120), "width" varchar(64), "color" varchar(120),
  "active" boolean DEFAULT true NOT NULL, "source_updated_at" timestamp with time zone NOT NULL,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "erp_code" varchar(64) NOT NULL UNIQUE,
  "description" varchar(240) NOT NULL, "installments" integer, "active" boolean DEFAULT true NOT NULL,
  "source_updated_at" timestamp with time zone NOT NULL, "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carriers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "erp_code" varchar(64) NOT NULL UNIQUE,
  "name" varchar(200) NOT NULL, "tax_id" varchar(32), "active" boolean DEFAULT true NOT NULL,
  "source_updated_at" timestamp with time zone NOT NULL, "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "correlation_id" uuid NOT NULL,
  "entity" varchar(64) NOT NULL, "direction" "integration_direction" DEFAULT 'INBOUND' NOT NULL,
  "endpoint" varchar(200) NOT NULL, "method" varchar(10) NOT NULL, "entity_id" uuid, "external_id" varchar(128), "status" "integration_status" NOT NULL, "error_message" text, "received" integer DEFAULT 0 NOT NULL,
  "created_count" integer DEFAULT 0 NOT NULL, "updated_count" integer DEFAULT 0 NOT NULL,
  "ignored_count" integer DEFAULT 0 NOT NULL, "error_count" integer DEFAULT 0 NOT NULL,
  "error_details" jsonb, "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "representatives_name_idx" ON "representatives" ("name");
CREATE INDEX "customers_representative_idx" ON "customers" ("representative_id");
CREATE INDEX "customers_corporate_name_idx" ON "customers" ("corporate_name");
CREATE INDEX "customers_trade_name_idx" ON "customers" ("trade_name");
CREATE INDEX "customers_cnpj_cpf_idx" ON "customers" ("cnpj_cpf");
CREATE INDEX "products_code_idx" ON "products" ("code");
CREATE INDEX "products_description_idx" ON "products" ("description");
CREATE INDEX "products_identity_search_idx" ON "products" ("group_code", "type_code", "product_code", "reference_code");
CREATE INDEX "payment_terms_description_idx" ON "payment_terms" ("description");
CREATE INDEX "carriers_name_idx" ON "carriers" ("name");
CREATE INDEX "carriers_tax_id_idx" ON "carriers" ("tax_id");
CREATE INDEX "integration_logs_correlation_idx" ON "integration_logs" ("correlation_id");
CREATE INDEX "integration_logs_entity_created_idx" ON "integration_logs" ("entity", "created_at");
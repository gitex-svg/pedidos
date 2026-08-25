CREATE TYPE "public"."erp_status" AS ENUM('EM_ANALISE', 'APROVADO', 'FECHADO', 'FATURADO', 'REPROVADO');--> statement-breakpoint
CREATE TYPE "public"."integration_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('SUCCESS', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."internal_order_status" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."price_origin" AS ENUM('CUSTOMER', 'REPRESENTATIVE', 'STANDARD', 'SPECIAL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'REPRESENTATIVE');--> statement-breakpoint
CREATE TABLE "representatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"erp_code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320),
	"user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"source_updated_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "representatives_erp_code_unique" UNIQUE("erp_code"),
	CONSTRAINT "representatives_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'REPRESENTATIVE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "representatives" ADD CONSTRAINT "representatives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
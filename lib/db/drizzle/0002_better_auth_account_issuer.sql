ALTER TABLE "accounts" ADD COLUMN "issuer" text;
--> statement-breakpoint
UPDATE "accounts" SET "issuer" = 'local:credential';
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_issuer_account_id_unique"
ON "accounts" USING btree ("issuer", "account_id");
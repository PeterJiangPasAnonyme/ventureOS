CREATE TYPE "public"."doc_kind" AS ENUM('note', 'call', 'deck', 'scan', 'roadmap', 'ledger', 'dataset', 'upload');--> statement-breakpoint
CREATE TYPE "public"."metric_kind" AS ENUM('record', 'claim');--> statement-breakpoint
CREATE TABLE "dataset_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"sheet" text NOT NULL,
	"row_index" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"kind" "metric_kind" NOT NULL,
	"metric" text NOT NULL,
	"period" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text DEFAULT 'number' NOT NULL,
	"quote" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "doc_date" timestamp;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "date_precision" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "doc_kind" "doc_kind" DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "series" text;--> statement-breakpoint
ALTER TABLE "dataset_rows" ADD CONSTRAINT "dataset_rows_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_rows" ADD CONSTRAINT "dataset_rows_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_rows_document_idx" ON "dataset_rows" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "metrics_org_idx" ON "metrics" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chunks_text_idx" ON "chunks" USING gin (to_tsvector('english', "content"));--> statement-breakpoint
CREATE INDEX "documents_series_idx" ON "documents" USING btree ("org_id","series");
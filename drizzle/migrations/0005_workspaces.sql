CREATE TABLE "bar_workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'Cashier' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_membership_role_check" CHECK ("role" IN ('Owner', 'Admin', 'Manager', 'Cashier', 'Storekeeper')),
	CONSTRAINT "bar_membership_status_check" CHECK ("status" IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "bar_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"code_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_invitation_role_check" CHECK ("role" IN ('Admin', 'Manager', 'Cashier', 'Storekeeper'))
);
--> statement-breakpoint
CREATE TABLE "bar_terms_acceptance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bar_pin_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bar_audit_log" ADD COLUMN IF NOT EXISTS "actor_id" text;
--> statement-breakpoint
ALTER TABLE "bar_workspace" ADD CONSTRAINT "bar_workspace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_membership" ADD CONSTRAINT "bar_membership_workspace_id_bar_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."bar_workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_membership" ADD CONSTRAINT "bar_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_invitation" ADD CONSTRAINT "bar_invitation_workspace_id_bar_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."bar_workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_invitation" ADD CONSTRAINT "bar_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_invitation" ADD CONSTRAINT "bar_invitation_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_terms_acceptance" ADD CONSTRAINT "bar_terms_acceptance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_pin_attempt" ADD CONSTRAINT "bar_pin_attempt_workspace_id_bar_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."bar_workspace"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bar_pin_attempt" ADD CONSTRAINT "bar_pin_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "bar_workspace_owner_idx" ON "bar_workspace" USING btree ("owner_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bar_membership_workspace_user_idx" ON "bar_membership" USING btree ("workspace_id","user_id");
--> statement-breakpoint
CREATE INDEX "bar_membership_user_idx" ON "bar_membership" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bar_invitation_code_idx" ON "bar_invitation" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX "bar_invitation_workspace_email_idx" ON "bar_invitation" USING btree ("workspace_id","email");
--> statement-breakpoint
CREATE UNIQUE INDEX "bar_terms_user_version_idx" ON "bar_terms_acceptance" USING btree ("user_id","version");
--> statement-breakpoint
CREATE INDEX "bar_pin_attempt_user_time_idx" ON "bar_pin_attempt" USING btree ("user_id","attempted_at");

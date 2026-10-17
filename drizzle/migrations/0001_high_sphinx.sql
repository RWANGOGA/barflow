CREATE TABLE "bar_admin_bootstrap_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"target_email" text NOT NULL,
	"consumed_by" text NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);

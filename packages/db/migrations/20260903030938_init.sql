CREATE TABLE `post` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`permissions` text DEFAULT '["read"]' NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT `fk_api_keys_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `application_settings` (
	`id` text PRIMARY KEY,
	`setup_completed_at` integer,
	`setup_completed_by_user_id` text,
	`initial_workspace_id` text,
	`maintenance_mode` integer DEFAULT false NOT NULL,
	`signup_enabled` integer DEFAULT true NOT NULL,
	`announcement_message` text,
	`announcement_tone` text DEFAULT 'info' NOT NULL,
	`allowed_email_domains` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_application_settings_setup_completed_by_user_id_user_id_fk` FOREIGN KEY (`setup_completed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_application_settings_initial_workspace_id_workspace_id_fk` FOREIGN KEY (`initial_workspace_id`) REFERENCES `workspace`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `billing_plan` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text,
	`interval` text DEFAULT 'month' NOT NULL,
	`amount_in_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `billing_plan_limit` (
	`id` text PRIMARY KEY,
	`plan_id` text NOT NULL,
	`key` text NOT NULL,
	`value` integer,
	`period` text DEFAULT 'month' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_billing_plan_limit_plan_id_billing_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `billing_plan`(`id`) ON DELETE CASCADE,
	CONSTRAINT `billing_plan_limit_plan_key_unique` UNIQUE(`plan_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `usage_meter` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text,
	`aggregation` text DEFAULT 'sum' NOT NULL,
	`unit` text DEFAULT 'count' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL UNIQUE,
	`theme` text DEFAULT 'system' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`email_notifications` integer DEFAULT true NOT NULL,
	`push_notifications` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_user_preferences_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `waitlist_entry` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`source` text DEFAULT 'landing' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`message` text,
	`referral_code` text,
	`reviewed_by_user_id` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_waitlist_entry_reviewed_by_user_id_user_id_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT `waitlist_entry_email_source_unique` UNIQUE(`email`,`source`)
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`owner_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_workspace_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workspace_invite_allowlist` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_workspace_invite_allowlist_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_invite_allowlist_invited_by_user_id_user_id_fk` FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `workspace_invite_allowlist_workspace_email_unique` UNIQUE(`workspace_id`,`email`)
);
--> statement-breakpoint
CREATE TABLE `workspace_membership` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_workspace_membership_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_membership_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `workspace_membership_workspace_user_unique` UNIQUE(`workspace_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `workspace_subscription` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL CONSTRAINT `workspace_subscription_workspace_unique` UNIQUE,
	`plan_id` text,
	`status` text DEFAULT 'free' NOT NULL,
	`provider` text DEFAULT 'manual' NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_workspace_subscription_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_subscription_plan_id_billing_plan_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `billing_plan`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_usage_rollup` (
	`id` text PRIMARY KEY,
	`workspace_id` text NOT NULL,
	`meter_id` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	CONSTRAINT `fk_workspace_usage_rollup_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_workspace_usage_rollup_meter_id_usage_meter_id_fk` FOREIGN KEY (`meter_id`) REFERENCES `usage_meter`(`id`) ON DELETE CASCADE,
	CONSTRAINT `workspace_usage_rollup_workspace_meter_period_unique` UNIQUE(`workspace_id`,`meter_id`,`period_start`,`period_end`)
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer NOT NULL,
	`image` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);

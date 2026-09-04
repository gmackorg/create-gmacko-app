CREATE TABLE `rate_limit_window` (
	`key` text PRIMARY KEY,
	`scope` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_window_expires_at_idx` ON `rate_limit_window` (`expires_at`);
CREATE TABLE `stripe_webhook_event` (
	`event_id` text PRIMARY KEY,
	`type` text NOT NULL,
	`received_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `stripe_webhook_event_received_at_idx` ON `stripe_webhook_event` (`received_at`);
CREATE TABLE `device_code` (
	`id` text PRIMARY KEY,
	`device_code` text NOT NULL UNIQUE,
	`user_code` text NOT NULL UNIQUE,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`status` text NOT NULL,
	`last_polled_at` integer,
	`polling_interval` integer,
	`client_id` text,
	`scope` text,
	CONSTRAINT `fk_device_code_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);

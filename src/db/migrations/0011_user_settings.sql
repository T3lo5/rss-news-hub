-- Per-user settings (self-service config: AI providers, Telegram, email,
-- newsletter, digest). Each row is a JSON blob keyed by area; secret fields
-- are encrypted at rest (see services/secrets.js).
CREATE TABLE `user_settings` (
	`user_id` text NOT NULL,
	`area` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	PRIMARY KEY (`user_id`, `area`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `user_settings_user_idx` ON `user_settings` (`user_id`);
--> statement-breakpoint
-- Add user_id to feeds so each user can have their own RSS feeds
ALTER TABLE `feeds` ADD COLUMN `user_id` text;
--> statement-breakpoint
-- Add user_id to telegram_queue for per-user message ownership
ALTER TABLE `telegram_queue` ADD COLUMN `user_id` text;
--> statement-breakpoint
CREATE INDEX `feeds_user_idx` ON `feeds` (`user_id`);
--> statement-breakpoint
CREATE INDEX `telegram_queue_user_idx` ON `telegram_queue` (`user_id`);

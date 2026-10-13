CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`news_id` text NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`source` text NOT NULL,
	`bookmarked_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`news_id`) REFERENCES `news_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bookmarks_news_idx` ON `bookmarks` (`news_id`);--> statement-breakpoint
CREATE TABLE `feed_cache` (
	`feed_id` text PRIMARY KEY NOT NULL,
	`etag` text,
	`last_modified` text,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feed_stats` (
	`feed_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_fetch` integer,
	`last_success` integer,
	`last_status` text,
	`last_error` text,
	`successful_fetches` integer DEFAULT 0 NOT NULL,
	`failed_fetches` integer DEFAULT 0 NOT NULL,
	`items_fetched` integer DEFAULT 0 NOT NULL,
	`items_new` integer DEFAULT 0 NOT NULL,
	`items_duplicate` integer DEFAULT 0 NOT NULL,
	`etag_hits` integer DEFAULT 0 NOT NULL,
	`latencies` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`category` text DEFAULT 'General' NOT NULL,
	`etag` text,
	`last_modified` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_url_unique` ON `feeds` (`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_url_idx` ON `feeds` (`url`);--> statement-breakpoint
CREATE INDEX `feeds_enabled_idx` ON `feeds` (`enabled`);--> statement-breakpoint
CREATE TABLE `global_stats` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`total_fetches` integer DEFAULT 0 NOT NULL,
	`total_items` integer DEFAULT 0 NOT NULL,
	`total_errors` integer DEFAULT 0 NOT NULL,
	`last_full_fetch` integer,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `news_hashes` (
	`hash` text PRIMARY KEY NOT NULL,
	`news_id` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`news_id`) REFERENCES `news_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `news_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`source` text NOT NULL,
	`pub_date` integer NOT NULL,
	`description` text,
	`content` text,
	`relevance_score` integer,
	`feed_id` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_items_link_unique` ON `news_items` (`link`);--> statement-breakpoint
CREATE UNIQUE INDEX `news_items_link_idx` ON `news_items` (`link`);--> statement-breakpoint
CREATE INDEX `news_items_pub_date_idx` ON `news_items` (`pub_date`);--> statement-breakpoint
CREATE INDEX `news_items_relevance_idx` ON `news_items` (`relevance_score`);--> statement-breakpoint
CREATE INDEX `news_items_feed_idx` ON `news_items` (`feed_id`);--> statement-breakpoint
CREATE TABLE `newsletter_history` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`success` integer NOT NULL,
	`item_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`content_preview` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `newsletter_history_timestamp_idx` ON `newsletter_history` (`timestamp`);--> statement-breakpoint
CREATE TABLE `telegram_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`parse_mode` text DEFAULT 'Markdown' NOT NULL,
	`scheduled_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`options` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE INDEX `telegram_queue_status_idx` ON `telegram_queue` (`status`);--> statement-breakpoint
CREATE INDEX `telegram_queue_scheduled_idx` ON `telegram_queue` (`scheduled_at`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`system_prompt` text NOT NULL,
	`variables` text DEFAULT '[]' NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`preferred_sources` text DEFAULT '[]' NOT NULL,
	`excluded_keywords` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`api_key` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_api_key_unique` ON `users` (`api_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_api_key_idx` ON `users` (`api_key`);
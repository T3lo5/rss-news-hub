PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `news_items_new` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`link` text NOT NULL,
	`source` text NOT NULL,
	`pub_date` integer NOT NULL,
	`description` text,
	`content` text,
	`relevance_score` integer,
	`feed_id` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `news_items_new` (`id`, `title`, `link`, `source`, `pub_date`, `description`, `content`, `relevance_score`, `feed_id`, `created_at`, `updated_at`) SELECT `id`, `title`, `link`, `source`, `pub_date`, `description`, `content`, `relevance_score`, `feed_id`, `created_at`, `updated_at` FROM `news_items`;
--> statement-breakpoint
DROP TABLE `news_items`;
--> statement-breakpoint
ALTER TABLE `news_items_new` RENAME TO `news_items`;
--> statement-breakpoint
CREATE UNIQUE INDEX `news_items_link_unique` ON `news_items` (`link`);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_items_link_idx` ON `news_items` (`link`);
--> statement-breakpoint
CREATE INDEX `news_items_pub_date_idx` ON `news_items` (`pub_date`);
--> statement-breakpoint
CREATE INDEX `news_items_relevance_idx` ON `news_items` (`relevance_score`);
--> statement-breakpoint
CREATE INDEX `news_items_feed_idx` ON `news_items` (`feed_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;

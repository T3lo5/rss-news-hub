PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_news_hashes` (
	`hash` text PRIMARY KEY NOT NULL,
	`news_id` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_news_hashes`("hash", "news_id", "created_at") SELECT "hash", "news_id", "created_at" FROM `news_hashes`;--> statement-breakpoint
DROP TABLE `news_hashes`;--> statement-breakpoint
ALTER TABLE `__new_news_hashes` RENAME TO `news_hashes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
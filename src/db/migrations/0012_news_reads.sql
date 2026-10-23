-- Per-user read state for the news list (read/unread triage).
-- A row means "this user read this item"; unmarking deletes the row, so the
-- table only grows with what was actually opened and "unread" costs nothing.
CREATE TABLE `news_reads` (
	`user_id` text NOT NULL,
	`news_id` text NOT NULL,
	`read_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	PRIMARY KEY (`user_id`, `news_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`news_id`) REFERENCES `news_items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `news_reads_news_idx` ON `news_reads` (`news_id`);

-- Step 1: Add user_id column (nullable, no FK constraint via ALTER TABLE)
ALTER TABLE `bookmarks` ADD COLUMN `user_id` text;
--> statement-breakpoint
-- Step 2: Update existing bookmarks to belong to the first admin user (or 'default')
UPDATE `bookmarks` SET `user_id` = (SELECT id FROM `users` WHERE role = 'admin' LIMIT 1);
--> statement-breakpoint
-- Step 3: For any remaining NULL user_id, set to 'default' (will be fixed on next login)
UPDATE `bookmarks` SET `user_id` = 'default' WHERE `user_id` IS NULL;
--> statement-breakpoint
-- Step 4: Create indexes
CREATE INDEX `bookmarks_user_idx` ON `bookmarks` (`user_id`);
--> statement-breakpoint
DROP INDEX `bookmarks_news_idx`;
--> statement-breakpoint
CREATE INDEX `bookmarks_user_news_idx` ON `bookmarks` (`user_id`, `news_id`);
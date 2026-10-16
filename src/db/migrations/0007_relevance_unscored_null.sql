-- Reset never-scored items to NULL.
-- New rows used to be written with relevance_score = 0 while findUnscored()
-- only matches IS NULL, so the scorer never found anything and every badge
-- stayed at 0. NULL is the "unscored" sentinel; 0 is a legitimate score.
UPDATE news_items SET relevance_score = NULL WHERE relevance_score = 0;

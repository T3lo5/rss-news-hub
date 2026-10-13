-- Create FTS5 virtual table for full-text search on news items
CREATE VIRTUAL TABLE news_search USING fts5(
  id UNINDEXED,
  title,
  content,
  source,
  content=news_items,
  content_rowid=rowid
);--> statement-breakpoint

-- Create triggers to keep FTS table in sync
CREATE TRIGGER news_items_ai AFTER INSERT ON news_items BEGIN
  INSERT INTO news_search(rowid, id, title, content, source) VALUES (new.rowid, new.id, new.title, new.content, new.source);
END;--> statement-breakpoint

CREATE TRIGGER news_items_ad AFTER DELETE ON news_items BEGIN
  INSERT INTO news_search(news_search, rowid, id, title, content, source) VALUES ('delete', old.rowid, old.id, old.title, old.content, old.source);
END;--> statement-breakpoint

CREATE TRIGGER news_items_au AFTER UPDATE ON news_items BEGIN
  INSERT INTO news_search(news_search, rowid, id, title, content, source) VALUES ('delete', old.rowid, old.id, old.title, old.content, old.source);
  INSERT INTO news_search(rowid, id, title, content, source) VALUES (new.rowid, new.id, new.title, new.content, new.source);
END;--> statement-breakpoint

-- Populate existing data
INSERT INTO news_search(rowid, id, title, content, source) SELECT rowid, id, title, content, source FROM news_items;
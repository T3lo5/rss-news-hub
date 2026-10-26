-- A busca passou a rodar pelo índice, mas ele cobria só título/conteúdo/fonte:
-- um termo que existisse apenas na descrição só era achado pelo fallback de
-- substring. Reconstrói a tabela FTS com a coluna description e os triggers
-- correspondentes. O mapeamento de colunas do FTS5 de conteúdo externo é por
-- nome, então news_items.description passa a ser lido direto da tabela.
DROP TRIGGER news_items_ai;--> statement-breakpoint
DROP TRIGGER news_items_ad;--> statement-breakpoint
DROP TRIGGER news_items_au;--> statement-breakpoint
DROP TABLE news_search;--> statement-breakpoint
CREATE VIRTUAL TABLE news_search USING fts5(
  id UNINDEXED,
  title,
  content,
  description,
  source,
  content=news_items,
  content_rowid=rowid
);--> statement-breakpoint
CREATE TRIGGER news_items_ai AFTER INSERT ON news_items BEGIN
  INSERT INTO news_search(rowid, id, title, content, description, source) VALUES (new.rowid, new.id, new.title, new.content, new.description, new.source);
END;--> statement-breakpoint
CREATE TRIGGER news_items_ad AFTER DELETE ON news_items BEGIN
  INSERT INTO news_search(news_search, rowid, id, title, content, description, source) VALUES ('delete', old.rowid, old.id, old.title, old.content, old.description, old.source);
END;--> statement-breakpoint
CREATE TRIGGER news_items_au AFTER UPDATE ON news_items BEGIN
  INSERT INTO news_search(news_search, rowid, id, title, content, description, source) VALUES ('delete', old.rowid, old.id, old.title, old.content, old.description, old.source);
  INSERT INTO news_search(rowid, id, title, content, description, source) VALUES (new.rowid, new.id, new.title, new.content, new.description, new.source);
END;--> statement-breakpoint
INSERT INTO news_search(rowid, id, title, content, description, source) SELECT rowid, id, title, content, description, source FROM news_items;
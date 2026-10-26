import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { ensureSearchIndex, newsRepository, searchHasMatch } from '../src/db/repositories/index.js';
import type { NewNewsItem } from '../src/db/schema.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

async function registerUser(email: string): Promise<string> {
  const res = await request('POST', '/api/auth/register', {
    email,
    password: 'senha12345',
    name: 'FTS Test',
  });
  assert.strictEqual(res.status, 201, res.raw);
  return res.json.data.accessToken;
}

const BASE = Date.UTC(2026, 9, 20, 12, 0, 0);

function buildItem(index: number, overrides: Partial<NewNewsItem> = {}): NewNewsItem {
  return {
    id: `fts-${index}`,
    title: `Artigo ${index}`,
    link: `https://example.com/fts/${index}`,
    source: 'Fonte A',
    description: `descrição ${index}`,
    pubDate: new Date(BASE + index * 60_000),
    ...overrides,
  };
}

/** Insere direto no repositório: os triggers da migração indexam sozinhos. */
async function seed(items: NewNewsItem[]): Promise<void> {
  for (const item of items) {
    await newsRepository.create(item);
  }
}

async function list(token: string, query: string) {
  const res = await request('GET', `/api/news?${query}`, undefined, bearer(token));
  assert.strictEqual(res.status, 200, res.raw);
  return { body: res.json.data, headers: res.headers };
}

/**
 * Remove a linha do índice sem tocar na notícia — é o estado de uma base
 * defasada (base anterior aos triggers ou rebuild interrompido) e é o que
 * força o caminho legado de instr().
 */
function removeFromIndex(id: string): void {
  const sqlite = (getTestDb() as any).$client;
  const row = sqlite
    .prepare(
      'SELECT rowid AS rid, id, title, content, description, source FROM news_items WHERE id = ?'
    )
    .get(id);
  assert.ok(row, `notícia ${id} existe`);
  sqlite
    .prepare(
      `INSERT INTO news_search(news_search, rowid, id, title, content, description, source)
       VALUES('delete', ?, ?, ?, ?, ?, ?)`
    )
    .run(row.rid, row.id, row.title, row.content, row.description, row.source);
}

describe('GET /api/news search via FTS index', () => {
  let token: string;

  beforeEach(async () => {
    resetTestDb();
    getTestDb();
    token = await registerUser(`fts-${Date.now()}@test.com`);
  });

  test('matches title, content and prefix, case/diacritic-insensitive', async () => {
    await seed([
      buildItem(1, { title: 'Vacina aplicada em idosos' }),
      buildItem(2, { content: 'efeitos adversos raros relatados' }),
      buildItem(3, { title: 'Política fiscal', source: 'Fonte B' }),
    ]);

    const title = await list(token, 'q=vacina');
    assert.strictEqual(title.body.total, 1);
    assert.strictEqual(title.body.results[0].id, 'fts-1');

    // Conteúdo é coberto pelo índice, mas não pelo filtro legado de instr().
    const content = await list(token, 'q=adversos');
    assert.strictEqual(content.body.total, 1);
    assert.strictEqual(content.body.results[0].id, 'fts-2');

    // Prefixo: "vacin" casa com "Vacina".
    const prefix = await list(token, 'q=vacin');
    assert.strictEqual(prefix.body.total, 1);
    assert.strictEqual(prefix.body.results[0].id, 'fts-1');

    // Caixa e acento não importam (o tokenizer normaliza).
    const upper = await list(token, 'q=IDOSOS');
    assert.strictEqual(upper.body.total, 1);
    assert.strictEqual(upper.body.results[0].id, 'fts-1');
  });

  test('query with no FTS match falls back to the legacy substring filter', async () => {
    await seed([buildItem(1, { title: 'substringonly marcador raro' })]);
    removeFromIndex('fts-1');
    assert.strictEqual(await searchHasMatch('substringonly'), false, 'índice sem a entrada');

    const res = await list(token, 'q=substringonly');
    assert.strictEqual(res.body.total, 1);
    assert.strictEqual(res.body.results[0].id, 'fts-1');
  });

  test('term that only exists in the description is found by the index', async () => {
    await seed([
      buildItem(1, {
        title: 'Noticia sem o termo',
        description: 'relato exclusivo no resumo da materia',
        content: 'corpo da materia sem o termo',
      }),
      buildItem(2, { title: 'Outra noticia' }),
    ]);

    const res = await list(token, 'q=exclusivo');
    assert.strictEqual(res.body.total, 1);
    assert.strictEqual(res.body.results[0].id, 'fts-1');
  });

  test('pagination, counts and source facets stay correct over FTS matches', async () => {
    await seed([
      buildItem(1, { title: 'aprovacao do plano' }),
      buildItem(2, { title: 'aprovacao do orcamento', source: 'Fonte B' }),
      buildItem(3, { title: 'aprovacao da lei' }),
      buildItem(4, { title: 'noticia sem relacao' }),
    ]);

    const page = await list(token, 'q=aprovacao&limit=2&offset=1');
    assert.strictEqual(page.body.total, 3);
    assert.strictEqual(page.body.results.length, 2, 'limit 2 sobre 3 matches');
    assert.deepStrictEqual(
      page.body.results.map((n: { id: string }) => n.id),
      ['fts-2', 'fts-1'],
      'ordenado por data, offset 1 descarta o mais recente'
    );
    assert.strictEqual(page.body.counts.all, 3);
    assert.deepStrictEqual(page.body.sources, ['Fonte A', 'Fonte B']);

    const filtered = await list(token, 'q=aprovacao&source=Fonte%20B');
    assert.strictEqual(filtered.body.total, 1);
    assert.strictEqual(filtered.body.results[0].id, 'fts-2');
  });

  test('read filter still applies on top of FTS matches', async () => {
    await seed([
      buildItem(1, { title: 'reuniao do conselho' }),
      buildItem(2, { title: 'reuniao do senado' }),
    ]);

    const mark = await request('PATCH', '/api/news/fts-1/read', { read: true }, bearer(token));
    assert.strictEqual(mark.status, 200, mark.raw);

    const unread = await list(token, 'q=reuniao&read=unread');
    assert.strictEqual(unread.body.total, 1);
    assert.strictEqual(unread.body.results[0].id, 'fts-2');
    assert.strictEqual(unread.body.counts.unread, 1);
    assert.strictEqual(unread.body.counts.read, 1);
  });

  test('index follows writes and pruning through the schema triggers', async () => {
    assert.strictEqual(await searchHasMatch('orçamento'), false);

    await seed([buildItem(1, { title: 'orcamento 2027' })]);
    assert.strictEqual(await searchHasMatch('orcamento'), true, 'trigger de INSERT indexa');

    await newsRepository.delete('fts-1');
    assert.strictEqual(await searchHasMatch('orcamento'), false, 'trigger de DELETE limpa');
  });

  test('ensureSearchIndex reconciles a stale index like the boot backfill', async () => {
    await seed([buildItem(1, { title: 'backfill pendente' })]);
    assert.strictEqual(await searchHasMatch('backfill'), true);

    // Simula índice velho: tira a entrada de só um lado, sem tocar na notícia.
    removeFromIndex('fts-1');

    assert.strictEqual(await searchHasMatch('backfill'), false, 'índice defasado');

    await ensureSearchIndex();
    assert.strictEqual(await searchHasMatch('backfill'), true, 'boot reconcilia');
  });
});

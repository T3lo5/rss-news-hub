# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added
- Busca full-text com SQLite FTS5 (`/api/news/search`)
- Sistema de códigos de erro estruturados (60+ codes)
- Digest automático "Best News" com agendamento cron
- OpenAPI/Swagger spec em `/openapi.json` + UI em `/docs`
- Biome para lint/format (substitui oxlint + prettier)
- CLI de plugins (`plugin:list/install/enable/disable/create/remove/status`)
- Rate limiting por usuário/API key (além de IP)

### Changed
- Migração de JSON files para SQLite + Drizzle ORM
- Autenticação JWT + API Keys com roles (admin/user/viewer)
- Hot reload de plugins via `config/plugins.yaml`
- Docker multi-stage build (frontend → public/)

### Fixed
- Race conditions no scheduler de feeds
- Memory leaks no Telegram queue worker
- Validação Zod v4 compatível

## [1.0.0] - 2026-10-12

### Added
- **Core**: RSS fetcher regex-based (RSS 2.0 + Atom)
- **IA**: Multi-provider (SenseNova → DeepSeek → OpenAI fallback)
- **Geração**: Threads, resumos, LinkedIn, blog, newsletter
- **Telegram**: Envio, agendamento, fila, worker, inline keyboards
- **Auth**: JWT (access/refresh) + API Keys (Argon2 hash)
- **Templates**: Sistema de prompts customizáveis com variáveis
- **Scoring**: Relevância 0-100 baseada em perfil de interesse
- **Feeds**: CRUD, health check, OPML import/export, teste individual
- **Frontend**: React + Vite dashboard (notícias, feeds, IA, Telegram, templates)
- **Plugins**: Sistema extensível (ai-provider, fetcher, output, transformer)
- **10 Built-ins**: openai, deepseek, sensenova, rss-fetcher, telegram, discord, slack, pii-redactor, summarizer, translator
- **Scheduler**: Coleta automática configurável + newsletter cron
- **Deduplicação**: Hash de conteúdo + FTS5 search index
- **Tests**: 402 testes (Node.js --test)
- **TypeScript**: Strict mode, 0 erros
- **Docker**: Compose + multi-stage Dockerfile + healthcheck

---

## Template para Novas Versões

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Nova funcionalidade

### Changed
- Mudança em funcionalidade existente

### Deprecated
- Funcionalidade que será removida

### Removed
- Funcionalidade removida

### Fixed
- Correção de bug

### Security
- Correção de vulnerabilidade
```
# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added
- Tela **Configurações** (admin) no frontend para gerenciar chaves de IA e
  credenciais do Telegram sem editar `.env`
- Endpoints administrativos `GET /api/settings`, `PUT /api/settings/ai`,
  `PUT /api/settings/telegram` e `GET /api/ai/providers`
- Armazenamento de settings no banco (`app_settings`, migração `0009`) com
  **cifragem AES-256-GCM** dos segredos (`SETTINGS_ENCRYPTION_KEY`, fallback
  `JWT_SECRET`); segredos nunca são devolvidos em texto puro pela API
- Configuração de newsletter e digest agora **persiste** (antes vivia apenas em
  memória e resetava a cada reinício)
- Tela **Digest** (admin) para agendar o "Best News", ajustar filtros
  (janela, relevância mínima, máximo de itens, provedor, formato, idioma),
  **pré-visualizar** o conteúdo e **enviar agora** — o envio manual funciona
  mesmo com o agendamento desligado
- Endpoints do digest documentados no OpenAPI
- Tela **Montar Newsletter** (Toolbar) para criar uma newsletter própria:
  selecionar notícias manualmente e/ou filtrar por fontes, com busca, idioma,
  provedor, template e variáveis; inclui prévia, copiar e enviar pelo Telegram
- **Envio por e-mail (SMTP)** via nodemailer: seção E-mail nas Configurações
  (host, porta, TLS, usuário, senha cifrada, remetente e destinatários padrão),
  endpoints `PUT /api/settings/email`, `POST /api/email/send` e
  `POST /api/email/test`, botão "Enviar por e-mail" no Montar Newsletter e
  opção "enviar também por e-mail" na newsletter agendada e no digest

### Fixed
- Corrida em `userProfileRepository.get()` que podia falhar com
  "UNIQUE constraint failed: user_profiles.id" quando duas execuções (ex.:
  digest agendado + scoring de relevância) criavam o perfil padrão ao mesmo tempo
- `POST /api/ai/generate` (e `/api/ai/generate/stream`) agora aceitam **lista**
  de notícias: antes um array era renderizado como "Title: undefined",
  quebrando a geração de newsletter com múltiplos itens

## [1.1.0] - 2026-10-16

### Added
- Busca full-text com SQLite FTS5 (`/api/news/search`)
- Sistema de códigos de erro estruturados (60+ codes)
- Digest automático "Best News" com agendamento cron
- OpenAPI/Swagger spec em `/openapi.json` + UI em `/docs`
- Biome para lint/format (substitui oxlint + prettier)
- CLI de plugins (`plugin:list/install/enable/disable/create/remove/status`)
- Rate limiting por usuário/API key (além de IP)
- Sessão longa: refresh token em cookie **HttpOnly** (escopo `/api/auth`),
  com rotação a cada renovação e `POST /api/auth/logout`
- Renovação automática do access token no frontend (refresh silencioso no 401)
- Resiliência de rede (`services/net.js`): retry com backoff para falhas
  transitórias (DNS/conexão) em feeds, IA e Telegram
- Fallback de provedores de IA em runtime no modo `auto` (SenseNova → DeepSeek → OpenAI)
- Reenvio de conteúdo já gerado por notícia (persistido em localStorage)
- Migrações `0007` (relevance unscored = NULL) e `0008` (bookmarks por usuário)
- Script `start-dev.sh` que sobe o backend e só então o frontend

### Changed
- Tokens: access `1h` / refresh `30d` (antes `15m` / `7d`)
- Telegram: `splitMessage` divide mensagens longas (limite seguro de 4000 chars),
  converte CommonMark `**bold**` → `*bold*` e faz fallback para texto puro
- Cap do texto em `/api/telegram/send` elevado para 100000 (split no servidor)
- Bookmarks passam a ser por usuário; endpoints de feeds/bookmarks exigem role
  e/ou usuário autenticado, com delete de feed em cascata
- Prompt do LinkedIn retorna apenas o post final (com o link original)
- Migração de JSON files para SQLite + Drizzle ORM
- Autenticação JWT + API Keys com roles (admin/user/viewer)
- Hot reload de plugins via `config/plugins.yaml`
- Docker multi-stage build (frontend → public/)

### Fixed
- `.gitignore` com comentários inline não aplicava regras sensíveis
  (`data/`, `public/`, `.env`, `*.pem`, `*.key`)
- Posts do LinkedIn não vazam mais seções editoriais (`stripEditorialMeta`)
- Erros de rede transitórios não derrubam o processo nem poluem os logs
- Envio no Telegram não trava mais e cai para texto puro se as entidades quebrarem
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
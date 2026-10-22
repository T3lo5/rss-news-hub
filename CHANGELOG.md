# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added
- **CI/CD da `main` para a instância** (`.github/workflows/deploy.yml` +
  `deploy/deploy.sh`): push na `main` roda testes/typecheck/lint, builda a
  imagem `linux/amd64`, publica no GHCR com o SHA do commit e espera a
  aprovação do environment `production`; o deploy na instância faz backup
  antes de trocar a imagem, espera o healthcheck por até 120 s e volta a
  imagem anterior se o container não ficar saudável. A chave usada é dedicada
  e restrita por `command=` no `authorized_keys` — não abre shell, só executa
  o `deploy.sh`, que valida o SHA recebido
- **Conjunto padrão de 27 fontes RSS** (`deploy/feeds-default.opml`, com
  categorias): cada URL testada (status, tipo, itens e data do post mais
  recente) e importável pelo Gerenciador de Feeds. Entram oficiais de baixo
  volume (TypeScript, React, Node.js, Rust, Go, Python), engenharia (Martin
  Fowler, Netflix TechBlog, Cloudflare, Docker), curadoria (Lobsters),
  segurança (Krebs on Security, CISA), IA prática (Simon Willison, GitHub
  Changelog) e PT-BR (Tecnoblog). Vue fica fora porque o RSS morreu em 2024
- **Backup diário do banco** (`deploy/backup.sh` + timer do systemd): snapshot
  online via `.backup()` do better-sqlite3 (consistente mesmo com o app rodando
  em WAL mode), verificação com `PRAGMA integrity_check` e retenção de 7
  diários + 4 semanais; o `README.md` documenta o restore testado
- **Backup offsite na OCI** (`deploy/setup-offsite.sh`): rclone contra o Object
  Storage (S3 compatível) com usuário IAM dedicado e policy restrita a um
  bucket; o upload roda depois do snapshot local (falha de rede não compromete
  o backup local), a retenção remota é por idade, e o `.env.prod` vai cifrado
- **Deploy de produção na OCI** (`deploy/`): stack Docker Compose com Caddy
  (TLS automático via Let's Encrypt, bloqueio de `POST /api/auth/register`,
  cache de assets e HTTP/3 desligado) e app sem porta publicada; `provision.sh`
  gera o `.env.prod` com segredos na própria máquina, `setup-instance.sh`
  prepara uma instância nova, e o `README.md` traz medições, operação e as
  armadilhas já resolvidas
- **Seletor de idioma (PT/EN)** no cabeçalho: a escolha é salva por usuário no
  banco e aplicada na hora; infraestrutura de i18n no frontend
  (`frontend/src/i18n/`) com dicionários `pt`/`en` (≈516 chaves cada) e hook
  `useI18n()`, cobrindo todas as telas e modais da interface
- **Idioma por usuário**: cada conta guarda sua preferência (`pt`/`en`) no banco
  (migração `0010_user_language`), exposta em `GET/PUT /api/auth/me`
- Endpoint público **`GET /api/health`** (uptime, versão, banco, estados dos
  schedulers, provedores configurados) e uma seção **Sistema** nas Estatísticas;
  o healthcheck do Docker passa a usá-lo em vez da página HTML
- **Retenção de notícias**: as Configurações ganham a seção *Manutenção* para
  manter apenas os últimos N dias (0 desliga) e limpar na hora; o job roda no
  boot e a cada 24h, com `GET/PUT /api/settings/retention` e `POST /api/news/prune`
  (admin) e fallback de `.env` via `NEWS_RETENTION_DAYS`
- Tela **Fila do Telegram** (admin/usuário) para ver as mensagens agendadas,
  cancelar, processar a fila manualmente e ligar/desligar o worker; os
  endpoints de fila/worker agora exigem autenticação (worker: admin)
- Tela **Usuários** (admin) para criar contas, definir o papel
  (admin/usuário/leitor), redefinir senha e excluir — com salvaguardas contra
  alterar o próprio papel ou excluir a si mesmo; endpoint `POST /api/users`
  (admin) e validação `updateUserSchema` para o `PUT /api/users/:id`
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
- **Teste de provedor de IA**: botão "Testar" em cada provedor nas Configurações
  e endpoint `POST /api/ai/test` (admin), além de os dropdowns de provedor
  passarem a usar `GET /api/ai/providers` e desabilitar os que não têm chave
- Tela **Montar Newsletter** (Toolbar) para criar uma newsletter própria:
  selecionar notícias manualmente e/ou filtrar por fontes, com busca, idioma,
  provedor, template e variáveis; inclui prévia, copiar e enviar pelo Telegram
- **Envio por e-mail (SMTP)** via nodemailer: seção E-mail nas Configurações
  (host, porta, TLS, usuário, senha cifrada, remetente e destinatários padrão),
  endpoints `PUT /api/settings/email`, `POST /api/email/send` e
  `POST /api/email/test`, botão "Enviar por e-mail" no Montar Newsletter e
  opção "enviar também por e-mail" na newsletter agendada e no digest

### Fixed
- **Lint do Biome zerado** (9 erros → 0): imports não usados, ordem de imports
  e formatação em `server.js`, `services/` e `test/user-settings-api.test.ts`,
  para o CI da `main` não quebrar
- **Import/export OPML não funcionava**: o parser de JSON consumia o corpo de
  todo POST/PUT, então o import multipart recebia o stream vazio e respondia
  "No file uploaded"; além disso `readFeedsConfig()`/`writeFeedsConfig()` são
  `async` e eram chamadas sem `await`, devolvendo Promise no lugar de array.
  O mock do teste agora é async, como o provider real
- **Rotas OPML sem autenticação**: `GET` e `POST /api/feeds/opml` eram as únicas
  rotas de feed sem `requireUser()`/`requireViewer()`, expostas no site público
- `.env.prod` não estava no `.gitignore`: o arquivo com `JWT_SECRET`, senhas e
  chaves de IA poderia ser commitado por engano. Agora `.env.prod` e
  `.env.caddy` são ignorados, e o template `.env.prod.example` continua
  versionável
- `PUT /api/auth/me` validava o corpo com o schema do **perfil de interesse**
  (`keywords`/`topics`), então alterar nome, e-mail ou idioma nunca funcionava
  (respondia 404); agora usa o schema correto do perfil do usuário
- Fila do Telegram: as rotas não davam `await` no repositório (a fila vinha
  sempre `{}` e cancelar sempre "dava certo"), e o status do worker reportava
  `queueLength: undefined`; agora os valores são corretos e a fila
- **`/api/users` inacessível**: o roteador só entregava caminhos `/api/auth/*`
  ao router de autenticação, então a gestão de usuários (que vive nele)
  respondia 404. Agora `/api/users` e `/api/users/:id` também são roteados
- Agendamento por **cron de verdade** para newsletter e digest: o digest usava um
  intervalo aproximado e ignorava horário/dia da semana (ex.: "Seg-Sex 9:00"
  rodava na hora e a cada 7 dias). Agora há um parser de cron completo
  (`services/cron.js`: ranges, steps, listas, nomes de mês/dia e a regra "ou"
  entre dia-do-mês e dia-da-semana) usado pelos dois jobs; cron inválido é
  rejeitado com 400 e a próxima execução aparece na UI (`GET /api/digest/status`)
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
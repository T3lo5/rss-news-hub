# RSS News Hub - Manual Completo de Instalação, Configuração e Uso

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-402%20passing-brightgreen.svg)](https://github.com/seu-usuario/rss-news-hub/actions)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://hub.docker.com/)
[![Biome](https://img.shields.io/badge/Lint-Biome-60a5fa.svg)](https://biomejs.dev/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **Sistema de agregação de notícias RSS + Geração de conteúdo por IA + Distribuição via Telegram**

---

## 📖 O que é este sistema?

O **RSS News Hub** é uma aplicação completa que:

1. **Coleta notícias** de feeds RSS configurados (sites de tecnologia, programação, etc.)
2. **Pontua cada notícia** (0-100) usando Inteligência Artificial baseada nos seus interesses
3. **Gera automaticamente** threads para Twitter/X, resumos, posts para LinkedIn ou newsletters
4. **Envia para o Telegram** (canal, grupo ou chat privado) no horário que você definir
5. **Oferece API REST** e interface web para gerenciar tudo

**Tudo roda localmente ou em servidor próprio** — seus dados não saem da sua infraestrutura.

---

## 🏗️ Arquitetura Resumida

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Feeds RSS  │────▶│  SQLite DB  │────▶│   IA Score  │────▶│  Telegram   │
│  (fontes)   │     │  (dados)    │     │  (relevância)│    │  (entrega)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │                    │                    │
                           ▼                    ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │  API REST   │     │  Geração    │     │  Agendador  │
                    │  + Web UI   │     │  (thread/   │     │  (cron)     │
                    │             │     │   summary/  │     │             │
                    └─────────────┘     │   linkedin) │     └─────────────┘
                                         └─────────────┘
```

**Tecnologias:**
- **Backend:** Node.js (ESM) + HTTP server nativo (sem framework)
- **Banco:** SQLite + Drizzle ORM (migrações automáticas)
- **IA:** SenseNova → DeepSeek → OpenAI (fallback automático)
- **Frontend:** React + Vite (build para `public/`, servido pelo backend)
- **Autenticação:** JWT + API Keys + Roles (admin/user/viewer)
- **Plugins:** Sistema extensível (AI providers, fetchers, outputs, transformers)

---

## 🚀 Instalação Rápida

### Pré-requisitos
- **Node.js 20+** (recomendado: LTS atual)
- **npm** (vem com Node.js)
- **Git** (opcional, para clonar)

### 1. Clone/baixe o projeto
```bash
git clone <repo-url> rss-news-hub
cd rss-news-hub
```

### 2. Instale dependências
```bash
npm install
cd frontend && npm install && cd ..
```

### 3. Configure variáveis de ambiente
```bash
cp .env.example .env
```

Edite o arquivo `.env` com **suas chaves** (veja seção "Chaves Necessárias" abaixo).

### 4. Build do frontend (opcional, mas recomendado)
```bash
npm run build:frontend
```

### 5. Inicie o servidor
```bash
npm start
```

Acesse: **http://localhost:3000**

---

## 🐳 Instalação com Docker (Produção)

```bash
# 1. Configure .env (obrigatório em produção)
cp .env.example .env
# Edite .env com suas chaves - JWT_SECRET É OBRIGATÓRIO!

# 2. Suba tudo
docker compose up --build -d
```

**O que acontece:**
- Container roda com `NODE_ENV=production`
- SQLite persiste no volume `rss-news-hub-data` (`/app/data`)
- Migrações rodam automaticamente no primeiro boot
- Healthcheck em `/health`

---

## 🔑 Chaves Necessárias (`.env`)

| Variável | Obrigatória? | Descrição | Onde obter |
|----------|--------------|-----------|------------|
| `JWT_SECRET` | **Sim (prod)** | Chave para assinar tokens JWT | `openssl rand -base64 48` |
| `TELEGRAM_BOT_TOKEN` | Não* | Token do bot Telegram | [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Não* | ID do chat/canal/grupo | Veja abaixo |
| `SENSENOVA_API_KEY` | Não** | Chave SenseNova | [SenseNova Console](https://cloud.sensenova.cn/) |
| `DEEPSEEK_API_KEY` | Não** | Chave DeepSeek | [DeepSeek Platform](https://platform.deepseek.com/) |
| `OPENAI_API_KEY` | Não** | Chave OpenAI | [OpenAI Platform](https://platform.openai.com/) |
| `PORT` | Não | Porta do servidor (padrão: 3000) | — |

\* **Telegram**: Necessário apenas para envio automático. Sem isso, o sistema funciona mas não entrega.
\** **IA**: Pelo menos **uma** das três é obrigatória para geração de conteúdo e scoring. Ordem de fallback: SenseNova → DeepSeek → OpenAI.

### Como obter `TELEGRAM_CHAT_ID`

1. Crie um bot no [@BotFather](https://t.me/BotFather) → `/newbot`
2. Copie o `TELEGRAM_BOT_TOKEN`
3. Adicione o bot ao seu canal/grupo como **administrador**
4. Descubra o Chat ID:
   - **Canal/Grupo**: `@username` (ex: `-1001234567890`)
   - **Chat privado**: envie `/start` para o bot, depois acesse: `https://api.telegram.org/bot<TOKEN>/getUpdates`
   - Procure por `"chat":{"id":-1001234567890,...}`

---

## ⚙️ Configuração Inicial (Pós-Instalação)

### 1. Acesse a interface web
```
http://localhost:3000
```

### 2. Crie o primeiro usuário (Admin)
- Clique em **"Registrar"**
- Preencha email, senha e nome
- O primeiro usuário vira **admin** automaticamente

### 3. Configure feeds RSS
Vá em **Feeds** → **Adicionar Feed**:
```
Nome: TechCrunch
URL: https://techcrunch.com/feed/
Categoria: Tech
Status: Ativo
```

**Feeds sugeridos para começar:**
| Nome | URL | Categoria |
|------|-----|-----------|
| TechCrunch | https://techcrunch.com/feed/ | Tech |
| The Verge | https://www.theverge.com/rss/index.xml | Tech |
| Ars Technica | https://feeds.arstechnica.com/arstechnica/index | Tech |
| Hacker News | https://hnrss.org/frontpage | Tech |
| dev.to | https://dev.to/feed | Dev |
| CSS-Tricks | https://css-tricks.com/feed/ | Dev |
| Smashing Magazine | https://www.smashingmagazine.com/feed/ | Dev |

### 4. Configure seu Perfil de Interesse (IA)
Vá em **IA** → **Perfil de Interesse**:

**Palavras-chave** (o que você quer ver):
```
AI, machine learning, LLM, GPT, open source, Rust, TypeScript, Kubernetes, cloud, DevOps, React, Next.js, Go, Python
```

**Tópicos**:
```
Artificial Intelligence, Software Engineering, Cloud Computing, Open Source, Developer Tools
```

**Fontes preferidas** (boost de score):
```
OpenAI Blog, Google DeepMind, Hugging Face Blog, GitHub Blog, Vercel Blog
```

**Palavras excluídas** (penaliza score):
```
crypto, blockchain, NFT, memecoin, gambling, betting
```

### 5. Teste a busca
```bash
# Via API
curl "http://localhost:3000/api/news/search?q=AI&minScore=70"

# Via Web: use a busca no topo da página
```

### 6. Teste geração de conteúdo
Vá em **IA** → **Gerar**, selecione uma notícia e escolha:
- **Thread** (Twitter/X)
- **Resumo**
- **LinkedIn**
- **Blog**
- **Newsletter**

---

## 📡 API REST Completa

Base URL: `http://localhost:3000`

### Autenticação
Todas as rotas `/api/*` (exceto `/health`, `/openapi.json`, `/docs`) exigem autenticação.

**Opção 1: Bearer Token (JWT)**
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"senha123"}'

# Use o accessToken retornado
curl http://localhost:3000/api/news \
  -H "Authorization: Bearer <accessToken>"
```

> **Sessão longa:** o access token expira em 1h, mas o refresh token (30 dias)
> fica em um cookie **HttpOnly** (`refresh_token`, escopo `/api/auth`), então o
> navegador o renova automaticamente sem novo login — inclusive após limpar o
> cache. O cookie nunca é acessível ao JavaScript. Em produção, defina
> `NODE_ENV=production` para o flag `Secure` (ou force com `COOKIE_SECURE=true`).

**Opção 2: API Key**
```bash
# Crie uma API Key na interface (Perfil → API Keys) ou via API
curl -X POST http://localhost:3000/api/auth/api-key \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"meu-script"}'

# Use a key retornada
curl http://localhost:3000/api/news \
  -H "Authorization: Bearer rsk_abc123..."
```

**Roles:**
- `admin`: Acesso total + gerenciamento de usuários
- `user`: Leitura/escrita de notícias, feeds, IA, Telegram, templates
- `viewer`: Apenas leitura

---

### Endpoints Principais

#### 🔐 Autenticação
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Registrar usuário |
| POST | `/api/auth/login` | Login (retorna access token + cookie de refresh) |
| POST | `/api/auth/refresh` | Renovar access token (lê o cookie HttpOnly) |
| POST | `/api/auth/logout` | Encerra a sessão (limpa o cookie de refresh) |
| GET | `/api/auth/me` | Perfil do usuário logado |
| PUT | `/api/auth/me` | Atualizar perfil |
| POST | `/api/auth/change-password` | Trocar senha |
| POST | `/api/auth/api-key` | Criar API Key |
| GET | `/api/auth/api-keys` | Listar API Keys |
| DELETE | `/api/auth/api-key/:id` | Revogar API Key |

#### 📰 Notícias
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/news` | Listar todas (paginado via DB; `readAt` é do usuário autenticado) |
| POST | `/api/news` | Adicionar manualmente |
| PATCH | `/api/news/:id/read` | Marcar/desmarcar como lida (`{ "read": true\|false }`, idempotente, viewer+) |
| POST | `/api/fetch` | Disparar coleta de todos os feeds |
| GET | `/api/news/search?q=termo&minScore=70&limit=20` | **Busca full-text (FTS5)** |
| GET | `/api/news/search/suggestions?q=termo` | Autocomplete |

#### 📡 Feeds RSS
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/feeds` | Listar feeds com stats |
| GET | `/api/feeds/health` | Health check de cada feed |
| POST | `/api/feeds` | Adicionar feed |
| PUT | `/api/feeds/:id` | Atualizar feed |
| DELETE | `/api/feeds/:id` | Remover feed |
| POST | `/api/feeds/:id/test` | Testar coleta de um feed |
| GET | `/api/feeds/opml` | Exportar OPML |
| POST | `/api/feeds/opml` | Importar OPML (multipart) |

#### 🤖 IA / Relevância
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/ai/profile` | Ver perfil de interesse |
| PUT | `/api/ai/profile` | Atualizar perfil |
| POST | `/api/ai/score` | Pontuar itens específicos |
| POST | `/api/ai/score-new` | Pontuar todos não-pontuados |
| POST | `/api/ai/generate` | Gerar conteúdo (thread/summary/linkedin) |
| POST | `/api/ai/generate/stream` | Gerar com streaming (SSE) |

#### 📱 Telegram
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/telegram/send` | Enviar agora |
| POST | `/api/telegram/schedule` | Agendar envio |
| GET | `/api/telegram/queue` | Ver fila agendada |
| DELETE | `/api/telegram/queue/:id` | Cancelar agendado |
| POST | `/api/telegram/queue/process` | Processar fila agora |
| GET/POST | `/api/telegram/worker/*` | Controlar worker |

#### 📋 Templates de Prompt
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/templates` | Listar templates |
| POST | `/api/templates` | Criar template |
| PUT | `/api/templates/:id` | Atualizar |
| DELETE | `/api/templates/:id` | Deletar |
| POST | `/api/templates/:id/test` | Testar com dados de exemplo |

#### 📰 Newsletter (Legado)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/newsletter/config` | Ver config |
| PUT | `/api/newsletter/config` | Atualizar config |
| POST | `/api/newsletter/trigger` | Gerar/enviar newsletter |
| GET | `/api/newsletter/history` | Histórico |

#### 🎯 Digest Automático (NOVO - Best News)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/digest/config` | Ver config do digest |
| PUT | `/api/digest/config` | Atualizar config (admin) |
| POST | `/api/digest/trigger` | Rodar digest agora (admin) |
| GET | `/api/digest/preview?lookbackDays=7&minRelevanceScore=75&format=thread` | Preview |
| POST | `/api/digest/start` | Ativar agendamento (admin) |
| POST | `/api/digest/stop` | Desativar agendamento (admin) |

**Configuração do Digest (`PUT /api/digest/config`):**
```json
{
  "enabled": true,
  "cron": "0 8 * * 1",
  "lookbackDays": 7,
  "minRelevanceScore": 70,
  "maxItems": 10,
  "provider": "auto",
  "format": "thread",
  "language": "pt"
}
```
- `cron`: Expressão cron (ex: `"0 8 * * 1"` = toda segunda às 8h)
- `format`: `"thread"` | `"summary"` | `"linkedin"`
- `language`: `"pt"` | `"en"`

#### 🔍 Sistema
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | Health check (sem auth) |
| GET | `/api/stats` | Estatísticas agregadas |
| GET | `/api/scheduler/status` | Status do agendador de feeds |
| POST | `/api/scheduler/trigger` | Disparar coleta manual |
| POST | `/api/scheduler/config` | Alterar intervalo (ms) |

---

## 🖥️ Interface Web (Dashboard)

Acesse `http://localhost:3000` após login:

### Abas principais:
1. **Notícias** - Lista com busca, filtro por score, categoria, data
2. **Feeds** - Gerenciar feeds RSS (CRUD + testar + OPML)
3. **IA** - Perfil de interesse, scoring, geração de conteúdo
4. **Telegram** - Enviar/agendar mensagens, ver fila, worker
5. **Templates** - Criar/editar prompts personalizados
6. **Digest** - Configurar e testar digest automático (admin)
7. **Estatísticas** - Métricas de coleta, erros, latência

### Atalhos de teclado
| Tecla | Ação |
|-------|------|
| `Ctrl/Cmd + K` | Abrir busca global |
| `Ctrl/Cmd + /` | Focar busca de notícias |
| `j` / `k` | Selecionar a próxima / anterior |
| `m` | Marcar/desmarcar a notícia selecionada como lida |
| `o` | Abrir a notícia selecionada |
| `?` | Mostrar ajuda de atalhos |

---

## 🛠️ CLI de Plugins

```bash
# Listar plugins instalados
npm run cli -- plugin:list

# Instalar de npm
npm run cli -- plugin:install @meu/plugin --save

# Criar scaffold
npm run cli -- plugin:create meu-plugin --type transformer

# Habilitar/Desabilitar
npm run cli -- plugin:enable meu-plugin
npm run cli -- plugin:disable meu-plugin

# Status detalhado
npm run cli -- plugin:status meu-plugin

# Remover
npm run cli -- plugin:remove meu-plugin --force
```

**Plugins built-in incluídos:**
| Tipo | Plugins |
|------|---------|
| `ai-provider` | `openai`, `deepseek`, `sensenova` |
| `fetcher` | `rss-fetcher` |
| `output` | `telegram`, `discord`, `slack` |
| `transformer` | `pii-redactor`, `summarizer`, `translator` |

Configuração em `config/plugins.yaml` (hot reload automático).

---

## 🔧 Scripts Disponíveis

```bash
npm start              # Inicia servidor (porta 3000)
npm run fetch          # Coleta única de todos os feeds (legado JSON)
npm test               # 402 testes (Node.js nativo)
npm run test:watch     # Testes em watch mode
npm run typecheck      # TypeScript strict check
npm run lint           # Biome lint
npm run lint:fix       # Biome lint + auto-fix
npm run format         # Biome format
npm run build:frontend # Build React → public/
npm run cli -- <cmd>   # CLI de plugins
npm run dev            # Dev: backend + frontend (concurrently)
```

---

## 📁 Estrutura de Arquivos

```
rss-news-hub/
├── .env                 # Suas chaves (NÃO commitar)
├── .env.example         # Template
├── server.js            # HTTP server + rotas + schedulers
├── server.config.js     # Carrega .env + config estática
├── package.json
├── biome.json           # Config Biome (lint/format)
├── docker-compose.yml   # Stack completa
├── Dockerfile           # Multi-stage build
├── README.md            # Este arquivo
├── AGENTS.md            # Guia para agentes de IA
├── config/
│   └── plugins.yaml     # Plugins habilitados/config
├── data/                # SQLite DB + arquivos legados (gitignored)
├── public/              # Frontend buildado (gitignored)
├── src/
│   ├── db/              # Drizzle + repositórios
│   │   ├── schema.ts    # Tabelas
│   │   ├── migrations/  # SQL migrações
│   │   └── repositories/
│   ├── plugins/         # Sistema de plugins
│   │   ├── builtin/     # 10 plugins nativos
│   │   └── ...
│   └── cli/             # CLI Commander.js
├── services/            # Lógica de negócio (JS ESM)
│   ├── ai.service.js
│   ├── fetch.service.js
│   ├── telegram.service.js
│   ├── relevance.service.js
│   ├── digest.service.js    # NOVO: Best News Digest
│   ├── errors.js            # NOVO: Códigos de erro
│   ├── openapi.js           # NOVO: OpenAPI spec
│   └── ...
├── routes/
│   └── auth.routes.js   # Rotas de auth
├── middleware/
│   └── auth.js          # JWT + API Key + Roles
├── scripts/
│   ├── fetch.js         # Coleta standalone (JSON)
│   └── migrate-json-to-db.ts
├── plugins/             # Plugins de usuário (exemplos)
│   ├── example-wordcount/
│   └── example-webhook-output/
├── frontend/            # React + Vite
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
└── test/                # 402 testes (Node.js --test)
```

---

## 🗄️ Banco de Dados (SQLite + Drizzle)

**Local:** `data/rss-news-hub.db` (volume Docker: `/app/data`)

**Tabelas principais:**
| Tabela | Descrição |
|--------|-----------|
| `feeds` | Feeds RSS configurados |
| `news_items` | Notícias coletadas |
| `news_search` | **FTS5** - Busca full-text |
| `users` | Usuários do sistema |
| `api_keys` | API Keys (hash Argon2) |
| `sessions` | Sessões JWT (refresh tokens) |
| `user_profiles` | Perfil de interesse (JSON) |
| `templates` | Templates de prompt |
| `telegram_queue` | Fila de mensagens agendadas |
| `feed_stats` | Métricas por feed |
| `news_hashes` | Deduplicação por hash de conteúdo |
| `bookmarks` | Favoritos do usuário |
| `newsletter_history` | Histórico de newsletters |
| `global_stats` | Contadores globais |

**Migrações:** Aplicadas automaticamente no boot via `getDb()`. Arquivos em `src/db/migrations/`.

---

## 🧪 Testes e Qualidade

```bash
# Todos os testes
npm test

# Testes específicos
node --import tsx --test test/auth-api.test.ts
node --import tsx --test test/feeds-api.test.ts

# Type check
npm run typecheck

# Lint
npm run lint
npm run lint:fix
```

---

## 🚀 Deploy em Produção

### Checklist pré-deploy
- [ ] `JWT_SECRET` forte no `.env` (`openssl rand -base64 48`)
- [ ] Pelo menos uma chave de IA configurada
- [ ] `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` se for usar Telegram
- [ ] `NODE_ENV=production` (docker-compose já define)
- [ ] Reverse proxy (Nginx/Caddy) com HTTPS
- [ ] Backup do volume `rss-news-hub-data`

### Docker Compose (Recomendado)
```bash
docker compose up --build -d
# Logs: docker compose logs -f app
# Parar: docker compose down
```

### Systemd (Bare metal)
```ini
# /etc/systemd/system/rss-news-hub.service
[Unit]
Description=RSS News Hub
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/rss-news-hub
Environment=NODE_ENV=production
EnvironmentFile=/opt/rss-news-hub/.env
ExecStart=/usr/bin/node --import tsx server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now rss-news-hub
journalctl -u rss-news-hub -f
```

---

## 🔒 Segurança

### Boas práticas
1. **Sempre use HTTPS** em produção (reverse proxy + Let's Encrypt)
2. **Gere `JWT_SECRET` forte** — 48+ bytes base64
3. **Rotacione API Keys** periodicamente
4. **Não exponha porta 3000** diretamente — use reverse proxy
5. **Mantenha dependências atualizadas** (`npm audit`)

### Rate Limiting (Built-in)
| Endpoint | Limite |
|----------|--------|
| `/api/auth/register` | 5 req/min/IP |
| `/api/auth/login` | 10 req/min/IP |
| `/api/auth/refresh` | 30 req/min/IP |
| `/api/ai/generate` | 10 req/min/user |
| `/api/telegram/send` | 5 req/min/user |
| `/api/fetch` | 2 req/min/IP |

---

## 🐛 Troubleshooting

### "JWT_SECRET is required in production"
```bash
# Gere uma chave forte
openssl rand -base64 48
# Cole no .env
JWT_SECRET=sua_chave_aqui
```

### "No AI provider configured"
Configure pelo menos uma: `SENSENOVA_API_KEY`, `DEEPSEEK_API_KEY` ou `OPENAI_API_KEY`.

### "Telegram not configured"
Adicione `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no `.env`.

### Erro de migração / banco corrompido
```bash
# Apague o banco (CUIDADO: perde dados)
rm data/rss-news-hub.db*
# Reinicie — migrações rodam automaticamente
npm start
```

### Feeds não coletam
1. Verifique `/api/feeds/health` — veja `lastError`
2. Teste um feed: `POST /api/feeds/:id/test`
3. Confira logs do servidor
4. Alguns feeds bloqueiam bots — tente `User-Agent` customizado no plugin `rss-fetcher`

### Busca não retorna resultados
```bash
# Reconstrua índice FTS5
curl -X POST http://localhost:3000/api/news/search/rebuild \
  -H "Authorization: Bearer <token>"
```

### Frontend não carrega
```bash
npm run build:frontend
# Verifique se public/index.html existe
```

---

## 📚 Referência Avançada

### Variáveis de Ambiente Completas
```bash
# Server
PORT=3000
NODE_ENV=production

# JWT (OBRIGATÓRIO em produção)
JWT_SECRET=base64_string_48_bytes

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=-1001234567890

# IA (pelo menos UMA)
SENSENOVA_API_KEY=sk-...
SENSENOVA_BASE_URL=https://token.sensenova.ai/v1
SENSENOVA_MODEL=sensenova-6.8-flash-lite

DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com
OPENAI_MODEL=gpt-4o-mini
```

### Estrutura de Resposta da API
```json
// Sucesso
{ "ok": true, "data": { ... } }

// Erro
{ "ok": false, "error": "Mensagem", "code": "ERR_FEED_NOT_FOUND", "details": [...] }
```

### Códigos de Erro Comuns
| Código | HTTP | Causa |
|--------|------|-------|
| `ERR_UNAUTHORIZED` | 401 | Token inválido/expirado |
| `ERR_FORBIDDEN` | 403 | Role insuficiente |
| `ERR_FEED_NOT_FOUND` | 404 | Feed inexistente |
| `ERR_VALIDATION_FAILED` | 400 | Body inválido |
| `ERR_AI_QUOTA_EXCEEDED` | 503 | Limite da API de IA |
| `ERR_FEED_FETCH_FAILED` | 502 | Erro ao buscar feed |
| `ERR_RATE_LIMITED` | 429 | Muitas requisições |

---

## 🤝 Contribuindo

1. Fork o repo
2. Crie branch: `git checkout -b feature/minha-feature`
3. Commit: `git commit -m "feat: minha feature"`
4. Push: `git push origin feature/minha-feature`
5. Abra Pull Request

**Padrões:**
- Commits: [Conventional Commits](https://www.conventionalcommits.org/)
- Lint: `npm run lint:fix` antes de commit
- Testes: `npm test` deve passar

---

## 📄 Licença

MIT License — veja arquivo `LICENSE`.

---

## 🆘 Suporte

- **Issues:** GitHub Issues do repositório
- **Docs técnicas:** `AGENTS.md` (para agentes de IA)
- **Plugin SDK:** `docs/plugin-sdk.md`
- **Planos/ADRs:** `docs/plans/`

---

## 🎯 Próximos Passos Sugeridos

1. **Configure seus feeds** favoritos em `/feeds`
2. **Ajuste o perfil de interesse** em `/ai/profile` — quanto melhor, melhor o scoring
3. **Teste geração** de thread/resumo em `/ai/generate`
4. **Ative o Digest** em `/api/digest/config` para receber as melhores notícias automaticamente no Telegram
5. **Crie templates** personalizados para seus casos de uso
6. **Explore plugins** — adicione Discord/Slack como output, ou crie seu próprio transformer

---

**🎉 Pronto! Seu RSS News Hub está rodando. Acesse http://localhost:3000 e comece a curar notícias inteligentes.**
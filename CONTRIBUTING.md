# Contributing to RSS News Hub

Obrigado por considerar contribuir! 🎉

## Como Contribuir

### Reportando Bugs
1. Verifique se já não existe uma [issue](https://github.com/seu-usuario/rss-news-hub/issues) para o bug
2. Crie uma nova issue com:
   - Descrição clara do problema
   - Passos para reproduzir
   - Comportamento esperado vs atual
   - Logs/stack traces relevantes
   - Versão do Node.js, OS, Docker (se aplicável)

### Sugerindo Features
1. Abra uma issue com label `enhancement`
2. Descreva o problema que a feature resolve
3. Explique a solução proposta
4. Considere impacto em compatibilidade

### Pull Requests

#### Antes de começar
```bash
# 1. Fork o repo
# 2. Clone seu fork
git clone https://github.com/seu-usuario/rss-news-hub.git
cd rss-news-hub

# 3. Crie branch descritiva
git checkout -b feat/nova-funcionalidade
# ou
git checkout -b fix/corrigir-bug-xyz
```

#### Padrões de código
```bash
# Instale deps
npm install
cd frontend && npm install && cd ..

# Verifique qualidade ANTES de commit
npm run lint:fix    # Biome auto-fix
npm run format      # Biome format
npm run typecheck   # TypeScript strict
npm test            # 402 testes devem passar
```

#### Commits
Use [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: adiciona busca full-text FTS5
fix: corrige race condition no scheduler
docs: atualiza README com Docker
refactor: extrai error codes para services/errors.js
test: adiciona testes para digest service
chore: atualiza dependências
```

#### Checklist do PR
- [ ] Testes passam (`npm test`)
- [ ] TypeScript sem erros (`npm run typecheck`)
- [ ] Lint limpo (`npm run lint`)
- [ ] Commits seguem Conventional Commits
- [ ] Documentação atualizada se necessário
- [ ] CHANGELOG.md atualizado (seção Unreleased)
- [ ] Sem segredos no código (`.env`, chaves, tokens)

### Estrutura de Branches
| Branch | Propósito |
|--------|-----------|
| `main` | Produção (protegida) |
| `develop` | Integração contínua |
| `feat/*` | Novas features |
| `fix/*` | Correções de bug |
| `docs/*` | Documentação |
| `refactor/*` | Refatoração |
| `chore/*` | Manutenção |

### Revisão de Código
- Mínimo 1 aprovação para merge
- CI deve passar (testes, lint, typecheck)
- Resolva todos os comentários antes de merge
- Squash commits no merge (preferencialmente)

---

## Setup de Desenvolvimento

### Local (Node.js)
```bash
npm run dev    # Backend + Frontend (concurrently)
# ou separadamente:
npm start      # Backend apenas
cd frontend && npm run dev  # Frontend apenas
```

### Com Docker
```bash
docker compose up --build
```

### Banco de Dados
```bash
# SQLite local em data/rss-news-hub.db
# Migrações rodam auto no boot
# Para resetar: rm data/rss-news-hub.db* && npm start
```

---

## Áreas que Precisam de Ajuda

- 🌐 **i18n** - Internacionalização (PT-BR/EN)
- ♿ **Acessibilidade** - Frontend (WCAG)
- 🧪 **Testes E2E** - Playwright/Cypress
- 📊 **Métricas** - Prometheus/Grafana dashboard
- 🔌 **Plugins** - Mais providers (Anthropic, Gemini, Ollama)
- 📱 **Mobile** - PWA / App nativo
- 🔍 **Busca** - MeiliSearch/Typesense integration

---

## Código de Conduta

Este projeto segue o [Contributor Covenant](https://www.contributor-covenant.org/). Veja [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Dúvidas?

- Abra uma [Discussion](https://github.com/seu-usuario/rss-news-hub/discussions)
- Ou uma issue com label `question`

Obrigado por contribuir! 🚀
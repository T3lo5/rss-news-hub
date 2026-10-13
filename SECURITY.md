# Política de Segurança

## Versões Suportadas

| Versão | Suportada |
|--------|-----------|
| 1.x.x  | ✅ Sim    |
| < 1.0  | ❌ Não    |

## Reportando Vulnerabilidades

**NÃO abra issue pública para vulnerabilidades de segurança.**

Envie um email para **security@rss-newshub.example.com** com:

1. Descrição da vulnerabilidade
2. Passos para reproduzir
3. Impacto potencial
4. Sugestão de correção (se tiver)

Responderemos em até 48 horas e trabalharemos na correção.

## Boas Práticas de Segurança

### Para Usuários
- **NUNCA** commite `.env` ou chaves reais
- Use `JWT_SECRET` forte em produção (`openssl rand -base64 48`)
- Mantenha dependências atualizadas (`npm audit`)
- Use HTTPS em produção (reverse proxy + Let's Encrypt)
- Rotacione API Keys periodicamente
- Não exponha porta 3000 diretamente na internet

### Para Desenvolvedores
- Valide toda entrada (Zod schemas em `services/validation.js`)
- Use prepared statements (Drizzle ORM previne SQL injection)
- Rate limiting implementado em endpoints sensíveis
- Senhas hasheadas com Argon2 (`@node-rs/argon2`)
- JWT com expiração curta (access) + refresh tokens
- API Keys hasheadas (não armazenadas em plain text)

## Endpoints Protegidos

| Endpoint | Auth | Rate Limit |
|----------|------|------------|
| `/api/auth/*` | JWT/API Key | IP-based |
| `/api/ai/generate` | User+ | 10/min/user |
| `/api/telegram/send` | User+ | 5/min/user |
| `/api/fetch` | Viewer+ | 2/min/IP |
| `/api/admin/*` | Admin | - |

## Dependências

- `npm audit` executado no CI
- `package-lock.json` commitado para builds reprodutíveis
- Dependências auditadas antes de release

## Divulgação Responsável

Agradecemos pesquisadores de segurança que seguem divulgação responsável. Créditos serão dados no changelog (se desejado).
# Deploy — RSS News Hub na OCI

Instância: `instance-20260701-0753` · `VM.Standard.E2.1.Micro` · Ubuntu 22.04 · `sa-saopaulo-1` · AD-1
IP público: `163.176.141.23` · SSH: `ssh -i ~/Downloads/ssh-key-2026-07-01.key ubuntu@163.176.141.23`

**Acesso:** <https://rssnewshub.duckdns.org> — login único do app.

## Arquitetura

```
internet ──► :443 (TLS, Let's Encrypt) ──┐
internet ──► :80  (301 → HTTPS)         ├──► Caddy ──► app:3000
internet ──► :5678 (301 → HTTPS)        ┘            (só rede interna do compose)
```

O app **não publica porta no host** — o único caminho é pelo Caddy.

## Segurança: por que não há Basic Auth

A primeira versão tinha Basic Auth na frente de tudo. Foi **removido** por dois motivos:

1. **Custo proibitivo nesta máquina.** Basic Auth não tem sessão: o Caddy verifica o hash
   bcrypt em *toda* requisição (asset, XHR, tudo). Com o custo padrão 14, nesta vCPU
   (1/8 de OCPU) isso dá **~2,8 s de CPU por requisição**. A página tem ~7 requisições,
   ou seja ~20 s. O navegador desistia, repetia, e as repetições caíam sem credencial —
   o resultado era o **popup de senha em loop**.
2. **Protegia uma rota só.** O app já exige JWT (`requireViewer` / `requireUser` /
   `requireAdmin`) em todas as rotas de dados, e `login`/`refresh`/`register` já têm
   rate limit próprio. A única rota pública que cria estado é `POST /api/auth/register`.

O que ficou no lugar:

| Regra | Onde | Efeito |
|---|---|---|
| `respond @register 403` | Caddy | ninguém cria conta; instantâneo, sem hash, sem banco |
| JWT em `/api/**` | app | todo dado exige login |
| rate limit em `auth/*` | app | freia força bruta no login |

Consequência: **uma senha só** (a do app). O Caddy não recebe o `.env.prod`, apenas
`DOMAIN` — as chaves de IA e o `JWT_SECRET` não existem no processo do proxy.

> Se algum dia for necessário religar Basic Auth, use **custo 10** e escape o `$` como `$$`
> no `env_file` (ver `.env.prod.example`). Não use o custo padrão 14 nesta instância.

### TLS

O Caddy emite e **renova** o certificado sozinho (ACME TLS-ALPN-01). Não há cron nem
`certbot`. Os certificados ficam no volume `caddy-data`; se ele for apagado, o Caddy emite
de novo no próximo start (há limite semanal do Let's Encrypt — não fique recriando o
volume à toa).

O DuckDNS é gratuito: o registro `A` de `rssnewshub.duckdns.org` aponta para
`163.176.141.23`. **Se o IP mudar** (não muda em stop/start, muda em recriação),
atualize no DuckDNS.

HTTP/3 está **desligado** (`protocols h1 h2`): a security list da OCI libera só TCP, e o
`Alt-Svc: h3` faria o navegador tentar QUIC em UDP 443 e esperar timeout a cada visita.

## Medições reais

| Recurso | Valor |
|---|---|
| App (idle) | ~75–143 MB RAM, ~0,1% CPU |
| Caddy | ~11–15 MB RAM, 0% CPU |
| Total da instância | ~383 MB de 956 MB usados |
| Swap | 2 GB |
| Disco | 37 GB livres |
| Imagem | 373 MB |
| Processamento por requisição (Caddy) | ~2,7 ms no HTML/assets |
| Carga da página inteira | ~1,4 s (incluindo TLS + latência de rede) |

## Arquivos

| Arquivo | Papel |
|---|---|
| `docker-compose.prod.yml` | app + caddy, limites de memória, healthcheck |
| `Caddyfile` | reverse proxy, TLS, bloqueio do register, cache de assets |
| `provision.sh` | gera `.env.prod` com segredos e importa chaves de API |
| `.env.prod.example` | template do arquivo de ambiente |
| `setup-instance.sh` | Docker CE + Compose v2 + swap + UFW (para instância nova) |

## Operação

```bash
cd /opt/rss-news-hub

# subir / atualizar
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# status
docker compose -f docker-compose.prod.yml --env-file .env.prod ps

# logs
docker logs -f rss-news-hub
docker logs -f rss-caddy

# recarregar o Caddy depois de editar o Caddyfile
docker compose -f docker-compose.prod.yml --env-file .env.prod restart caddy
```

> **Sempre passe `--env-file .env.prod`.** Sem isso o Compose tenta interpolar
> `JWT_SECRET` do ambiente do shell e aborta com
> "required variable JWT_SECRET is missing a value".

## Provisionar do zero

```bash
# na instância
sudo mkdir -p /opt/rss-news-hub && sudo chown "$USER" /opt/rss-news-hub
# copie docker-compose.prod.yml, Caddyfile, provision.sh e .env.prod.example

export ADMIN_EMAIL='voce@exemplo.com'          # obrigatório (sem default)
bash provision.sh /caminho/do/.env.de.dev rssnewshub.duckdns.org
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

`ADMIN_EMAIL` não tem valor padrão de propósito: não embutir e-mail pessoal no
repositório. O `provision.sh` imprime a senha do admin **uma única vez**.

## Atualizar a aplicação

O build acontece na máquina de desenvolvimento, não na instância (1 GB de RAM não compila
`better-sqlite3` + front com folga).

```bash
# no projeto, na máquina local
docker buildx build --platform linux/amd64 -t rss-news-hub:amd64 --load .
docker save rss-news-hub:amd64 | gzip > rss-news-hub-amd64.tar.gz
scp -i ~/Downloads/ssh-key-2026-07-01.key rss-news-hub-amd64.tar.gz ubuntu@163.176.141.23:/tmp/

# na instância
docker load -i /tmp/rss-news-hub-amd64.tar.gz
cd /opt/rss-news-hub
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Se a arquitetura mudar (E2.1.Micro é x86_64; A1.Flex é arm64), troque `IMAGE_TAG` no `.env.prod`.

## Armadilhas já resolvidas (não repita)

1. **`JWT_SECRET` vazio** — em `NODE_ENV=production` o app não sobe:
   `Error: JWT_SECRET is required in production`. O `.env` de dev tem `JWT_SECRET=` vazio;
   `provision.sh` gera os segredos **depois** de carregar o `.env` de dev, senão o `source`
   sobrescreve o valor gerado com string vazia.

2. **Basic Auth + bcrypt custo 14 nesta vCPU = popup em loop.** O sintoma parecia bug de
   autenticação (401 do Caddy em `/assets/*`, `/api/auth/login`, `/api/auth/me`), mas era
   timeout: cada verificação de hash custava ~2,8 s e o navegador repetia sem credencial.
   Diagnóstico: o campo `duration` no log de acesso do Caddy mostrava `2.768s` num 401 —
   401 do Caddy é instantâneo, então o tempo era bcrypt.

3. **Hash bcrypt no Compose** — se algum dia voltar a usar Basic Auth via `env_file`, cada
   `$` do hash precisa virar `$$`, senão o Compose interpola `$` + letra e trunca o hash.

4. **`env_file` longo** — a sintaxe `path:` / `required:` exige Compose >= 2.24. A instância
   tinha só o v1.29.2. O arquivo usa a sintaxe curta (funciona nos dois) e o Compose v2 foi
   instalado em `/usr/local/lib/docker/cli-plugins/docker-compose`.

5. **Site duplicado no Caddy** — dois blocos com o mesmo endereço dão
   `ambiguous site definition`. Por isso o bloco do domínio usa `{$DOMAIN:localhost}` e não
   repete `:443`/`:80`.

6. **Porta 3000** — não está publicada no host. Testar o app exige passar pelo Caddy ou
   `docker exec`.

7. **Portas fechadas no console** — a security list é independente do firewall da máquina.
   O Caddy escutar em `:443` não adianta se a regra de ingress não existir.

## Backup

O banco é SQLite em `/app/data/rss-news-hub.db` (volume `rss-data`, ~6 MB):

```bash
docker exec rss-news-hub sh -c \
  'sqlite3 /app/data/rss-news-hub.db ".backup /tmp/b.db" 2>/dev/null || cp /app/data/rss-news-hub.db /tmp/b.db'
docker cp rss-news-hub:/tmp/b.db ./rss-backup-$(date +%F).db
```

O `.env.prod` também precisa de backup — sem ele o `JWT_SECRET` e a senha do admin se perdem
(e o login para de funcionar para quem estava logado).

## Pendências

- [x] Liberar 80/443 na Security List do VCN `vcn-20260105-2125`
- [x] Domínio + TLS automático (`rssnewshub.duckdns.org`)
- [x] Trocar Basic Auth por bloqueio do register (performance + popup)
- [ ] Backup periódico do SQLite + do `.env.prod`

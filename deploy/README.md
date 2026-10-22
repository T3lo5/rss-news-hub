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
| `ALLOW_REGISTRATION=false` | app | a tela de login esconde o link "Criar conta" |
| JWT em `/api/**` | app | todo dado exige login |
| rate limit em `auth/*` | app | freia força bruta no login |

`GET /api/auth/config` (público) devolve `{ registrationEnabled }`, e a tela de login
usa isso para não oferecer um formulário que o proxy vai recusar com 403. O bloqueio
do Caddy continua sendo a garantia; a flag é só para a UI não mentir.

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
| `backup.sh` | snapshot SQLite consistente + retenção (diário/semanal) + upload offsite |
| `rss-backup.service` / `.timer` | agenda o `backup.sh` todo dia 03:30 UTC |
| `setup-offsite.sh` | configura o rclone para o bucket (executar uma vez, como `ubuntu`) |
| `feeds-default.opml` | conjunto curado de 27 fontes, importável pelo Gerenciador de Feeds |

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

O build acontece fora da instância, não nela (1 GB de RAM não compila
`better-sqlite3` + front com folga).

### Pelo CI/CD (caminho normal)

Push na `main` dispara `.github/workflows/deploy.yml`:

```
test + typecheck + lint
   -> build linux/amd64 -> ghcr.io/t3lo5/rss-news-hub:<sha>
   -> job "Deploy" espera APROVAÇÃO do environment `production`
   -> ssh ubuntu@instância "<sha>"
        -> /opt/rss-news-hub/deploy.sh
             1. backup.sh (snapshot antes de tocar no banco)
             2. docker pull
             3. troca IMAGE_TAG no .env.prod
             4. compose up -d app
             5. healthcheck (até 120 s)
             6. falhou? volta a imagem anterior e sai com código 1
```

Enquanto ninguém aprova, a produção não muda. Para disparar sem commit novo:
**Actions → Deploy → Run workflow**.

**Rollback:** Actions → run anterior → **Re-run all jobs**. A imagem é
reconstruída do mesmo commit e re-deployada. Para reverter só a aplicação, sem
passar pelo GitHub:

```bash
ssh -i ~/.ssh/rss-news-hub-deploy ubuntu@163.176.141.23 "<sha-antigo>"
```

O `deploy.sh` roda um backup **antes** de cada deploy porque as migrações do
banco rodam no boot: voltar a imagem não desfaz uma migração. O snapshot é a
saída de emergência.

### Chave de deploy e configuração no GitHub

A chave usada pelo Actions é dedicada (sem passphrase) e presa no
`~/.ssh/authorized_keys` por um comando forçado:

```
command="/opt/rss-news-hub/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... rss-news-hub-deploy
```

Ou seja: mesmo que a chave vaze, ela não abre shell — só executa o
`deploy.sh`, e o script valida que o argumento é um SHA em hex. O
`deploy.sh` fica em `/opt/rss-news-hub/deploy.sh` (root:root 0755) e usa um
`flock` para impedir dois deploys simultâneos.

O workflow depende de:

| Tipo | Nome | Conteúdo |
|---|---|---|
| secret | `DEPLOY_SSH_KEY` | chave privada ed25519 da deploy key |
| secret | `DEPLOY_KNOWN_HOSTS` | saída de `ssh-keyscan -t ed25519,ecdsa,rsa 163.176.141.23` |
| var | `DEPLOY_HOST` | `163.176.141.23` |
| var | `DEPLOY_USER` | `ubuntu` |

O environment `production` tem required reviewer: o deploy só anda depois do
clique em **Approve**.

### Manual (fallback, sem GitHub)

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

## Fontes padrão (feeds)

`feeds-default.opml` é o conjunto curado de 27 fontes, já com categorias
(`Dev`, `AI/ML`, `DevOps`, `Tech`, `Security`). O app importa e exporta OPML em
Gerenciador de Feeds → Importar OPML, ou direto:

```bash
TOKEN=$(curl -s -X POST https://rssnewshub.duckdns.org/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq -r .data.accessToken)

curl -X POST https://rssnewshub.duckdns.org/api/feeds/opml \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@deploy/feeds-default.opml"
```

A importação é idempotente por URL: rodar de novo só acrescenta o que falta.

Curadoria de 2026-10-22, com cada URL testada (status, tipo, itens e data do
post mais recente):

- **entram**: oficiais de baixo volume (TypeScript, React, Node.js, Rust, Go,
  Python), engenharia e arquitetura (Martin Fowler, Netflix TechBlog, Docker,
  Cloudflare), curadoria (Lobsters), segurança (Krebs on Security, CISA), IA
  prática (Simon Willison, GitHub Changelog) e uma PT-BR (Tecnoblog).
- **ficam de fora**: Vue (o RSS morreu em 2024 e não existe substituto),
  `news.ycombinator.com/rss` (devolve 419; o `hnrss.org/frontpage` cobre o
  mesmo conteúdo), Vercel e Supabase (1.693 e 439 itens de changelog), Techmeme
  (agregador de agregadores), Next.js/Svelte/Astro/Tailwind (stack específica) e
  Canaltech/Olhar Digital (redundantes com o Tecnoblog — três portais publicam
  a mesma matéria).

O parser pega no máximo **5 itens por feed por busca**
(`services/fetch.service.js`), então feed de alto volume não inunda o banco —
é o caso do arXiv, que sozinho tem 1.252 itens.

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

8. **OPML quebrado por três motivos ao mesmo tempo** — (a) o parser de JSON do topo do
   `server.js` consumia o corpo de *todo* POST/PUT, então o import multipart recebia o
   stream vazio e respondia sempre "No file uploaded"; (b) `readFeedsConfig()` e
   `writeFeedsConfig()` são `async` e eram chamadas sem `await` no `opml.service.js`;
   (c) as duas rotas OPML eram as únicas de feed sem `requireUser()`/`requireViewer()`.
   O mock do teste era síncrono, então escondia o `await` faltando — agora ele é async,
   como o provider real.

## Backup

### Camada 1 — local (ativa)

`backup.sh` + `rss-backup.timer` rodam todo dia às 03:30 UTC (00:30 em São
Paulo): snapshot online consistente, `integrity_check` e retenção de 7 diários
+ 4 semanais em `/opt/rss-news-hub/backups/`.

```bash
sudo systemctl start rss-backup.service     # rodar agora
journalctl -u rss-backup.service -n 20      # log da última execução
systemctl list-timers rss-backup.timer      # próximo agendado
```

**Por que não `cp`:** o app roda em WAL mode e o `-wal` fica no limiar do
auto-checkpoint (~4 MB). Copiar só o `.db` perde as transações que ainda estão
no WAL. O `.backup()` do better-sqlite3 tira um snapshot consistente com o app
rodando — e o script valida com `PRAGMA integrity_check` antes de gravar.

**Isso não protege contra perder a instância.** Serve para rollback rápido de
erro de aplicação: migração ruim, feed apagado, notícia removida por engano.

### Restaurar (testado)

```bash
cd /opt/rss-news-hub
docker compose -f docker-compose.prod.yml --env-file .env.prod stop app

# Atenção: o volume tem o prefixo do projeto -> rss-news-hub_rss-data
docker run --rm \
  -v rss-news-hub_rss-data:/data \
  -v /opt/rss-news-hub/backups:/backup:ro \
  alpine sh -c "
    gunzip -c /backup/daily/<arquivo>.db.gz > /data/rss-news-hub.db &&
    rm -f /data/rss-news-hub.db-wal /data/rss-news-hub.db-shm &&
    chown -R 1000:1000 /data
  "

docker compose -f docker-compose.prod.yml --env-file .env.prod start app
```

Os três detalhes que quebram um restore se esquecidos:

1. remover `-wal`/`-shm`, senão o WAL antigo é reaplicado sobre o banco restaurado;
2. `chown` da **pasta** também — o processo roda como `node` (uid 1000) e precisa
   criar `-wal`/`-shm`; sem isso o SQLite aborta com `SQLITE_READONLY_DIRECTORY`;
3. o volume chama `rss-news-hub_rss-data`, não `rss-data`.

### Camada 2 — offsite (OCI Object Storage)

Cópia fora da instância, para o caso de perder a máquina. Credencial de escopo
mínimo: um usuário IAM só para isso, com policy restrita a **um** bucket.

**No console (uma vez):**

1. Object Storage → Create Bucket: `rss-news-hub-backups`, private, região
   `sa-saopaulo-1`
2. Identity → Users → Create: `rss-backup`
3. Identity → Groups → Create: `rss-backup`; adicione o usuário
4. Identity → Policies → Create, no compartimento do bucket:

   ```
   Allow group rss-backup to read buckets in compartment <COMPARTIMENTO>
   Allow group rss-backup to manage objects in compartment <COMPARTIMENTO>
     where target.bucket.name = 'rss-news-hub-backups'
   ```

5. User `rss-backup` → Customer Secret Keys → Generate: guarde o par
   Access Key / Secret Key (o secret aparece **uma única vez**)

**Na instância:**

```bash
rclone version                 # já instalado (1.75.2)
cd /opt/rss-news-hub
bash setup-offsite.sh          # pergunta namespace/bucket/chaves; o secret fica oculto
```

O script grava `~/.config/rclone/rclone.conf` (600), cria `backup.env`, gera a
senha de cifra do `.env.prod` e testa leitura **e** escrita no bucket.

A partir daí cada execução do `rss-backup.service` copia o snapshot para
`daily/` (30 dias) e, aos domingos, também para `weekly/` (60 dias). A retenção
remota é por **idade**, não por contagem: se a máquina ficar dias desligada, os
backups antigos não são apagados por falta de novos.

`secrets/env-prod.enc` é o `.env.prod` cifrado (AES-256-CBC + PBKDF2) com a
senha de `/opt/rss-news-hub/.backup-passphrase`, que precisa estar no seu
gerenciador de senhas. Sem ela o arquivo não abre.

```bash
# conferir o que subiu
rclone lsf oci:rss-news-hub-backups/daily/
rclone lsf oci:rss-news-hub-backups/secrets/

# restaurar o .env.prod
rclone copyto oci:rss-news-hub-backups/secrets/env-prod.enc /tmp/env.enc
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in /tmp/env.enc -out /tmp/.env.prod \
  -pass file:/opt/rss-news-hub/.backup-passphrase

# baixar o banco e seguir a seção "Restaurar"
rclone copy oci:rss-news-hub-backups/daily/<arquivo>.db.gz /tmp/
```

Detalhe que morde: a OCI **não** aceita virtual-host style no S3 compatível.
Por isso o rclone usa `force_path_style = true`, com o namespace no host
(`https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com`).

### Segredos

O banco guarda o **hash** da senha do admin, não a senha — o backup do banco
não devolve a senha. O `.env.prod` vai cifrado para o bucket. Duas coisas
precisam estar no seu gerenciador de senhas, fora da máquina:

- a senha do admin (a que você usa para entrar)
- a senha de cifra do `.env.prod` (`/opt/rss-news-hub/.backup-passphrase`)

As chaves de IA também são recuperáveis nos painéis de cada provedor.

## Pendências

- [x] Liberar 80/443 na Security List do VCN `vcn-20260105-2125`
- [x] Domínio + TLS automático (`rssnewshub.duckdns.org`)
- [x] Trocar Basic Auth por bloqueio do register (performance + popup)
- [x] Backup local diário com retenção e restore testado
- [x] CI/CD: push na `main` -> testes -> imagem no GHCR -> deploy com aprovação manual
- [ ] Backup offsite: `setup-offsite.sh` pronto, falta criar bucket + credencial no console

# Plan 12: próximos lotes (Lote C + PWA)

> Estado em 22/10/2026, depois dos lotes A e B (`83c3a85`).
>
> Lote A: bugs de mobile/a11y (tabela de feeds em cards, menu em bottom sheet,
> `ALLOW_REGISTRATION`, contraste, alvos de toque).
> Lote B: hierarquia dos cards, relevância semântica, card clicável, 48 cards
> por vez, Configurações em abas.
>
> As frentes abaixo já estão abertas como issues. Este documento guarda o
> contexto e as decisões que não cabem no corpo de uma issue.

## Issues abertas

| # | Issue | Tipo | Tamanho |
|---|---|---|---|
| [#2](https://github.com/T3lo5/rss-news-hub/issues/2) | Marcar lida/não lida + filtro | produto | médio |
| [#3](https://github.com/T3lo5/rss-news-hub/issues/3) | Leitor interno | produto | pequeno |
| [#4](https://github.com/T3lo5/rss-news-hub/issues/4) | Paginação e busca no servidor | perf | médio |
| [#5](https://github.com/T3lo5/rss-news-hub/issues/5) | PWA instalável + offline | plataforma | médio |
| [#6](https://github.com/T3lo5/rss-news-hub/issues/6) | Scheduler não pontua artigos novos | bug | pequeno |

## Ordem sugerida

1. **#6** — é bug e é barato; sem score, o Lote B fica pela metade nos itens novos.
2. **#2** — maior ganho de uso diário (triagem), mas mexe em schema.
3. **#5 fase 1** — manifest + ícones + meta: um dia de trabalho, efeito imediato
   no celular.
4. **#3** — leitor interno em cima do estado de "lida" (abrir não deve
   necessariamente marcar como lida; decidir junto com #2).
5. **#4** — só quando o volume incomodar (ou quando a retenção começar a
   acumular histórico).
6. **#5 fases 2–4** — service worker e offline depois que o produto estabilizar.

## Decisões de produto já tomadas

- O card abre a notícia no site (stretched link). O leitor interno (#3) entra
  como opção, não como padrão.
- "Abrir" é a ação primária do card; "Compartilhar" é secundária. Não voltar
  atrás sem motivo.
- Relevância é indicador, não ranking obrigatório: itens sem score continuam
  aparecendo, só sem o número.
- A lista mostra 48 por vez (#4 troca o recorte client-side por paginação real).

## PWA — plano técnico

O app já tem o que é pré-requisito: HTTPS (Caddy), layout responsivo e SPA
servida pelo próprio Node. Falta o pacote de instalação e cache.

### Fase 1 — instalável (issue #5)

- `manifest.webmanifest` com `display: "standalone"`, `start_url: "/"`,
  `scope: "/"`, `theme_color`/`background_color` coerentes com os dois temas.
- Ícones PNG 192/512 + maskable 512, gerados do `public/favicon.svg`, e
  `apple-touch-icon` 180.
- Meta no `frontend/index.html` (manifest, `theme-color`, `apple-mobile-web-app-*`).
- Conferir o MIME `.webmanifest` no servidor estático (hoje o mapa de extensões
  em `server.js` provavelmente não conhece).

### Fase 2 — service worker

- `public/sw.js` escrito à mão (sem Workbox): menos dependência e o build já é
  hasheado pelo Vite.
- Precache do shell com versão amarrada ao build (injetar o SHA do commit no
  build, não usar data).
- Estratégias:
  - assets hashed (`/assets/*`): cache-first, imutáveis;
  - navegação: network-first com fallback ao shell cacheado;
  - `/api/*` e qualquer não-GET: **network-only**, nunca cachear (tem JWT e
    dados privados).
- Ativação: apagar caches de versões antigas; `skipWaiting` com aviso
  "Nova versão disponível — recarregar" (não recarregar sozinho).

### Fase 3 — offline útil

- Guardar a última lista de notícias em IndexedDB (chave = versão + usuário) e
  mostrar em modo leitura quando `navigator.onLine === false`, com
  "última atualização há X".
- **Cuidado com o boot offline**: o `AuthContext` tenta `/api/auth/me` e o
  refresh; sem rede isso cai no login. Precisa de um caminho "usuário cacheado
  + offline" que abra o shell em leitura, sem fingir sessão válida para escrita.
- Banner de offline; ações de escrita (bookmark, compartilhar, configurar)
  desabilitadas com explicação.

### Fase 4 — instalação

- `beforeinstallprompt` → botão "Instalar app" no menu do usuário.
- iOS não expõe o evento: mostrar instruções (Compartilhar → Adicionar à Tela
  de Início) no mesmo lugar.
- Esconder tudo quando `matchMedia('(display-mode: standalone)')` casar.

### Riscos

- Service worker + deploy frequente = shell velho. A versão do cache precisa
  mudar a cada build, senão o usuário fica preso na versão anterior.
- Cachear resposta de API "sem querer" vaza dados entre contas no mesmo
  dispositivo — por isso a regra é network-only, sem exceção.
- iOS tem limite de storage e não respeita todos os eventos; testar em aparelho
  real, não só no Chrome DevTools.

## Fora de escopo por enquanto

- App nativo / lojas.
- Push notifications (exigiria VAPID + backend de subscriptions).
- Extração de texto completo no leitor interno (#3 cobre o conteúdo do RSS).
- Multiusuário com papéis além do que já existe (admin/viewer).

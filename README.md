# YouTube MCP — Node.js

## English

### Overview

This branch is a Node.js remake of the standalone YouTube MCP server. It provides structured access to YouTube through Piped without directly interacting with `youtube.com`, without an official YouTube API key, and without controlling a browser.

> **AI-generated software disclaimer**
>
> This project was fully created with the assistance of artificial intelligence (AI), including its source code, documentation, configuration, and project structure. It has been reviewed and tested to the extent described in this repository, but users should independently review the code and verify that it meets their security, reliability, and legal requirements.

### Architecture and features

The server dynamically downloads TeamPiped's official public-instance list, parses and deduplicates API URLs, derives the hosted frontend for each listed instance, health-checks them, prefers healthy CDN instances with low latency and few failures, and automatically fails over when a backend fails. It keeps state and caches in memory. Playback URLs use the selected instance's hosted frontend and a correctly encoded `instance` parameter.

The project uses the official `@modelcontextprotocol/sdk` JavaScript SDK. Browser automation is outside the MCP boundary: there are no Playwright, Selenium, CDP, browser profiles, or browser-launching dependencies.

### Requirements and installation

Node.js 20 or newer is recommended:

```bash
npm install
```

### Running and configuration

Run the default local stdio server:

```bash
npm start
```

Environment variables:

| Variable | Default |
|---|---|
| `YOUTUBE_MCP_HOST` | `127.0.0.1` |
| `YOUTUBE_MCP_PORT` | `8083` |
| `YOUTUBE_MCP_TRANSPORT` | `stdio` |
| `YOUTUBE_MCP_INSTANCE_LIST_URL` | TeamPiped official raw Markdown URL |
| `YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES` | `30` |
| `YOUTUBE_MCP_HEALTH_CHECK_MINUTES` | `5` |
| `YOUTUBE_MCP_TIMEOUT_SECONDS` | `10` |

For Streamable HTTP, use `YOUTUBE_MCP_TRANSPORT=streamable-http`; the MCP endpoint is `/mcp`. The default configuration intentionally binds locally.

### MCP tools

* `youtube_search(query, filter, limit)` searches through Piped and returns concise result metadata.
* `youtube_video(video_id)` retrieves metadata and normalized video/audio streams from `/streams/{video_id}`.
* `youtube_play(video_id, autoplay, listen, quality, sponsorblock)` returns a browser-ready URL and never launches a browser.

Errors are returned as structured MCP error content with `error` and `retryable` fields. Temporary backend failures are retryable; unavailable videos are non-retryable when the backend returns HTTP 404.

### Development and testing

```bash
npm test
npm run check
```

The tests use mocked HTTP responses and cover TeamPiped parsing, deduplication, invalid entries, health checks, CDN-aware selection, failover, search/video/stream normalization, URL encoding, and configuration. Before production use, perform a live integration check in an environment with outbound HTTPS. Public Piped instances can become unavailable or rate-limit requests.

### Security and scope

No credentials, cookies, tokens, arbitrary shell execution, filesystem tools, or YouTube account access are included. The application only needs outbound HTTPS to the TeamPiped list, public Piped APIs, and the Piped frontend. No software license is included in this repository.

---

## Português (Brasil)

### Visão geral

Esta branch é uma reimplementação em Node.js do servidor MCP independente para YouTube. Ela oferece acesso estruturado ao YouTube por meio do Piped sem interagir diretamente com `youtube.com`, sem chave oficial da API do YouTube e sem controlar um navegador.

> **Aviso sobre software gerado por IA**
>
> Este projeto foi criado integralmente com o auxílio de inteligência artificial (IA), incluindo o código-fonte, a documentação, as configurações e a estrutura do projeto. O projeto foi revisado e testado conforme descrito neste repositório, mas os usuários devem analisar o código por conta própria e verificar se ele atende aos seus requisitos de segurança, confiabilidade e aspectos legais.

### Arquitetura e recursos

O servidor baixa dinamicamente a lista oficial de instâncias públicas do TeamPiped, analisa e remove URLs duplicadas, verifica a saúde, prefere instâncias CDN saudáveis com baixa latência e poucas falhas e executa failover automático quando um backend falha. O estado e os caches ficam em memória. Os links de reprodução usam o frontend `https://piped.video` e um parâmetro `instance` corretamente codificado.

O projeto usa o SDK oficial `@modelcontextprotocol/sdk` para JavaScript. A automação de navegador fica fora do limite do MCP: não há Playwright, Selenium, CDP, perfis de navegador ou dependências para iniciar navegadores.

### Requisitos e instalação

Recomenda-se Node.js 20 ou mais recente:

```bash
npm install
```

### Execução e configuração

Execute o servidor local stdio padrão:

```bash
npm start
```

As variáveis de ambiente são equivalentes às listadas na seção em inglês: host `127.0.0.1`, porta `8083`, transporte `stdio`, lista oficial do TeamPiped, atualização da lista em 30 minutos, verificação de saúde em 5 minutos e timeout de 10 segundos. O link de reprodução usa o frontend hospedado pela instância selecionada. Para Streamable HTTP, use `YOUTUBE_MCP_TRANSPORT=streamable-http`; o endpoint MCP é `/mcp`.

### Ferramentas MCP

* `youtube_search(query, filter, limit)` pesquisa por meio do Piped e retorna metadados concisos.
* `youtube_video(video_id)` retorna metadados e streams de vídeo/áudio normalizados usando `/streams/{video_id}`.
* `youtube_play(video_id, autoplay, listen, quality, sponsorblock)` retorna um link pronto para o navegador e nunca abre um navegador.

Erros são retornados como conteúdo MCP estruturado com os campos `error` e `retryable`. Falhas temporárias do backend permitem nova tentativa; vídeos indisponíveis são não recuperáveis quando o backend retorna HTTP 404.

### Desenvolvimento e testes

Use `npm test` e `npm run check`. Os testes usam respostas HTTP simuladas e cobrem análise TeamPiped, duplicatas, entradas inválidas, saúde, seleção CDN, failover, normalização de busca/vídeo/streams, codificação de URLs e configuração. Antes de usar em produção, faça um teste de integração ao vivo em um ambiente com HTTPS de saída. Instâncias públicas do Piped podem ficar indisponíveis ou limitar requisições.

### Segurança e escopo

Não há credenciais, cookies, tokens, execução arbitrária de shell, ferramentas de arquivos ou acesso a contas do YouTube. O aplicativo precisa somente de HTTPS de saída para a lista TeamPiped, APIs públicas do Piped e frontend do Piped. Nenhuma licença de software está incluída neste repositório.

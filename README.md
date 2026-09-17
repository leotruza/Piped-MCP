# YouTube MCP — Node.js

## English

### Overview

This is the maintained Node.js implementation of a standalone YouTube MCP server. The previous Python implementation is preserved in the `archive/python` branch. The server provides structured YouTube access through privacy-oriented frontends without directly interacting with `youtube.com`, requiring an official YouTube API key, or controlling a browser.

> **AI-generated software disclaimer**
>
> This project was created with the assistance of artificial intelligence (AI), including its source code, documentation, configuration, and project structure. Users should independently review the code and verify that it meets their security, reliability, operational, and legal requirements.

### Architecture and features

Piped is the primary backend. The server downloads TeamPiped's official public-instance list, parses and deduplicates API URLs, checks every listed API through its search endpoint, prefers healthy CDN instances with low latency and few failures, and fails over automatically when a backend fails. Health checks run during startup refresh and periodically thereafter.

Invidious is an enabled-by-default fallback. Its configured public instances are checked through `/api/v1/stats`; only instances that return valid Invidious statistics are preferred for fallback requests. Search and video responses from either backend are normalized to the same MCP schema. Playback links use `https://piped.video` for Piped and the selected Invidious instance for Invidious fallback playback.

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
| `YOUTUBE_MCP_INVIDIOUS_INSTANCES` | Five official public HTTPS instances; comma-separated overrides |
| `YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES` | `30` |
| `YOUTUBE_MCP_HEALTH_CHECK_MINUTES` | `5` |
| `YOUTUBE_MCP_TIMEOUT_SECONDS` | `30` |

For Streamable HTTP, set `YOUTUBE_MCP_TRANSPORT=streamable-http`; the MCP endpoint is `/mcp`. The default configuration binds locally.

The default Invidious list follows the five HTTPS clearnet instances currently listed in the [official Invidious instance documentation](https://docs.invidious.io/instances/): `inv.nadeko.net`, `invidious.nerdvpn.de`, `yt.chocolatemoo53.com`, `invidious.tiekoetter.com`, and `invidious.f5.si`. Set `YOUTUBE_MCP_INVIDIOUS_INSTANCES` to comma-separated base URLs to replace the list, or set it to an empty string to disable Invidious fallback. Public instances can change or become unavailable; use a self-hosted instance when possible.

### MCP tools

* `youtube_search(query, filter, limit)` searches through Piped and falls back to Invidious when Piped has no usable backend.
* `youtube_video(video_id)` retrieves metadata and normalized video/audio streams through Piped or Invidious fallback.
* `youtube_play(video_id, autoplay, listen, quality, sponsorblock)` returns a browser-ready URL from the available backend and never launches a browser.

Errors are returned as structured MCP error content with `error` and `retryable` fields. Temporary backend failures are retryable; unavailable videos are non-retryable when a backend returns HTTP 404.

### Development and testing

```bash
npm test
npm run check
```

The test suite covers TeamPiped parsing, deduplication, invalid entries, Piped and Invidious health checks, CDN-aware selection, backend failover, search/video/stream normalization, URL encoding, configuration overrides, and the MCP stdio handshake. Before production use, perform a live integration check in an environment with outbound HTTPS. Public Piped and Invidious instances can become unavailable, rate-limit requests, or return incompatible responses.

### Security and scope

No credentials, cookies, tokens, arbitrary shell execution, filesystem tools, or YouTube account access are included. The application only makes outbound HTTPS requests to the configured TeamPiped list, public Piped APIs, configured Invidious APIs, and the Piped frontend. Public third-party instances have independent operators and privacy policies. This project is licensed under the GNU General Public License version 3.0. See `LICENSE`.

---

## Português (Brasil)

### Visão geral

Esta é a implementação mantida em Node.js de um servidor MCP independente para YouTube. A implementação anterior em Python está preservada na branch `archive/python`. O servidor oferece acesso estruturado ao YouTube por meio de frontends voltados à privacidade, sem interagir diretamente com `youtube.com`, exigir uma chave oficial da API do YouTube ou controlar um navegador.

> **Aviso sobre software gerado por IA**
>
> Este projeto foi criado com o auxílio de inteligência artificial (IA), incluindo código-fonte, documentação, configurações e estrutura. Os usuários devem analisar o código por conta própria e verificar se ele atende aos requisitos de segurança, confiabilidade, operação e aspectos legais.

### Arquitetura e recursos

O Piped é o backend principal. O servidor baixa a lista oficial de instâncias públicas do TeamPiped, analisa e remove endpoints duplicados, verifica cada API por meio do endpoint de busca, prefere instâncias CDN saudáveis com baixa latência e poucas falhas e executa failover automático quando um backend falha. As verificações de saúde ocorrem durante a atualização inicial e periodicamente depois disso.

O Invidious é um fallback habilitado por padrão. Suas instâncias públicas configuradas são verificadas por meio de `/api/v1/stats`; somente instâncias que retornam estatísticas Invidious válidas são priorizadas no fallback. As respostas de busca e vídeo dos dois backends são normalizadas para o mesmo formato MCP. Links de reprodução usam `https://piped.video` para Piped e a instância Invidious selecionada para reprodução via fallback.

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

As principais variáveis de ambiente são: host `127.0.0.1`, porta `8083`, transporte `stdio`, lista oficial do TeamPiped, fallback Invidious habilitado por padrão, atualização da lista em 30 minutos, verificações de saúde em 5 minutos e timeout de 30 segundos. Para Streamable HTTP, use `YOUTUBE_MCP_TRANSPORT=streamable-http`; o endpoint MCP é `/mcp`.

A lista padrão do Invidious segue as cinco instâncias HTTPS clearnet listadas atualmente na [documentação oficial de instâncias do Invidious](https://docs.invidious.io/instances/): `inv.nadeko.net`, `invidious.nerdvpn.de`, `yt.chocolatemoo53.com`, `invidious.tiekoetter.com` e `invidious.f5.si`. Defina `YOUTUBE_MCP_INVIDIOUS_INSTANCES` com URLs base separadas por vírgula para substituir a lista, ou use uma string vazia para desabilitar o fallback. Instâncias públicas podem mudar ou ficar indisponíveis; quando possível, use uma instância auto-hospedada.

### Ferramentas MCP

* `youtube_search(query, filter, limit)` pesquisa por meio do Piped e usa o Invidious quando nenhuma instância Piped está disponível.
* `youtube_video(video_id)` retorna metadados e streams de vídeo/áudio normalizados por Piped ou pelo fallback Invidious.
* `youtube_play(video_id, autoplay, listen, quality, sponsorblock)` retorna um link pronto para o navegador usando o backend disponível e nunca abre um navegador.

Erros são retornados como conteúdo MCP estruturado com os campos `error` e `retryable`. Falhas temporárias permitem nova tentativa; vídeos indisponíveis são não recuperáveis quando um backend retorna HTTP 404.

### Desenvolvimento e testes

```bash
npm test
npm run check
```

A suíte cobre análise TeamPiped, duplicatas, entradas inválidas, verificações de saúde do Piped e do Invidious, seleção CDN, failover, normalização de busca/vídeo/streams, codificação de URLs, substituições de configuração e handshake MCP stdio. Antes de usar em produção, faça um teste de integração ao vivo em um ambiente com HTTPS de saída. Instâncias públicas do Piped e do Invidious podem ficar indisponíveis, limitar requisições ou retornar respostas incompatíveis.

### Segurança e escopo

Não há credenciais, cookies, tokens, execução arbitrária de shell, ferramentas de arquivos ou acesso a contas do YouTube. O aplicativo faz somente requisições HTTPS de saída para a lista TeamPiped, APIs públicas do Piped, APIs Invidious configuradas e frontend do Piped. Instâncias públicas de terceiros possuem operadores e políticas de privacidade independentes. Este projeto está licenciado sob a GNU General Public License versão 3.0. Consulte `LICENSE`.

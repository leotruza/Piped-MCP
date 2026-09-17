# YouTube MCP

## English

### Overview

YouTube MCP is a standalone [Model Context Protocol](https://modelcontextprotocol.io/) server that provides a small, structured interface to YouTube through the open Piped API. It does not access `youtube.com` directly, does not require an official YouTube API key, and does not control a browser.

> **AI-generated software disclaimer**
>
> This project was fully created with the assistance of artificial intelligence (AI), including its source code, documentation, configuration, and project structure. It has been reviewed and tested to the extent described in this repository, but users should independently review the code and verify that it meets their security, reliability, and legal requirements.

### Features and architecture

The server downloads TeamPiped's official public-instance Markdown list at runtime, parses and deduplicates API endpoints, performs health checks, and keeps an in-memory pool with latency, CDN status, failure counts, and timestamps. Requests are sent to the best healthy public instance, with automatic failover when a backend fails. Playback URLs use the official `https://piped.video` frontend and include its API endpoint as the URL-encoded `instance` parameter.

The MCP boundary ends at returning a URL. An external browser automation system may open that URL, but this project contains no Playwright, Selenium, CDP, browser profile, or browser-launching dependency.

### Requirements and installation

Python 3.10 or newer is recommended. Install dependencies in a virtual environment:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### Configuration and running

Copy `config.example.json` for reference, then configure with environment variables when needed:

| Variable | Default |
|---|---|
| `YOUTUBE_MCP_HOST` | `127.0.0.1` |
| `YOUTUBE_MCP_PORT` | `8083` |
| `YOUTUBE_MCP_INSTANCE_LIST_URL` | TeamPiped official raw Markdown URL |
| `YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES` | `30` |
| `YOUTUBE_MCP_HEALTH_CHECK_MINUTES` | `5` |
| `YOUTUBE_MCP_TIMEOUT_SECONDS` | `10` |

Run it as an MCP stdio server:

```bash
python -m src.server
```

The default transport is MCP stdio for local clients. To expose Streamable HTTP on the configured host and port, set `YOUTUBE_MCP_TRANSPORT=streamable-http`; `sse` is also supported by the MCP SDK. The default bind values are `127.0.0.1:8083`.

### MCP tools

* `youtube_search(query, filter="videos", limit=10)` returns concise title, video ID, channel, duration, views, publication date, thumbnail, and type fields.
* `youtube_video(video_id)` retrieves metadata plus normalized video and audio stream information from `/streams/{video_id}`.
* `youtube_play(video_id, autoplay=false, listen=false, quality=null, sponsorblock=null)` returns a browser-ready URL only. It never launches or controls a browser.

Example result URL:

```text
https://example/watch?v=VIDEO_ID&instance=https%3A%2F%2Fpipedapi.example
```

### Public instances, health, and failover

TeamPiped's official list is the source of truth and is refreshed on startup and at the configured interval by the hosting process. A health check uses `/search?q=test&filter=all`, requiring a successful HTTP response, valid JSON, and an `items` array. Instances that fail are marked degraded and excluded from selection until a later health check succeeds. Healthy CDN instances and low-latency, low-failure instances are preferred. Public instances can disappear or rate-limit requests; temporary failures are returned as retryable structured errors.

### Security and scope

The server has no credentials, cookies, tokens, filesystem tools, shell tools, arbitrary command execution, or YouTube account access. It requires outbound HTTPS only to the TeamPiped list, public Piped APIs, and the Piped frontend. Review public-instance privacy and reliability characteristics before production use.

### Development and testing

Run the mocked test suite with:

```bash
pytest -q
```

Tests cover Markdown parsing, deduplication, invalid URLs, health checks, CDN-aware selection, failover, search/video/stream normalization, URL encoding, and configuration. A live integration check should be performed in an environment with outbound HTTPS before relying on public instances in production.

### Troubleshooting

If no healthy instance is available, verify outbound HTTPS and retry after the public-instance pool refreshes. If a video is unavailable, the server returns a non-retryable `Video not found` error where the backend provides a 404. If a Piped instance is temporarily down, the client marks it failed, tries another healthy instance, and returns a retryable error only when all candidates fail.

### License

This project is licensed under the GNU General Public License version 3.0. See `LICENSE`.

---

## Português (Brasil)

### Visão geral

O YouTube MCP é um servidor independente do [Model Context Protocol](https://modelcontextprotocol.io/) que oferece uma interface estruturada e pequena para o YouTube por meio da API aberta do Piped. Ele não acessa `youtube.com` diretamente, não exige uma chave da API oficial do YouTube e não controla navegadores.

> **Aviso sobre software gerado por IA**
>
> Este projeto foi criado integralmente com o auxílio de inteligência artificial (IA), incluindo o código-fonte, a documentação, as configurações e a estrutura do projeto. O projeto foi revisado e testado conforme descrito neste repositório, mas os usuários devem analisar o código por conta própria e verificar se ele atende aos seus requisitos de segurança, confiabilidade e aspectos legais.

### Recursos e arquitetura

O servidor baixa em tempo de execução a lista oficial de instâncias públicas do TeamPiped em Markdown, analisa e remove endpoints duplicados, verifica a saúde de cada instância de API e mantém um conjunto em memória com status de CDN, latência, falhas e horários. As solicitações usam automaticamente a melhor instância saudável, com failover quando um backend falha. Os links de reprodução usam o frontend oficial `https://piped.video` e incluem o endpoint da API no parâmetro `instance`, codificado corretamente.

O limite do MCP termina ao retornar um link. Um sistema externo de automação de navegador pode abrir esse link, mas este projeto não contém Playwright, Selenium, CDP, perfis de navegador ou dependências para iniciar navegadores.

### Requisitos e instalação

Recomenda-se Python 3.10 ou mais recente. Instale as dependências em um ambiente virtual:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

### Configuração e execução

Consulte `config.example.json` e use variáveis de ambiente quando necessário: `YOUTUBE_MCP_HOST`, `YOUTUBE_MCP_PORT`, `YOUTUBE_MCP_INSTANCE_LIST_URL`, `YOUTUBE_MCP_INSTANCE_REFRESH_MINUTES`, `YOUTUBE_MCP_HEALTH_CHECK_MINUTES` e `YOUTUBE_MCP_TIMEOUT_SECONDS`. Os padrões são `127.0.0.1`, `8083`, a lista oficial do TeamPiped, 30 minutos, 5 minutos e 10 segundos. O frontend de reprodução é o `https://piped.video`, com a API selecionada no parâmetro `instance`.

Execute-o como servidor MCP via stdio:

```bash
python -m src.server
```

O transporte padrão é stdio para clientes MCP locais. Para expor Streamable HTTP no host e porta configurados, defina `YOUTUBE_MCP_TRANSPORT=streamable-http`; `sse` também é suportado pelo SDK MCP. O padrão é `127.0.0.1:8083`.

### Ferramentas MCP

* `youtube_search(query, filter="videos", limit=10)` retorna título, ID do vídeo, canal, duração, visualizações, data de publicação, miniatura e tipo.
* `youtube_video(video_id)` retorna metadados e informações normalizadas dos streams de vídeo e áudio usando `/streams/{video_id}`.
* `youtube_play(video_id, autoplay=false, listen=false, quality=null, sponsorblock=null)` retorna somente um link pronto para o navegador. Nunca inicia nem controla um navegador.

### Instâncias públicas, saúde e failover

A lista oficial do TeamPiped é a fonte de verdade e é atualizada no início e no intervalo configurado pelo processo hospedeiro. A verificação usa `/search?q=test&filter=all` e exige HTTP bem-sucedido, JSON válido e uma lista `items`. Instâncias que falham são marcadas como degradadas e excluídas até uma verificação posterior bem-sucedida. Instâncias CDN saudáveis e com baixa latência e poucas falhas têm preferência. Instâncias públicas podem ficar indisponíveis ou limitar requisições; falhas temporárias são retornadas como erros estruturados que permitem nova tentativa.

### Segurança e escopo

O servidor não possui credenciais, cookies, tokens, ferramentas de arquivos ou shell, execução arbitrária, nem acesso a contas do YouTube. Ele precisa somente de HTTPS de saída para a lista TeamPiped, APIs públicas do Piped e o frontend do Piped. Avalie privacidade e confiabilidade das instâncias públicas antes de uso em produção.

### Desenvolvimento, testes e solução de problemas

Execute `pytest -q`. Os testes cobrem análise Markdown, duplicatas, URLs inválidas, saúde, seleção CDN, failover, normalização de busca/vídeo/streams, codificação de URLs e configuração. Antes de usar em produção, faça também um teste de integração ao vivo em um ambiente com HTTPS de saída. Se nenhuma instância saudável estiver disponível, verifique a conectividade e aguarde a atualização do pool. Vídeos indisponíveis retornam `Video not found` sem nova tentativa quando o backend fornece HTTP 404; falhas temporárias tentam outra instância e só retornam erro recuperável quando todas falham.

### Licença

Este projeto está licenciado sob a GNU General Public License versão 3.0. Consulte `LICENSE`.

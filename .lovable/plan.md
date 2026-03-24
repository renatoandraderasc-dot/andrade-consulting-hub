

# Plano: Motor Generico de Coleta em Background com Firecrawl Crawl

## Problema Raiz
O VIPCommerce (e outras plataformas não-VTEX) bloqueia acesso à API de categorias/produtos. A tentativa de usar endpoints internos falha (0 categorias encontradas). A abordagem atual tenta tudo em uma única chamada de Edge Function que tem timeout limitado.

## Solucao Definitiva
Usar o **Firecrawl Crawl** (crawl assíncrono que renderiza JavaScript) como motor principal para qualquer site que não seja VTEX. O crawl visita todas as páginas do site, renderiza o JS (funciona com Angular SPAs como VIPCommerce), e extrai produtos do HTML/markdown. O processo roda em background com progresso persistido no banco.

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend   │────>│  Edge Function   │────>│  Firecrawl API  │
│  (iniciar)  │     │  (iniciar job)   │     │  /v1/crawl      │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                                            │
       │ polling                                    │ webhook/poll
       ▼                                            ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Progress   │<────│  Edge Function   │<────│  Crawl Results  │
│  Bar UI     │     │  (check status)  │     │  (all pages)    │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

## Etapas de Implementacao

### 1. Criar tabela `scrape_jobs` (migration)
Armazena o estado de cada coleta em background:
- `id`, `competitor_url`, `competitor_name`, `status` (pending/mapping/crawling/extracting/done/error)
- `firecrawl_crawl_id` (ID retornado pelo Firecrawl)
- `total_urls_found`, `pages_crawled`, `products_found`
- `progress_pct`, `error_message`
- `products_json` (JSONB com todos os produtos extraidos)
- `created_at`, `updated_at`
- RLS: admins full access, authenticated users can read

### 2. Reescrever Edge Function `scrape-competitor-prices`
Nova logica em 2 modos:

**Modo 1 - Iniciar coleta** (`action: "start"`):
- Para VTEX: manter estrategia atual (sincrona, funciona bem)
- Para qualquer outro site: usar Firecrawl `/v1/map` (descobrir URLs) + `/v1/crawl` (crawl assincrono com `limit: 5000`, `scrapeOptions: { formats: ['html'], waitFor: 3000 }`)
- Salvar o `crawl_id` na tabela `scrape_jobs`
- Retornar imediatamente com `jobId`

**Modo 2 - Verificar progresso** (`action: "check"`, `jobId`):
- Consultar Firecrawl `/v1/crawl/{crawl_id}` para status
- Se completo: extrair produtos de todas as paginas (JSON-LD, precos no HTML, markdown)
- Atualizar `scrape_jobs` com progresso e produtos
- Retornar status + produtos quando pronto

### 3. Atualizar Frontend `ConcorrentesTab.tsx`
- Ao clicar "Coletar": iniciar job e receber `jobId`
- Polling a cada 5 segundos para verificar progresso
- Mostrar barra de progresso com: URLs encontradas, paginas processadas, produtos extraidos
- Quando finalizado: exibir resultado e permitir analise

### 4. Atualizar `firecrawl.ts` (API client)
- Adicionar metodos `startScrapeJob(url)` e `checkScrapeJob(jobId)`

## Detalhes Tecnicos

- **Firecrawl Crawl** renderiza JavaScript (resolve o problema do Angular SPA do VIPCommerce)
- **Limit de 5000 paginas** no crawl garante cobertura completa
- **waitFor: 3000ms** da tempo para SPAs carregarem produtos
- **Extracao dupla**: JSON-LD structured data + regex de precos no markdown
- **Sem timeout**: o crawl roda nos servidores do Firecrawl, a Edge Function so consulta o status
- **Creditos**: usa creditos do Firecrawl proporcionais ao numero de paginas, mas e o unico metodo que garante cobertura total para sites nao-VTEX

## Arquivos Modificados
1. `supabase/migrations/new` - Tabela `scrape_jobs`
2. `supabase/functions/scrape-competitor-prices/index.ts` - Logica de job assincrono
3. `src/lib/api/firecrawl.ts` - Novos metodos de job
4. `src/components/repricing/ConcorrentesTab.tsx` - UI de progresso


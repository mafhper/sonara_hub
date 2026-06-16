# Desenvolvimento

## Estrutura

```text
src/        app React local
server/     API local, áudio, jobs e render
shared/     contratos e runtime compartilhado
site/       promo-site React/Vite para GitHub Pages
public/     assets públicos compartilhados
tests/      testes unitários e smoke tests
docs/       documentação técnica e banco de testes
```

Dados locais, áudio, capas, outputs e caches de desenvolvimento permanecem fora
do Git.

## Scripts principais

```powershell
npm run dev              # desenvolvimento (Vite + HMR) em :5173 / API :4175
npm run app              # modo estável: build + serve o app pela API em :4175
npm run build            # build do app
npm run test:ui          # smoke Playwright do app
npm run test:flow        # jornada local completa
npm run test:render      # smoke dos renderizadores
npm run bench:render     # benchmark local de render/export
npm run test:release     # gate ampliado de release
npm run site:dev         # promo-site
npm run site:build       # build do promo-site
npm run site:test        # smoke Playwright do promo-site
```

## Modos de execução

- **Desenvolvimento — `npm run dev`**: Vite com HMR em `:5173` e API em `:4175`.
  Use para desenvolver a UI. O cliente Vite pode cair (`exit 3221226505`,
  "Servidor local indisponível") sob a carga de uma exportação real, porque o
  render abre Chromium headless e a pressão de memória/IO derruba o dev client.
- **Estável — `npm run app`**: faz `build` e serve o app compilado pela própria
  API em `http://127.0.0.1:4175` (sem Vite, sem HMR, sem watcher). É o modo
  recomendado para **exportar de verdade** (lotes, vídeos longos), pois não
  sofre o reload-storm do dev client. Para reservir um build já feito sem
  recompilar, use `npm start`.

Jobs também ficam mais resilientes a quedas momentâneas do servidor: durante uma
exportação, uma perda transitória de conexão não marca mais o job como `error` —
o cliente reexibe "Servidor reconectando…" e segue consultando com backoff,
pegando o estado real quando o servidor volta.

## Validação

Antes de um commit, execute os gates adequados ao escopo:

```powershell
npm run format:check
npm run type-check
npm test
npm run build
```

Antes de publicar uma branch candidata a release, mantenha `npm run dev` ativo
e execute:

```powershell
npm run bench:render
npm run bench:render -- --audio=input
npm run test:release
```

A matriz exploratória fica em
[`release-test-bench.md`](release-test-bench.md).

## Benchmark de render/export

`npm run bench:render` mede uma matriz curta de renderização/exportação sem
depender do servidor dev. O comando gera WebM e MP4 curtos, valida as saídas com
FFmpeg e registra tempo total, preparo Chromium/runtime, captura determinística
do canvas, MediaRecorder/WebM, validação WebM, mux FFmpeg, validação MP4,
tamanho dos arquivos, pico de RSS e retries WebGL.

Os resultados ficam em `.dev/bench/`, fora do Git:

- `render-history.jsonl`: histórico acumulado local.
- `latest-render-report.md`: resumo da última execução.
- `runs/`: saídas e JSON detalhado por rodada.

Por padrão o benchmark usa áudio sintético para comparação estável. Para
exercitar exemplos reais da pasta `input/`, use:

```powershell
npm run bench:render -- --audio=input
```

Alertas de degradação são não bloqueantes enquanto o baseline local ainda está
sendo calibrado. Falhas funcionais de render, mux ou validação continuam
falhando o comando.

## Promo-site e GitHub Pages

O promo-site vive em `site/` e compartilha assets de marca em `public/brand/`.
O workflow `.github/workflows/pages.yml` publica somente `site/dist` quando a
branch `main` recebe push ou quando o workflow é executado manualmente.

O site é uma aplicação React/Vite estática com detecção automática de idioma via
`navigator.languages`. A copy pública deve permanecer disponível em `pt-BR`,
`en` e `es`, incluindo novas seções, CTAs, nomes acessíveis e experiências
interativas. Hoje a vitrine inclui uma prévia controlada de atmosferas em canvas
para comparar presets, capa opcional, opacidade e modos de mescla sem abrir o
aplicativo desktop.

Antes de publicar alterações no site:

```powershell
npm run site:build
npm run site:test
```

## Dependências

O projeto mantém `package-lock.json`, usa `npm ci` na CI e fixa Actions por SHA
com permissões explícitas. Para uma auditoria local:

```powershell
npm ci --ignore-scripts
npm audit signatures
npm audit --audit-level=high
npm rebuild ffmpeg-static
```

O último comando restaura o binário confiável necessário aos testes locais de
áudio e render após a instalação sem scripts.

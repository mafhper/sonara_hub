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
npm run dev              # app local
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

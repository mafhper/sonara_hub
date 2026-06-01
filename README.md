# Sonara Hub

Sonara Hub e uma ferramenta local para preparar musicas e transformar faixas em
videos ambientes prontos para publicacao. O projeto nasceu do fluxo real de
organizar albuns, tratar pacotes MP3 e gerar clipes simples para YouTube.

O app tem dois workspaces conectados:

- `Biblioteca de audio`: analise de MP3, revisao de tags ID3, capas, letras,
  qualidade tecnica e geracao de copias tratadas.
- `Estudio visual`: composicao de videos com cenas suaves, camadas enviadas,
  waveform opcional, texto discreto e exportacao MP4.

Tudo roda localmente. Arquivos de audio, capas, jobs e outputs privados ficam
fora do Git.

## Estado do projeto

O foco atual e amadurecer o MVP local antes da fase de aplicativo Windows. O
repo tambem inclui um promo-site leve em `site/`, publicado futuramente via
GitHub Pages.

## Executar o app local

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`.

## Executar o promo-site

```powershell
npm run site:dev
```

Build e preview:

```powershell
npm run site:build
npm run site:preview
```

O site fica isolado em `site/` e usa os assets compartilhados em
`public/brand/`.

## Fluxo principal

1. Abra uma pasta de musicas ou adicione arquivos avulsos.
2. Na `Biblioteca de audio`, revise sugestoes, tags, capa, letra e qualidade.
3. Gere copias MP3 tratadas em `Tratados/`, sem alterar originais por padrao.
4. Confira o catalogo planejado e a grade de videos.
5. No `Estudio visual`, escolha uma familia visual, camadas e waveform.
6. Exporte em `720p`, `1080p`, `2K` ou `4K`. Cada video pode gerar sidecar
   `.youtube.json`.

## Recursos atuais

- Importacao de pasta com fallback para upload manual.
- Analise de loudness, pico verdadeiro, LRA e margem reduzida.
- Edicao de tags ID3, letras manuais e capas para MP3.
- Tratamento em lote com dados comuns e sobrescritas por faixa.
- Serie numerada customizavel para capas.
- Workspaces `Biblioteca de audio` e `Estudio visual`.
- Conferencia visual em catalogo e grade estilo YouTube.
- Seis familias visuais: fluxo liquido, nuvens amplas, aurora, aura vetorial,
  vinil e tela escura.
- Cinco estilos de waveform opcionais.
- Ate tres camadas de midia por composicao.
- Autosave local em IndexedDB.
- Limpeza manual de arquivos temporarios e gerados.
- Promo-site estatico em `site/`.
- Favicons, app icons e marca em `public/brand/`.

## Estrutura

```text
src/        App React local
server/     API local, audio, jobs e render
shared/     contratos e runtime compartilhado
site/       promo-site React/Vite para GitHub Pages
public/     assets publicos compartilhados
tests/      unitarios e smoke tests
docs/       banco de testes e debitos tecnicos
```

Pastas privadas como `.dev/`, `input/`, `outputs/`, `data/`, `dist/` e
`site/dist/` ficam ignoradas.

## Scripts

```powershell
npm run dev              # app local
npm run build            # build do app local
npm run site:dev         # promo-site
npm run site:build       # build do promo-site
npm run site:test        # smoke Playwright do promo-site
npm run test:ui          # smoke Playwright do app
npm run test:render      # smoke dos renders
npm run test:release     # gate ampliado de release
```

## Validacao

Gates minimos:

```powershell
npm run format:check
npm run type-check
npm test
npm run build
npm run site:build
```

Gates de smoke recomendados:

```powershell
npm run test:ui
npm run site:test
npm run test:render
```

Antes de gerar um candidato a release, mantenha `npm run dev` ativo e execute:

```powershell
npm run test:release
```

O escopo completo e a matriz exploratoria da `v1.0.0` estao em
[`docs/release-test-bench.md`](docs/release-test-bench.md).

Debitos tecnicos acompanhados ficam em
[`docs/technical-debt.md`](docs/technical-debt.md).

## GitHub Pages

O workflow `.github/workflows/pages.yml` publica apenas `site/dist` quando a
branch `main` recebe push ou quando o workflow e executado manualmente.

## Supply chain

O repo usa `package-lock.json`, `npm ci` na CI, permissao explicita nos
workflows e Actions fixadas por SHA completo. Para auditorias locais:

```powershell
npm audit signatures
npm audit --audit-level=high
```

O gate de supply chain pode usar `npm ci --ignore-scripts`. Antes de executar
testes locais de audio ou render depois desse gate, restaure o binario confiavel:

```powershell
npm rebuild ffmpeg-static
```

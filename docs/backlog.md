# Backlog e estado do Sonara Hub

> Atualizado em 2026-06-12. Este documento existe para que colaboradores externos
> entendam o estado atual, as dívidas e as próximas etapas com contexto suficiente
> para agir. Para o gate de validação antes de release, ver
> [release-test-bench.md](release-test-bench.md).

## Como validar qualquer mudança

```powershell
npm run type-check   # tipos
npm test             # 173+ testes unitários (node --test)
npm run test:render  # render headless de TODAS as famílias de atmosfera (WebGL→WebM)
npm run build        # build de produção
npm run format:check # prettier
```

`npm run dev` sobe **dev:server (API em :4175)** + **dev:client (vite em :5173)**.
Importante: **`server/index.mjs` não tem hot-reload** — ao mexer no servidor,
reinicie o `npm run dev` inteiro. O front (vite) tem HMR.

## Entregue recentemente (rounds de 06-09 a 06-11)

- Divulgação: formatos agrupados, prévia fiel, clipes com áudio reativo, editor de tags.
- Canvas: seleção/arraste/resize/rotação de camadas e texto (Round 4.1).
- `.sonara`: persistência de projetos internos via API do servidor.
- **Round 5 (06-11):** isolamento de camadas por vídeo; animações unificadas
  (fade-in/fade-out/zoom em camadas e textos); renderers de atmosfera dedicados
  `galaxy` e `lava` (deixaram de ser cópias de vórtice/plasma); foco-solar opcional
  genérico; fix de áudio em projeto restaurado (source input→folder).
- **Setup flow (06-11):** boot exige abertura explícita; card "Setup" unifica os
  controles de pasta; sidebar vira perfil + lista ao abrir um projeto.
- **Camadas unificadas / render stack (06-11, Steps 1-7):** `legacyRenderStack` +
  `composition.renderOrder` com fallback; seção "Composição" no inspetor visual.
- **Workspace reliability (06-12):** fallback seguro para handles externos sem
  permissão, autosave por projeto sem clobber no boot/troca rápida, e save de
  snapshot tolerante a assets manuais ilegíveis/obsoletos.

## Dívida estrutural — PRIORIDADE

### D1. `src/App.tsx` virou inviável (~15k linhas)

- Sintoma: BABEL avisa "code generator deoptimised … exceeds the max of 500KB".
  Edições são lentas, difíceis e arriscadas; line numbers mudam a cada commit.
- Contém: estado raiz do app, todos os inspetores (Visual/Texto/Música),
  Divulgação, biblioteca/Setup, runtime de pré-visualização, persistência,
  dezenas de subcomponentes e helpers.
- **Abordagem sugerida:** extrair por domínio para `src/` (ex.: `inspectors/`,
  `library/`, `publication/`, `workspace/`, `hooks/`, `state/`), começando pelos
  componentes puros (sem estado compartilhado) e helpers já isolados. Mover um
  bloco por vez, rodando `type-check` + `build` a cada passo. **Não** refatorar
  comportamento junto com a mudança de arquivo — só mover.
- Risco: alto (área central); fazer em PRs pequenos e verificáveis.

## Bugs conhecidos / em verificação

### B1. Auto-save sobrescrevia o `.sonara` ao carregar — CORRIGIDO

- O auto-save agora ignora apenas o array exato carregado por `setWorkspaceTracks`,
  então abrir/restaurar um projeto não sobrescreve `.sonara` com estado ainda em
  hidratação, mas a primeira edição real feita logo após trocar de projeto salva.
- Coberto por `tests/project-folder-flow.mjs` (snapshot interno não é clobberado,
  troca Alpha/Beta persiste edições e assets) e `tests/ui-smoke.mjs`.

### B2. `NotReadableError` ao salvar ("The requested file could not be read…") — CORRIGIDO

- Vinha de referência de `File` **obsoleta** — tipicamente camada manual externa
  cujo handle expirou.
- A serialização de snapshot agora testa a legibilidade do `File`; se um asset
  manual não puder ser lido, o save continua e a camada ilegível é omitida do
  snapshot portátil em vez de quebrar o `.sonara` inteiro.
- Coberto por `tests/project-folder-flow.mjs` com `File.arrayBuffer()` simulando
  `NotReadableError`.

### B3. Asset interno (capa/camada) não carregava — CORRIGIDO

- `/api/internal-asset` servia de `.sonara/assets/` (pasta dot) e o `send` do
  Express, com `dotfiles:"ignore"` padrão, devolvia 404 → camadas não
  reconstruíam. Fix: `res.sendFile(path, { dotfiles: "allow" })`
  (`server/index.mjs`). Confirmado por fluxo Playwright de projeto interno com
  snapshot `.sonara`.

### B4. "Composição: ocultar some pra sempre"

- Na seção "Composição" do inspetor visual, ocultar um item o remove da lista sem
  como reexibir. Será absorvido pelo redesenho R1 (ver abaixo), mas é um bug.

### B5. Conflito de porta só no preview embutido — CORRIGIDO

- O servidor agora resolve a porta por `SONARA_API_PORT` quando definido e, no
  lifecycle `dev:server`, ignora `PORT=5173` injetado por preview tools para
  manter a API em `:4175`. `PORT` continua respeitado fora do modo dev.
- Coberto por `tests/server-port.test.mjs`.

## Próximas funcionalidades (pedidas)

### R1. Redesenho da barra lateral de camadas (UI/UX)

Visão do dono do produto:

- Tratar **todas** as entidades visuais como "camadas" num único elemento:
  atmosfera, waveform, foco-solar **e** mídias.
- Ativar/ocultar pelo **ícone de olho** (não checkbox). Abrir o acordeon mostra os
  ajustes daquela camada.
- Trocar de atmosfera **substitui** a camada de atmosfera (idem para os demais).
- Separar comandos **gerais** de **individuais**, simplificar, reorganizar.
  "Um bom design não precisa de explicação."
- Base existente: render stack já unifica a ordem (`legacyRenderStack` /
  `composition.renderOrder` em `canvas-scene-runtime.mjs`) e há a seção
  "Composição" (a refazer conforme acima). Corrige B4 de quebra.

### R2. Saves múltiplos (nomeados) por projeto

- Hoje abrir um projeto **sobrescreve** o `.sonara`. Pedido: poder ter vários
  saves por álbum e carregar configurações diferentes.
- **Abordagem:** evoluir a persistência de `.sonara/project.json` único para
  `.sonara/saves/<nome>.json` + UI para salvar-como / escolher / renomear /
  excluir. Servidor: ampliar os handlers de `internal-snapshot` (`server/index.mjs`).
  Resolve a raiz de B1 (deixa de ser "sobrescreve" e vira "salva em slot").

### R3. Setup: pastas antes dos projetos — CONFIRMADO

- Já no código: o seletor de projetos só aparece após "Confirmar pastas e
  continuar" (`foldersReady` em `App.tsx`), para não carregar num workspace
  indefinido. Coberto por `tests/project-folder-flow.mjs`, incluindo boot sem
  auto-load, handles externos negados e fallback para `input/`/`outputs/`.

## Diferido — estética (precisa de revisão visual do dono)

### E1. Atmosferas

- Encher temas: Espaço (~5), Lava (~3), Geométrico/Infantil/Minimalista (3-4 cada)
  com shaders novos; refazer "Faixas de piano" (não lê como teclas); melhorar
  Aura vetorial e Tela escura; afinar galaxy/lava/foco-solar.
- Preservar favoritos: Fluxo líquido, Nuvens amplas, Aurora, Campo Estelar, Mesh
  colorido. Padrão de port de shader em
  `docs/superpowers/specs/2026-06-01-playful-visual-presets-design.md` e no
  `canvas-scene-runtime.mjs` (`fragmentShaders`).

### E2. CRUD rico do projeto na sidebar

- Sobre o perfil/seletor já entregue: ordenar itens, ocultar projetos, adicionar
  itens, e ver/editar o que está salvo no `.sonara` do projeto.

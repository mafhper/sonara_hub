# Backlog e estado do Sonara Hub

> Atualizado em 2026-06-11. Este documento existe para que colaboradores externos
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

### B1. Auto-save sobrescreve o `.sonara` ao carregar (perda de dados)

- Efeito de auto-save (`App.tsx`, debounce 250ms ao mudar `tracks`/settings)
  dispara logo após um projeto carregar; se o restore ainda não aplicou tudo
  (ex.: capa não reconstruída), grava o estado incompleto por cima do `.sonara`
  bom → perde a capa/camadas (daí ter que deletar e re-adicionar a capa).
- **Mitigação já no código (a verificar end-to-end):** `hydratingRef` setado por
  `setWorkspaceTracks`; o auto-save pula exatamente o save disparado pelo load.
- Pendente: confirmar em uso real que abrir projeto não sobrescreve mais.

### B2. `NotReadableError` ao salvar ("The requested file could not be read…")

- Vem de referência de `File` **obsoleta** — tipicamente camada com **arquivo
  externo** (handle de pasta do File System Access API que expirou), não a capa
  reconstruída do `.sonara`.
- **Abordagem:** ao montar o snapshot para salvar, ler cada `File` com try/catch;
  se ilegível, pular a camada (ou re-hidratar do asset salvo) em vez de quebrar o
  save inteiro. Ver `createSnapshot`/`saveActiveProjectSnapshot` em `App.tsx`.

### B3. Asset interno (capa/camada) não carregava — CORRIGIDO, a confirmar

- `/api/internal-asset` servia de `.sonara/assets/` (pasta dot) e o `send` do
  Express, com `dotfiles:"ignore"` padrão, devolvia 404 → camadas não
  reconstruíam. Fix: `res.sendFile(path, { dotfiles: "allow" })`
  (`server/index.mjs`). Verificado HTTP 200; confirmar que a capa aparece após
  reiniciar o server.

### B4. "Composição: ocultar some pra sempre"

- Na seção "Composição" do inspetor visual, ocultar um item o remove da lista sem
  como reexibir. Será absorvido pelo redesenho R1 (ver abaixo), mas é um bug.

### B5. Conflito de porta só no preview embutido

- O launch config "dev" exporta `PORT=5173`, então `npm run dev` manda servidor e
  cliente para 5173; o vite pega, o backend sai, e `/api` cai (ECONNREFUSED→500).
  **Não afeta** o `npm run dev` em terminal normal (backend em :4175). Só afeta
  ferramentas de preview que setam `PORT`.

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

### R3. Setup: pastas antes dos projetos (em verificação)

- Já no código: o seletor de projetos só aparece após "Confirmar pastas e
  continuar" (`foldersReady` em `App.tsx`), para não carregar num workspace
  indefinido. Confirmar UX e se elimina o "começa do zero em outro save".

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

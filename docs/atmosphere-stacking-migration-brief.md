# Briefing: empilhamento de atmosferas

Este documento prepara a conversa com um desenvolvedor especialista sobre a
migracao do Sonara Hub de uma unica atmosfera de fundo para uma pilha de
atmosferas combinaveis.

## Objetivo

Permitir que o usuario combine duas ou mais atmosferas no Estudio visual, com
ordem, visibilidade, opacidade, blend mode e ajustes independentes por camada,
sem quebrar projetos existentes que hoje salvam apenas `track.scene`.

## Estado atual observado

- Cada faixa tem uma unica cena visual em `TrackDraft.scene`.
- A pilha visual mostra um item fixo `Fundo visual`, mas esse item aponta para a
  cena unica da faixa.
- `RenderStackItem` tem apenas `{ kind: "atmosphere" }`, sem `layerId` ou
  referencia a uma instancia de atmosfera.
- O renderer compartilha um unico `scene` para atmosfera, post, waveform, foco
  de luz e vinil.
- A ordenacao atual ja passa por `renderOrder`, mas ela organiza tipos de
  camada, nao multiplas instancias de atmosfera.

## Arquivos relevantes

| Area                | Arquivo publico                                                                        | Observacao                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Tipo da faixa       | https://github.com/mafhper/sonara_hub/blob/main/src/types.ts                           | `TrackDraft.scene` guarda a unica `ScenePresetV3`; `TrackDraft.layers` guarda midias separadas.                                            |
| Tipos visuais       | https://github.com/mafhper/sonara_hub/blob/main/shared/visual-effects.d.mts            | `RenderStackItem` nao possui id para atmosfera; `ScenePresetV5` carrega `renderOrder`.                                                     |
| Normalizacao visual | https://github.com/mafhper/sonara_hub/blob/main/shared/visual-effects.mjs              | `normalizeVisualSettings` retorna uma cena unica com preset, variante, common, advanced, post, waveform e foco.                            |
| Runtime canvas      | https://github.com/mafhper/sonara_hub/blob/main/shared/canvas-scene-runtime.mjs        | `legacyRenderStack` sempre inicia com uma atmosfera; `renderAtmosphere` recebe apenas `scene`.                                             |
| Preview React       | https://github.com/mafhper/sonara_hub/blob/main/src/workspaces/CompositionPreview.tsx  | O preview cria um runtime com `scene` e `composition`; precisa manter paridade com export.                                                 |
| Pilha visual UI     | https://github.com/mafhper/sonara_hub/blob/main/src/inspectors/CompositionStack.tsx    | `buildRenderStackItems` transforma `{ kind: "atmosphere" }` em `Fundo visual` fixo e nao removivel.                                        |
| Inspector visual    | https://github.com/mafhper/sonara_hub/blob/main/src/inspectors/VisualInspector.tsx     | O browser de presets edita a cena selecionada; hoje nao existe atmosfera selecionavel por instancia.                                       |
| Browser de presets  | https://github.com/mafhper/sonara_hub/blob/main/src/inspectors/VisualPresetBrowser.tsx | Seleciona preset/variant com `{ id: baseId, appliedVariantId }` para normalizar uma cena unica.                                            |
| Estado principal    | https://github.com/mafhper/sonara_hub/blob/main/src/App.tsx                            | `updateScene`, `computeRenderStack`, `defaultRenderStack`, `reconcileRenderStack` e `moveSelectedStackItem` concentram a integracao atual. |
| Render/export tests | https://github.com/mafhper/sonara_hub/blob/main/tests/canvas-scene-runtime.test.mjs    | Testa a pilha legada com atmosfera unica.                                                                                                  |
| Presets tests       | https://github.com/mafhper/sonara_hub/blob/main/tests/visual-effects.test.mjs          | Testa normalizacao, variantes e compatibilidade de presets.                                                                                |

## Perguntas para o especialista

1. O modelo novo deve viver em `TrackDraft.scene.atmosphereLayers`,
   `TrackDraft.atmospheres` ou dentro de `TrackDraft.layers` como um novo tipo de
   camada?

   Observacao: `TrackDraft.layers` hoje e orientado a arquivos/midia, enquanto
   `scene` concentra renderer, post, waveform e foco. Misturar atmosferas com
   midia pode simplificar a UI, mas pode confundir serializacao e export.

2. Qual contrato de dados voce recomenda para uma camada de atmosfera?

   Uma possibilidade:

   ```ts
   type AtmosphereLayerV1 = {
     id: string;
     name: string;
     visible: boolean;
     opacity: number;
     blendMode: "normal" | "screen" | "overlay" | "multiply" | "lighter";
     scene: ScenePresetV3;
   };
   ```

   Duvida: vale guardar uma `scene` completa por camada, ou seria melhor guardar
   `presetId`, `appliedVariantId` e patches de `common`/`advanced` para reduzir
   duplicacao?

3. Como manter compatibilidade com projetos antigos?

   Candidato: ao carregar um projeto sem `atmosphereLayers`, criar uma camada
   sintetica com `id: "atmosphere-base"` a partir de `track.scene`. A pergunta e
   se essa migracao deve acontecer no restore do projeto, no normalizador visual,
   ou apenas em runtime/UI.

4. Como evoluir `RenderStackItem`?

   Hoje ele tem `{ kind: "atmosphere" }`. Para multiplas instancias, parece
   necessario algo como:

   ```ts
   | { kind: "atmosphere"; layerId: string }
   ```

   Duvida: devemos manter `{ kind: "atmosphere" }` como alias legado para a
   atmosfera base, ou migrar tudo para `layerId` obrigatorio e reconciliar no
   carregamento?

5. O `post` deve ser global ou por atmosfera?

   Hoje `post` pertence a `scene` e e renderizado uma vez depois da atmosfera.
   Em pilha, ha tres caminhos:
   - post global unico no fim da pilha;
   - post por atmosfera antes da composicao da proxima;
   - post global mais pequenos ajustes por camada.

   Minha inclinacao: manter post global na primeira fase para reduzir risco, mas
   preciso de contra-argumentos.

6. Como compor multiplos renderers WebGL com desempenho previsivel?

   `canvas-scene-runtime.mjs` usa um canvas WebGL offscreen e depois desenha no
   canvas 2D. Para varias atmosferas WebGL, podemos renderizar uma por vez no
   mesmo offscreen e aplicar `globalAlpha`/`globalCompositeOperation` no 2D.
   Isso e suficiente ou precisamos de framebuffers/texturas por camada?

7. Como isolar audio reactivity por camada?

   Todas as atmosferas recebem o mesmo objeto `audio`. Devemos ter um fator por
   camada como `audioAmount`, `audioBandMask` ou `reactivity`, para evitar que
   uma combinacao vire visualmente instavel?

8. Como o browser visual deve agir quando uma camada de atmosfera esta
   selecionada?

   Proposta: o `VisualPresetBrowser` deixa de trocar a cena global e passa a
   substituir apenas a `scene` da atmosfera selecionada. O botao "Adicionar a
   composicao" criaria uma nova camada de atmosfera usando o preset escolhido.

9. Como expor isso na pilha sem confundir com midia?

   O usuario ja entende uma lista de camadas. Podemos mostrar:
   - `Fundo visual` como atmosfera base, nao removivel;
   - atmosferas adicionais removiveis;
   - controles por camada em accordion: visivel, opacidade, blend, preset,
     common/advanced;
   - aviso de tier/performance quando houver mais de uma atmosfera WebGL pesada.

   Pergunta: voce manteria uma base obrigatoria ou permitiria uma composicao sem
   atmosfera, apenas midia/texto?

10. Onde a migracao deve ser testada primeiro?

    Minha sugestao:
    - `tests/visual-effects.test.mjs`: normalizacao e compatibilidade de
      `atmosphereLayers`;
    - `tests/canvas-scene-runtime.test.mjs`: ordem de renderizacao e fallback
      legado;
    - `tests/ui-smoke.mjs`: adicionar, selecionar, ocultar e reordenar
      atmosfera;
    - `tests/render-presets-smoke.mjs`: render export com duas atmosferas.

## Observacoes e riscos

- O app ainda usa `selectedScene = selectedTrack?.scene` em varios pontos. A
  migracao precisa evitar uma alteracao ampla e fragil no `App.tsx`.
- `waveform`, `vinyl` e `cloudLight` vivem dentro da cena atual. Se a cena virar
  uma lista de atmosferas, esses recursos precisam de casa propria ou de uma
  convencao clara de "scene global".
- Render preview e export precisam compartilhar a mesma interpretacao da pilha;
  qualquer solucao so de UI tende a quebrar paridade.
- Camadas WebGL combinadas podem multiplicar custo de render. O plano precisa de
  limites: maximo recomendado, degrade por tier, ou aviso quando o usuario
  empilhar efeitos pesados.
- Acessibilidade: a UI de pilha deve continuar operavel por teclado, com
  `aria-selected`, nomes acessiveis para toggle/reorder e foco visivel.

## Pergunta principal

Qual seria a arquitetura minima, reversivel e compativel com projetos antigos
para introduzir atmosferas empilhadas sem transformar `App.tsx` em um ponto de
acoplamento ainda maior?

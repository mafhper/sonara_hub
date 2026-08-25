# Relatório: tentativa de uso real da GPU no pipeline de render — sonara_hub

Branch: `codex/gpu-plus-ffmpeg-backends` · Data: 2026-08-24
Máquina de referência: Intel i7-4790K (4 núcleos / 8 threads, 16 GB RAM) · AMD Radeon RX 7600 · Windows 11 · Chromium headless (Playwright) + FFmpeg

---

## 1. Objetivo

Reduzir o tempo de exportação de vídeo distribuindo carga para a RX 7600. Resultado observado após todas as iniciativas: **a GPU é acionada (WebGL em modo hardware confirmado por telemetria) mas permanece ≤ 10% de uso, enquanto o CPU satura em 90–100%**. Este documento consolida evidências, diagnóstico e caminhos propostos para discussão.

## 2. Como o pipeline funciona hoje

```
análise de áudio → captura WebGL (Chromium headless) → mux FFmpeg → validação
                    ┌─────────────────────────────┐
                    │ canvas 2D/WebGL via ANGLE    │  ← cena desenhada por JS
                    │ captureStream(0)+requestFrame│  ← frame explícito por iteração
                    │ MediaRecorder → WebM VP9     │  ← encode POR SOFTWARE (libvpx)
                    └─────────────────────────────┘
```

- Modo hardware lança o Chromium com `--use-angle=d3d11` etc., mas **exige `--disable-gpu-compositing`** — sem ele, em headless, os frames não chegam ao pipeline `captureStream(0)` e o MediaRecorder produz WebM vazio silenciosamente (causa raiz provada com sonda isolada).
- O intermediário é VP9 **por software** dentro do Chromium; o FFmpeg depois re-encoda para o formato final (default libx264; AMF/QSV/NVENC disponíveis e detectados).

## 3. Evidências acumuladas (telemetria do profiler, jobs reais)

Linha `CAPTURE frames=N draw=Xms (Yms/f) requestFrame=... pacing=... target=32ms/f mode=...`

| Cenário                         | draw           | pacing                | requestFrame | Leitura                                                |
| ------------------------------- | -------------- | --------------------- | ------------ | ------------------------------------------------------ |
| 1 job, pacing legado            | 18,7 ms/f      | 34,8 ms/f (target 32) | ~0,0 ms/f    | Espera fixa domina (~59% do tempo) — **H1 confirmado** |
| 1 job, pacing adaptativo        | 23,6 ms/f      | 21,0 ms/f             | ~0,0 ms/f    | −48 s na captura; draw inflou sob carga contínua       |
| 2 jobs concorrentes, adaptativo | 34,5–35,2 ms/f | 18,9–19,6 ms/f        | ~0,0 ms/f    | Draw dobra vs. single; CPU saturada                    |

Outras medições:

- `requestFrame ≈ 0 ms/f` em todos os runs → **não há gargalo de readback GPU→CPU** (hipótese H3 descartada definitivamente).
- Vazamento do loop: com 2 jobs concorrentes, cada par levou ~252–294 s (≈126–147 s/arquivo efetivo) contra ~242 s de um arquivo sozinho antes → **throughput ≈ 1,8× com concurrency=2**, mas ao custo de CPU travada em ~100% e latência por arquivo ~2×.
- Uso de GPU durante tudo isso: 3D ≤ 6–10%, Copy ~2%, memória de vídeo ~1,9 GB.
- Matriz A/B/C/D de benchmark sintético (clipes curtos): melhor célula = hardware WebGL + libx264; AMF ~2× mais lento que libx264 no mux de clipes curtos (limitação: conteúdo longo não testado).
- Processamento de áudio (batch de 12 MP3s): 100% CPU por natureza (LAME/sharp/ffmpeg), GPU irrelevante nesta etapa.

## 4. Diagnóstico: por que a RX 7600 fica ociosa

A carga do loop de captura se decompõe em:

1. **Execução da cena em JavaScript** (`runtime.render(time, fps)`) — lógica de visualizador reativa ao áudio, interpolação de envelope, alocações por frame.
2. **Custo de CPU do ANGLE** — cada call WebGL é traduzida para D3D11; cenas 2D-ish com shaders triviais fazem pouco trabalho de fragmento, muito trabalho de tradução/submissão no CPU.
3. **Encode VP9 por software** (libvpx dentro do Chromium via MediaRecorder) — tipicamente o maior consumidor isolado de CPU na captura.
4. Serialização do main-thread do renderer (um frame por vez, mesmo com GPU livre).

Conclusão central: **o workload nunca foi limitado por shader**. Colocar o WebGL em "hardware" tirou o raster da CPU integrada e colocou na RX 7600, mas o que resta (1)+(2)+(3) é trabalho de CPU — por isso a GPU oscila entre 2% e 10% enquanto o processador satura. Nenhum ajuste de flags/pacing muda essa natureza; mudar a arquitetura de captura sim.

## 5. O que já foi entregue nesta branch (cortes incrementais validados)

| Corte                                | Commit                        | Entrega                                                                                                     |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Telemetria GPU nos 4 sites de render | `e0894cb`/`d8b64c0`/`a66450f` | Linha `GPU mode=... renderer="..."` visível                                                                 |
| Pipeline Profiler                    | `ea91d8c`                     | Linhas CAPTURE/RECORDER decompondo draw/requestFrame/pacing                                                 |
| Pacing adaptativo opt-in             | `6749833`                     | Espera = resto do orçamento de 32 ms/frame; −17% na captura single                                          |
| Preferências locais no modal         | `9fe723a`                     | GPU/pacing/encoder persistidos em `data/render-preferences.local.json`, sobrepondo env vars sem restart     |
| Detecção de capacidades              | `8099399`                     | `/api/system-capabilities`: CPU real, probe WebGL da GPU, encoders AMF/QSV/NVENC, recomendações automáticas |
| Painel de desempenho                 | `ee3d4f3`                     | mediana/p95 por etapa dos últimos jobs reais no modal                                                       |
| Crash logger                         | `c6f05dc`                     | stack + contexto em `.dev/crashes/*.log` antes de sair                                                      |

Estado: 368 testes verdes, build ok, zero mudança de comportamento sem opt-in.

## 6. Caminhos propostos (ordenados por alavancagem)

### 6.1 Substituir MediaRecorder por WebCodecs VideoEncoder com encode de hardware ⭐ principal

`VideoEncoder` (WebCodecs, habilitado por padrão no Chromium atual) expõe encoders de **hardware** da placa (no Windows/Media Foundation → blocos VCN da AMD: H.264, HEVC e **AV1** na RX 7600). Plano:

1. Na página de render: `VideoEncoder.isConfigSupported({ codec: 'avc1.640033'|'hev1...'|'av01...', hardwareAcceleration: 'prefer-hardware' })` para escolher o melhor disponível (sonda já existe como padrão no repo: `probe-recorder.mjs`).
2. Por frame: `new VideoFrame(canvas, { timestamp })` → `encoder.encode(frame)` — **elimina `captureStream(0)`, `requestFrame()` e o MediaRecorder** (e possivelmente a necessidade de `--disable-gpu-compositing`, devolvendo composição à GPU).
3. Mux dos chunks com um muxer JS leve (`mp4-muxer`) → MP4 intermediário → FFmpeg apenas re-encoda/insere áudio como hoje.
4. Fallback ladder: AV1 hw → HEVC hw → H.264 hw → pipeline atual (VP9 SW).

Impacto esperado: remove o item (3) — provavelmente o maior bloco de CPU — da equação e destrava captura mais rápida que tempo-real. Riscos: controle de bitrate/qualidade do encoder hw, timestamps monotônicos, color space (BT.709 tag), e validação de A/V sync pós-mux. Critério de sucesso: draw+pacing total < 60% do baseline; CPU do processo renderer < 40%; GPU Video Encode > 20% no Gerenciador de Tarefas.

### 6.2 Política de concorrência consciente de custo por frame

Dados mostram que `concurrency=2` dá ~1,8× throughput só quando o pacing adaptativo elimina as esperas — mas dobra a latência individual e satura o CPU (afeta responsividade do app durante exports). Sugestões:

- Expor concorrência de render nas preferências locais (hoje só env).
- Auto-tune: usar a própria telemetria (`draw ms/f` vs `target`) — se draw médio ≥ target com 1 job, não abrir segundo slot.

### 6.3 Redução de CPU por frame na cena

Perfilhar `runtime.render()` (node --cpu-prof no bundle da cena): cache de texturas/gradientes, evitar realocações no `lerpArrayInto` do envelope por frame, pré-cálculo de geometria estática. Ganho multiplicativo com qualquer encoder novo.

### 6.4 Reavaliar AMF em conteúdo longo

A matriz reprovou AMF em clipes de 2 s (custo fixo de setup domina). Em vídeos de minutos o trade-off inverte teoricamente; medir mux real de um job longo com `h264_amf -quality balanced` vs libx264.

### 6.5 Menores

- `OffscreenCanvas` em worker para desafogar main thread (complexidade alta, ganho incerto).
- Revisar flags de launch sob WebCodecs (composição GPU reativada pode reduzir cópias).

## 7. Experimento imediato sugerido (sonda WebCodecs)

Estender `.dev/gpu-plus/probe-recorder.mjs`: página Playwright que lista configs suportadas via `VideoEncoder.isConfigSupported` para avc1/hev1/av01 com `prefer-hardware`, codifica 300 frames de um canvas animado e reporta: tempo total, fps efetivo, `encoder.state`, tamanho de saída e uso de GPU/CPU do processo. Isso responde em ~30 min de trabalho se 6.1 tem pernas — antes de qualquer refactor do pipeline.

## 8. Apêndice — como reproduzir as medições

- Telemetria por job: linhas `GPU ...` / `CAPTURE ...` / `RECORDER ...` no console do servidor (`npm run dev`).
- Preferências: app → Configurações locais → Renderização (ou `data/render-preferences.local.json`; endpoints `GET/PUT /api/render-preferences`).
- Capacidades: `GET /api/system-capabilities`.
- Desempenho histórico: `GET /api/dev/benchmarks?workflow=1` ou modal → Renderização.

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

### 6.1 Substituir MediaRecorder por WebCodecs VideoEncoder com encode de hardware ⚠️ rebaixada após sonda (ver §7)

`VideoEncoder` (WebCodecs) existe e funciona nos builds usados, porém **nunca aciona o encoder de hardware da RX 7600 neste ambiente**: `prefer-hardware` cai silenciosamente para software (openh264) — provado pelo contador `engtype_VideoEncode` em 0% durante encodes longos, em todas as variantes testadas (canal chromium/msedge × headless/headed). A rota de hardware real acessível na máquina continua sendo o **`h264_amf` do FFmpeg** (API nativa AMD, já integrada ao estágio de mux).

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

## 7. Resultados da sonda WebCodecs (2026-08-24)

Sondas executadas localmente (scripts em `.dev/gpu-plus/probe-*.mjs`, gitignored). Configuração: 1080p, canvas animado, bitrate 12 Mbps.

### 7.1 Disponibilidade da API

| Binário                                                | `VideoEncoder`                                      | Observação                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Playwright headless shell (`chromium.launch()` padrão) | ausente em `about:blank`; **presente em `file://`** | API é `[SecureContext]` — e o renderer de produção carrega via `file://`, que É contexto seguro ✓ |
| Canal `chromium` (build completo) / `msedge`           | idem                                                | Comportamento idêntico                                                                            |

Causa-raiz do primeiro "undefined": avaliar a página em `about:blank` (não-seguro). Nada relacionado às flags de launch.

### 7.2 Encode real (300 frames, 1080p, 12 Mbps)

| Run                                | fps      | Saída                  | Nota                                                        |
| ---------------------------------- | -------- | ---------------------- | ----------------------------------------------------------- |
| h264 `prefer-hardware`             | 49–71    | 8 560 KB               | bytes idênticos ao sw → fallback silencioso                 |
| h264 software                      | 71,8     | 8 560 KB               | openh264                                                    |
| VP9 software (MediaRecorder atual) | 79–40,8* | ~4 900 KB              | baseline do pipeline                                        |
| AV1 software                       | 22–26    | 2 762 KB               | 3× menor que h264; lento                                    |
| HEVC hw (`prefer-hardware`)        | —        | "ok" no canal chromium | provavelmente também fallback (não verificado por contador) |

\* variação entre builds shell/completo.

### 7.3 Verificação definitiva por contador de GPU

Durante encode longo (1 500 frames @1080p, ~21 s) com `prefer-hardware`, amostrando `Win32_GPUEngine` a cada 500 ms:

| Variante          | `engtype_VideoEncode` máx | 3D máx | fps  |
| ----------------- | ------------------------- | ------ | ---- |
| chromium headless | **0%**                    | 9%     | 71   |
| msedge headless   | **0%**                    | 8%     | 86,6 |
| chromium headed   | **0%**                    | 9%     | 70,8 |
| msedge headed     | **0%**                    | 10%    | 84,5 |

**Conclusão: o bloco VCN da RX 7600 nunca é acionado pelo Chromium nesta máquina** — nem headless, nem headed, nem nos canais completos. O Media Foundation H.264/HEVC não é oferecido ao renderer (limitação conhecida de MFTs AMD com apps fora de whitelist, ou ausência de integração nesses builds). A via WebCodecs-hw fica registrada como inviável aqui; reavaliar apenas se o driver/integração mudar.

### 7.4 Achados colaterais úteis

- **Bisseção de flags**: no canal completo, `--disable-gpu-compositing` quebra até a _criação_ de encoders ("Encoder creation error"); sem ela, configure() "funciona" — mas caindo para software. As demais flags são neutras.
- `isConfigSupported({supported:true})` **não garante** hardware; só medição de contador (ou bytes idênticos entre pref/no-pref) revela o fallback.
- AV1-SW produz intermediário ~3× menor (menos I/O de flush), ao custo de ~2× menos throughput — possível troca se o gargalo passar a ser disco.

### 7.5 Implicações para os caminhos propostos

- §6.1 (WebCodecs hw): **inviável nesta máquina hoje**. Alternativa equivalente de hardware: usar o `h264_amf` já disponível no FFmpeg.
- Novo experimento prioritário (baixo custo): rodar jobs longos reais com preferência local `Codificador FFmpeg = Hardware` (AMF) e comparar o estágio `ffmpeg-mux` vs libx264 — dados do painel de desempenho já dão o baseline.
- §6.3 (CPU por frame na cena) sobe de prioridade: com o encode por software em qualquer cenário de captura, reduzir CPU/frame é a única alavanca durante a captura.

## 8. Apêndice — como reproduzir as medições

- Telemetria por job: linhas `GPU ...` / `CAPTURE ...` / `RECORDER ...` no console do servidor (`npm run dev`).
- Preferências: app → Configurações locais → Renderização (ou `data/render-preferences.local.json`; endpoints `GET/PUT /api/render-preferences`).
- Capacidades: `GET /api/system-capabilities`.
- Desempenho histórico: `GET /api/dev/benchmarks?workflow=1` ou modal → Renderização.

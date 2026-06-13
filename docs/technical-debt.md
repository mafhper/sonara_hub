# Debitos tecnicos

> O backlog completo do projeto é um documento privado de trabalho e não fica no
> Git. Este arquivo público registra apenas dívidas técnicas estáveis.

## Benchmark de render longo

Existe um benchmark automatizado curto para render/export em
`tests/render-benchmark.mjs`, executado por:

```powershell
npm run bench:render
npm run bench:render -- --audio=input
```

Ele registra historico local em `.dev/bench/` e mede tempo total, preparo
Chromium/runtime, captura Canvas, MediaRecorder/WebM, validacao WebM, mux
FFmpeg, validacao MP4, tamanhos de saida, pico de RSS e retries WebGL.

O debito restante e criar uma matriz longa dedicada antes de qualquer tentativa
de aceleracao da captura deterministica do canvas.

O benchmark longo deve ampliar:

- tempo total por resolucao, duracao, preset, waveform e quantidade de camadas;
- calibracao por fase para captura Canvas, MediaRecorder/WebM, mux ffmpeg,
  validacao e memoria;
- diferenca entre perfis `Rapido`, `Automatico` e `Final`;
- impacto em lote, principalmente em 1080p, 2K e 4K.

Qualquer otimizacao deve preservar a paridade entre previa e exportacao e manter
a validacao de WebM/MP4 antes de liberar o arquivo final.

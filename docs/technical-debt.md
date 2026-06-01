# Debitos tecnicos

## Benchmark de render longo

O render longo ainda precisa de um benchmark dedicado antes de qualquer tentativa
de aceleracao da captura deterministica do canvas.

O benchmark deve medir:

- tempo total por resolucao, duracao, preset, waveform e quantidade de camadas;
- custo separado de captura Canvas/WebM, mux ffmpeg e validacao de audio;
- diferenca entre perfis `Rapido`, `Automatico` e `Final`;
- impacto em lote, principalmente em 1080p, 2K e 4K.

Qualquer otimizacao deve preservar a paridade entre previa e exportacao e manter
a validacao de WebM/MP4 antes de liberar o arquivo final.

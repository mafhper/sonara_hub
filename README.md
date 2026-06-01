# Sonara Hub

Ferramenta local com dois workspaces compartilhados. A `Biblioteca de audio`
analisa MP3s, revisa tags, letras e capas e gera copias tratadas. O `Estudio
visual` transforma as faixas em videos ambientes prontos para publicacao,
combinando cena suave, ate tres camadas enviadas, waveform opcional e textos
discretos em um unico canvas compartilhado pela previa e pela exportacao.

## Executar

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`.

## Fluxo

1. Abra uma pasta de musicas ou adicione um arquivo.
2. Na `Biblioteca de audio`, revise as sugestoes, analise loudness e margem de
   pico e gere copias MP3 tratadas em `Tratados/`.
3. Ajuste capa, letra manual e pacote ID3. A serie numerada permite gerar artes
   relacionadas por faixa.
4. No `Estudio visual`, escolha uma das seis familias visuais: fluxo liquido,
   nuvens amplas, aurora, aura vetorial, vinil ou tela escura.
5. Escolha uma das cinco waveforms opcionais, adicione imagens, SVGs seguros ou
   videos curtos em loop e exporte em 720p, 1080p, 2K ou 4K. Cada MP4 recebe um
   sidecar `.youtube.json`.

O projeto usa autosave local em IndexedDB e preserva handles autorizados de pastas quando o navegador permite. `outputs/` funciona como fallback privado para os arquivos finais.

## Validacao

```powershell
npm run format:check
npm run type-check
npm test
npm run build
npm run test:ui
npm run test:render
```

O gate de supply chain usa `npm ci --ignore-scripts`. Antes de executar testes
locais de audio ou render depois desse gate, restaure o binario confiavel:

```powershell
npm rebuild ffmpeg-static
```

Antes de gerar um candidato a release, mantenha `npm run dev` ativo e execute:

```powershell
npm run test:release
```

O escopo completo e a matriz exploratoria da `v1.0.0` estao em
[`docs/release-test-bench.md`](docs/release-test-bench.md).

Debitos tecnicos acompanhados ficam em
[`docs/technical-debt.md`](docs/technical-debt.md).

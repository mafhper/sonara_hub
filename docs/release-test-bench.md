# Banco de testes da v1.0.0

Este banco organiza a validacao do Sonara Hub por risco. O gate completo deve
ser executado localmente com o app aberto por `npm run dev` antes de gerar um
candidato a release:

```powershell
npm run test:release
```

## Niveis

| Nivel         | Quando executar  | Escopo                                            |
| ------------- | ---------------- | ------------------------------------------------- |
| PR            | A cada alteracao | formatacao, tipos, testes unitarios e build       |
| Release local | Antes de uma tag | PR + smoke UI + smoke de render                   |
| Exploratorio  | Antes da v1.0.0  | jornadas completas, pastas reais e revisao visual |

## Cobertura automatizada atual

| Area              | Teste                                                                   | Nivel         |
| ----------------- | ----------------------------------------------------------------------- | ------------- |
| Contratos visuais | normalizacao V4, compatibilidade V3 e descarte de efeitos legados       | PR            |
| Presets locais    | criar, atualizar, excluir e rejeitar IDs invalidos                      | PR            |
| API local         | retry controlado e mensagem acionavel durante reinicio do servidor      | PR            |
| Biblioteca MP3    | inferencia, pacote ID3 limpo, APIC, USLT, capas numeradas e margem      | PR            |
| Envelope de audio | energia, graves, medios, agudos, 64 amostras e 24 bandas espectrais     | PR            |
| Exportacao WebGL  | cabecalho WebM, frames deterministas, CFR e mux com escala              | PR            |
| Perfis de render  | interno 720p/1080p, 2K/4K final e FPS por perfil                        | PR            |
| UI principal      | audio real, seek, camadas PNG/SVG/video, undo, waveform, lote e paineis | Release local |
| Variações         | trocar audio, aguardar autosave, recarregar e manter a segunda versao   | Release local |
| Renderizadores    | nove familias em 720p e amostras adicionais 1080p, 2K e 4K              | Release local |
| Waveforms         | cinco estilos decorativos em 720p e controles contextuais               | Release local |

## Jornadas obrigatorias

As jornadas abaixo devem ganhar scripts Playwright dedicados conforme forem
estabilizadas. Ate la, devem ser executadas manualmente em cada candidato.

| ID  | Jornada                                                   | Aceite                                                                                 |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| J01 | Faixa unica com capa, metadados, visual, waveform e texto | MP4 abre no ffmpeg; sidecar contem titulo, tags, visual e capa                         |
| J02 | Variacao com outro audio                                  | reload preserva a versao; MP4 usa o audio alternativo                                  |
| J03 | Lote com album, artista e visual herdados                 | uma saida por faixa; sobrescritas permanecem isoladas                                  |
| J04 | Tela escura com audio                                     | MP4 valido; movimento minimo; waveform opcional                                        |
| J05 | Tres camadas PNG, SVG seguro e video em loop              | ordem, visibilidade, transformacoes, sombra, blend e undo persistem                    |
| J06 | SVG inseguro                                              | scripts, eventos, `foreignObject` e referencias externas sao rejeitados                |
| J07 | Pasta de trabalho e pasta de saida                        | picker nativo, permissao expirada e fallback privado funcionam                         |
| J08 | Reinicio da API durante uso                               | retry recupera leituras; falhas mutaveis exibem mensagem clara sem duplicar exportacao |
| J09 | Preset personalizado                                      | duplicar, salvar, recarregar e excluir preservam apenas atmosfera e waveform           |
| J10 | Sidecar YouTube                                           | privacidade, idioma, data, midia sintetica, descricao e tags correspondem a UI         |
| J11 | Biblioteca MP3 individual                                 | analise informa margem reduzida sem afirmar clipping; copia tratada valida APIC e USLT |
| J12 | Biblioteca MP3 em lote                                    | dados comuns, capas I-V, nomes finais e status permanecem concisos                     |
| J13 | Sobrescrita explicita                                     | confirmacao cria backup antes de alterar o original                                    |
| J14 | Normalizacao opcional                                     | copia A/B converge para -14 LUFS e pico abaixo de -1 dBTP                              |

## Matriz de exportacao

O smoke rapido cobre todas as familias em 720p. Antes da v1.0.0, manter pelo
menos uma amostra decodificavel para cada combinacao de maior risco:

| Caso | Visual          | Resolucao | Perfil     | Composicao                       |
| ---- | --------------- | --------- | ---------- | -------------------------------- |
| E01  | Fluxo liquido   | 4K        | Rapido     | SVG, waveform, texto e capa      |
| E02  | Nuvens amplas   | 2K        | Automatico | foco solar, vídeo em loop e lote |
| E03  | Aurora          | 4K        | Final      | audio reativo                    |
| E04  | Aura vetorial   | 1080p     | Final      | tres camadas e sombra            |
| E05  | Vinil           | 1080p     | Final      | capa central e RPM               |
| E06  | Tela escura     | 720p      | Rapido     | apenas audio                     |
| E07  | Formas lúdicas  | 1080p     | Final      | coleções temáticas e emojis      |
| E08  | Mesh colorido   | 1080p     | Automático | paleta infantil e áudio reativo  |
| E09  | Faixas de piano | 720p      | Rápido     | bandas amplas e deriva suave     |

Cada MP4 deve ser validado com ffmpeg e conferido por largura, altura, FPS,
duracao, stream de audio e tolerancia de duracao. O sidecar deve ser lido como
JSON e comparado com o snapshot enviado para renderizacao.

## Revisao visual

Capturar uma imagem por familia em desktop e uma imagem da interface estreita.
Reprovar cenas com particulas pequenas, grao visivel, baixo contraste de texto,
camadas cortadas sem intencao ou sobreposicao de controles. Comparar os pixels
de dois frames para confirmar movimento nos efeitos animados.

## Performance

Registrar tempo total e tamanho do MP4 para J01, J03 e E01. Alertar quando o
tempo aumentar mais de 25% sem justificativa ou quando um lote curto produzir
arquivos com FPS irregular.

## Antes da tag

1. Executar `npm ci --ignore-scripts`, `npm audit signatures` e
   `npm audit --audit-level=high`. Como `ffmpeg-static` baixa o binario no
   script de instalacao, executar `npm rebuild ffmpeg-static` antes dos testes
   locais de audio e render.
2. Executar `npm run test:release` com `npm run dev` ativo.
3. Executar J01-J10 e E01-E09.
4. Revisar `git status` e o diff para excluir arquivos pessoais, `.env`,
   `.dev/`, `outputs/` e dados locais.
5. Registrar artefatos, tempos e riscos aceitos no candidato a release.

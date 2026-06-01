# Sonara Hub

Sonara Hub é um estúdio local para preparar músicas e criar vídeos ambientes
prontos para publicação. Ele conecta duas etapas que normalmente ficam
espalhadas entre várias ferramentas: organizar o pacote de áudio e compor a
presença visual de cada faixa.

## Experiência principal

### Biblioteca de áudio

Abra uma pasta de músicas, revise as sugestões encontradas nos arquivos e
prepare cópias MP3 tratadas. A biblioteca permite editar tags ID3, capas e
letras, analisar loudness e pico verdadeiro, aplicar dados comuns a um álbum e
acompanhar lotes sem alterar os originais por padrão.

### Estúdio visual

Transforme cada faixa em um vídeo com movimento suave. Escolha uma cena,
personalize cores e reação musical, adicione até três camadas de mídia, ajuste
waveform e texto e confira a grade de publicação antes de exportar.

O mesmo runtime visual alimenta prévia e exportação para manter o resultado
final próximo do que aparece no editor.

## Cenas visuais

O catálogo é curado para funcionar como fundo de tela para música:

- Atmosferas amplas: fluxo líquido, nuvens com foco solar opcional, aurora e
  aura vetorial.
- Composições: vinil reativo com capa e tela escura para áudio.
- Cenas leves: formas lúdicas, mesh colorido e faixas de piano.

`Formas lúdicas` combina retângulos, letras, números e emojis em movimentos
amplos. As categorias podem ser ligadas isoladamente e as coleções podem ser
personalizadas para projetos temáticos.

## Fluxo de álbum

1. Abra uma pasta ou adicione faixas avulsas.
2. Revise metadados, arte, letra e análise técnica na `Biblioteca de áudio`.
3. Gere cópias tratadas em `Tratados/`.
4. Confira a página de catálogo e a grade de vídeos.
5. No `Estúdio visual`, aplique cenas, capas, camadas, texto e waveform.
6. Exporte em `720p`, `1080p`, `2K` ou `4K`.

Cada vídeo pode gerar um sidecar `.youtube.json` para apoiar a publicação.

## Executar localmente

```powershell
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`.

O repositório também inclui um promo-site separado:

```powershell
npm run site:dev
```

## Documentação

- [Desenvolvimento e validação](docs/development.md)
- [Banco de testes da v1.0.0](docs/release-test-bench.md)
- [Débitos técnicos](docs/technical-debt.md)

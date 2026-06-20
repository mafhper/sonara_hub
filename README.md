<p align="center">
  <img src="public/brand/sonara-lockup-art.jpg" alt="Sonara Hub" width="440" />
</p>

<p align="center">
  <em>Estúdio local para transformar seus álbuns em vídeos ambientes prontos para publicar.</em>
</p>

---

Sonara Hub é um estúdio criativo que roda **na sua máquina** e une, num fluxo só,
duas etapas que normalmente ficam espalhadas por várias ferramentas:
**organizar o pacote de áudio** e **criar a presença visual** de cada faixa —
sem uploads, sem contas e sem depender da nuvem.

## O que você consegue fazer

- **Biblioteca de áudio** — abra uma Pasta de Entrada, escolha o projeto/álbum,
  revise tags ID3, capas, letras, descrição de publicação, análise técnica e
  gere cópias MP3 tratadas sem alterar os originais.
- **Catálogo e capas** — confira o álbum como coleção, escolha artes detectadas
  na pasta, defina uma capa compartilhada do álbum, mantenha overrides por
  faixa, gere capas em série e ajuste textos complementares por faixa ou por
  série.
- **Estúdio visual** — navegue por cenas animadas em um browser de presets com
  categorias, variantes, paletas, tags e tier de performance; combine camadas de
  mídia, waveform, capa, textos e fade individual de capa/textos. A prévia e a
  exportação usam a mesma composição efetiva.
- **Fila de vídeos** — revise as faixas, escolha Pasta de Saída, política de
  backup/sobrescrita e exporte vídeos em 720p ou 1080p com sidecar
  `.youtube.json`.
- **Divulgação** — gere imagens, clips curtos e manifestos JSON/Markdown para
  publicação do álbum usando, preferencialmente, os ajustes visuais já criados
  no vídeo.
- **Podcast experimental** — habilite a guia de Podcast por workspace para
  agrupar episódios, revisar metadados de feed, aplicar escolhas de
  processamento voltadas para voz e exportar RSS/sidecar.
- **Acessibilidade e temas** — escolha tema original, claro, escuro ou golden e
  ajuste a escala da interface para melhorar leitura e toque em sessões longas.

## Veja em ação

### Estúdio visual

![Estúdio visual do Sonara Hub](media/readme/app-visual-studio.webp)

Cada faixa vira um vídeo com movimento suave: escolha a cena, ajuste cores,
camadas, waveform e texto — tudo com prévia ao vivo.

### Catálogo do álbum

![Catálogo planejado no Sonara Hub](media/readme/app-catalog.webp)

Veja o álbum como uma página antes de exportar: capa, lista de faixas, tags e a
série de capas geradas.

## Cenas visuais

Um catálogo curado para funcionar como fundo de tela para música, todas com
cores, intensidade e reação ao áudio ajustáveis:

- **Atmosferas** — fluxo líquido, nuvens com foco solar, aurora e aura vetorial.
- **Atmosferas V5** — `stratosphere-flight`, `shambhala-passage`,
  `neural-haze` e `light-trails`, famílias originais inspiradas em linguagem
  WebGL pública, mas implementadas sem copiar código de terceiros.
- **Shaders** — plasma, vórtice, estrelas, bloom iridescente, volume fluido e
  efeitos WebGL com resposta musical limitada por design.
- **Composições** — vinil com reação musical discreta, tela escura para áudio e
  cenas ilustradas com controles de posição mais previsíveis.
- **Cenas leves** — formas lúdicas, mesh colorido e faixas de piano redesenhadas
  para parecerem mais musicais e menos abstratas.

## Qualidade e benchmark

O Sonara Hub já tem uma trilha de testes e benchmark para acompanhar qualidade,
performance e degradação ao longo do desenvolvimento:

- `npm test` cobre regras compartilhadas, metadados, capas, letras, exportação,
  armazenamento e validações do pipeline.
- `npm run test:ui` cobre fluxos principais da interface, incluindo Pasta de
  Entrada, projetos, catálogo, vídeo e divulgação.
- `npm run test:flow` executa um fluxo completo curto com áudio, capa, camada,
  texto, fade, sidecar e validação do vídeo final.
- `npm run test:render` valida rapidamente presets representativos no renderer
  WebGL em uma matriz curta.
- `npm run test:render:full` executa a matriz completa de presets e resoluções
  de render.
- `npm run site:build` e `npm run site:test` validam o promo-site publicado via
  GitHub Pages.
- `npm run test:scale` valida o comportamento de catálogo, presets, histórico e
  lifecycle de Object URLs em um projeto sintético com 120 faixas.
- `npm run bench:render` serve como referência local para comparar tempo,
  tamanho de saída e comportamento do render/export entre rodadas.
- `npm run bench:render:full` amplia a matriz de casos, e
  `npm run bench:render:audio` usa áudio da pasta `input/` quando disponível.

Sem baseline suficiente, o benchmark é tratado como referência inicial, não como
prova de regressão. A ideia é acumular dados para saber quando o projeto está
saudável, degradando ou pedindo nova instrumentação.

## Trilha de desenvolvimento

- **2K e 4K estão previstos.** Eles saíram da trilha ativa por enquanto porque
  estou sem uma GPU decente para desenvolver e validar esses presets com
  segurança. Assim que isso se resolver, a trilha de resoluções maiores volta.
- **Desktop virá depois da base estável.** Quando a plataforma estiver funcional
  e estável como app local, o próximo passo será começar o porte para uma
  aplicação desktop.
- **Internacionalização do app está na trilha.** O promo-site já detecta idioma
  automaticamente e publica copy em pt-BR, inglês e espanhol; o app principal
  deve seguir esse padrão em uma rodada dedicada, porque isso toca praticamente
  toda a superfície de UI.
- **Prioridade atual: funcionalidade basal.** Não vou gastar energia escovando
  bits em detalhes que uma versão desktop nativa deve resolver melhor; primeiro
  preciso garantir que o fluxo essencial funciona bem.

## Como funciona

1. Abra uma pasta de músicas (ou adicione faixas avulsas).
2. Revise metadados, arte, letra e análise técnica na **Biblioteca de áudio**.
3. Gere as cópias tratadas e confira a página de catálogo.
4. No **Estúdio visual**, aplique cenas, capas, camadas, texto e waveform.
5. Exporte vídeos e, se quiser, gere assets de divulgação a partir da mesma
   identidade visual.

## O site do projeto

![Site de apresentação do Sonara Hub](media/readme/promo-hero.webp)

Há um site de apresentação com a proposta, telas do estúdio e uma experiência
interativa para testar atmosferas visuais. O site detecta automaticamente a
preferência de idioma do navegador e oferece conteúdo em **pt-BR**, **inglês**
e **espanhol**:
**[mafhper.github.io/sonara_hub](https://mafhper.github.io/sonara_hub/)**.

## Como rodar

> O Sonara Hub será distribuído como **instalador desktop** em breve. Por
> enquanto, ele roda a partir do código-fonte, seguindo os passos abaixo.

### 1. Pré-requisitos

- **Node.js 22 ou superior** (já inclui o `npm`) — baixe em
  [nodejs.org](https://nodejs.org/). Confira a instalação com `node -v`.
- **Git** para clonar o repositório — [git-scm.com](https://git-scm.com/).

### 2. Baixar o projeto

Clone o repositório e entre na pasta:

```bash
git clone https://github.com/mafhper/sonara_hub.git
cd sonara_hub
```

> Alternativa sem Git: baixe o ZIP em **Code → Download ZIP** na página do
> repositório e extraia.

### 3. Instalar os pacotes

```bash
npm ci
```

Isso instala todas as dependências exatamente como travadas no
`package-lock.json`. A instalação também baixa o **FFmpeg** (via
`ffmpeg-static`) e o navegador usado na exportação de vídeo — por isso pode
levar alguns minutos na primeira vez. (Se preferir uma instalação mais
tolerante a atualizações, use `npm install`.)

### 4. Rodar o aplicativo

```bash
npm run dev
```

Esse comando sobe os dois processos do app de uma vez:

- a **interface** (cliente) em `http://127.0.0.1:5173`;
- o **servidor local** (API de áudio, capas e exportação) em
  `http://127.0.0.1:4175`.

Abra **`http://127.0.0.1:5173`** no navegador e use o Sonara Hub. Para encerrar,
pressione `Ctrl+C` no terminal.

### 5. Gerar o build de produção (opcional)

Para compilar a interface otimizada (gerada em `dist/`):

```bash
npm run build
```

O `build` também roda a verificação de tipos (`type-check`). Para servir apenas
o servidor local (sem o modo de desenvolvimento da interface), use
`npm start`.

### Site de apresentação

O repositório inclui um site de apresentação separado, na pasta `site/`:

```bash
npm run site:dev    # desenvolvimento
npm run site:build  # build estático em site/dist
npm run site:test   # smoke test do site compilado
```

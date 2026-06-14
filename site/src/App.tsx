import {
  createContext,
  type ReactElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import auroraWave from "./assets/aurora-wave.webp";
import heroAmbient from "./assets/hero-ambient.webp";
import heroCoverAzul from "./assets/hero-cover-azul.webp";
import heroCoverBeauty from "./assets/hero-cover-beauty.webp";
import heroCoverJardim from "./assets/hero-cover-jardim.webp";
import liquidFlow from "./assets/liquid-flow.webp";
import shotAudioLibrary from "./assets/shot-audio-library.webp";
import shotAzulFrame from "./assets/shot-azul-frame.webp";
import shotAzulVisual from "./assets/shot-azul-visual.webp";
import shotCatalog from "./assets/shot-catalog.webp";
import shotJardimCatalog from "./assets/shot-jardim-catalog.webp";
import shotVideoGrid from "./assets/shot-video-grid.webp";
import shotVisualStudio from "./assets/shot-visual-studio.webp";

const GITHUB_URL = "https://github.com/mafhper/sonara_hub";
const BRAND_MARK_URL = `${import.meta.env.BASE_URL}brand/sonara-mark.svg`;

type IconProps = {
  className?: string;
};

type WorkspaceCardProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  features: string[];
  tone: "audio" | "visual";
};

type Principle = {
  label: string;
  title: string;
  body: string;
  icon: (props: IconProps) => ReactElement;
};

type Locale = "pt-BR" | "en" | "es";
type AtmosphereLabId =
  | "stratosphere-flight"
  | "shambhala-passage"
  | "neural-haze"
  | "light-trails";
type AtmospherePaletteId = "dawn" | "prism" | "nocturne";

const supportedLocales: Locale[] = ["pt-BR", "en", "es"];
const atmosphereLabIds: AtmosphereLabId[] = [
  "stratosphere-flight",
  "shambhala-passage",
  "neural-haze",
  "light-trails",
];
const atmospherePaletteIds: AtmospherePaletteId[] = [
  "dawn",
  "prism",
  "nocturne",
];
const atmospherePaletteColors: Record<AtmospherePaletteId, string[]> = {
  dawn: ["#0b1720", "#3d7f91", "#f0bf74", "#f6e0b4"],
  prism: ["#090a12", "#7ccfce", "#d69d54", "#c9dbff"],
  nocturne: ["#06070b", "#1b2440", "#6d7fc8", "#e7ecff"],
};

const siteCopy = {
  "pt-BR": {
    header: {
      aria: "Navegação do site",
      home: "Início do Sonara Hub",
      primary: "Navegação principal",
      nav: {
        workspaces: "Workspaces",
        visualSystem: "Visuais",
        workflow: "Fluxo",
        releaseFormats: "Publicação",
        roadmap: "Rota futura",
      },
    },
    hero: {
      status: "Estúdio local-first em desenvolvimento ativo",
      title: "Prepare, organize e visualize sua música.",
      body: "Sonara Hub é um estúdio criativo local-first para músicos independentes, selos e narradores. Trate áudio, construa capas de álbum, navegue por atmosferas visuais e exporte materiais prontos para publicação sem uploads, contas ou dependência de nuvem.",
      actions: {
        github: "Ver no GitHub",
        download: "Download em breve",
      },
    },
    showcase: {
      descriptors: {
        cover: "Capa de álbum",
        screen: "Dentro do app",
        video: "Exportado para YouTube",
      },
      cards: {
        beauty: "The Beauty of Almost",
        visualStudio: "Estúdio visual",
        musicVideo: "Vídeo musical",
        azul: "Azul de Roda",
        albumCatalog: "Catálogo do álbum",
        jardim: "Jardim dos Ventos",
      },
    },
    strip: [
      "Local first",
      "Privacidade por design",
      "Sem uploads",
      "Fluxo de álbum",
      "Browser visual",
      "Capas compartilhadas",
      "Podcast experimental",
      "Escala de UI acessível",
      "Open source",
    ],
    story: {
      label: "O problema",
      title: "Publicar um disco não deveria exigir costurar seis utilitários.",
      paragraphs: [
        "Criadores independentes costumam alternar entre editores de tag, ferramentas de loudness, utilitários de capa, geradores de vídeo e checklists de publicação. Cada etapa funciona, mas o fluxo fica fragmentado.",
        "Sonara Hub transforma essa cadeia em um workspace local: prepare o áudio, organize a identidade do álbum e construa uma atmosfera visual capaz de carregar vídeos, séries de capas e formatos futuros de publicação.",
      ],
    },
    workspaces: {
      label: "Dois workspaces",
      title: "O áudio vira visual sem sair do estúdio.",
      body: "A mesma pasta, metadados e decisões de capa alimentam a exportação visual. Sem retrabalho, sem uma etapa de publicação desconectada.",
      audio: {
        eyebrow: "01 - Biblioteca de áudio",
        title: "Prepare o disco.",
        description:
          "Importe pastas, analise qualidade de MP3, revise tags ID3, gerencie letras, escolha capas compartilhadas e gere cópias tratadas antes da publicação.",
        features: [
          "Metadados e letras",
          "Capas compartilhadas e por faixa",
          "Revisão de loudness e pico",
          "Tratamento em lote",
          "Metadados de podcast opt-in",
        ],
      },
      visual: {
        eyebrow: "02 - Estúdio visual",
        title: "Construa a atmosfera.",
        description:
          "Crie visualizers ambientes com mídia em camadas, tratamentos de waveform, textos de série de capa e um browser compacto para famílias de movimento curadas.",
        features: [
          "Cenas ambientes",
          "Browser de presets e variantes",
          "Mídia em camadas",
          "Estilos de waveform",
          "Sidecars prontos para YouTube",
          "Séries de capa e texto",
        ],
      },
    },
    visualSystem: {
      label: "Sistema visual",
      title: "Atmosferas agora são navegadas, não adivinhadas.",
      body: "A lista plana de presets está evoluindo para um browser compacto com categorias, variantes, amostras de cor, tags e tiers de performance. Presets de estilo ficam separados dos controles de posição, então a escolha visual fica mais clara e mais segura para reutilizar.",
      atmospheres: {
        label: "Atmosferas V5",
        title: "Novas famílias, resposta ao áudio mais calma.",
        body: "Vinil, faixas de piano e cenas ilustradas foram ajustadas para reagir com intenção. As novas famílias WebGL ampliam a variedade sem copiar código público de shaders ou deixar a música dirigir movimentos descontrolados.",
        aria: "Exemplos de novas atmosferas visuais",
        items: [
          [
            "Stratosphere flight",
            "Paralaxe aérea lenta para lançamentos cinematográficos.",
          ],
          [
            "Shambhala passage",
            "Arquitetura simétrica de luz com resposta musical contida.",
          ],
          [
            "Neural haze",
            "Contornos orgânicos suaves para movimento ambiente discreto.",
          ],
          ["Light trails", "Rastros luminosos com movimento sem caos visual."],
        ],
      },
      themes: {
        label: "Temas",
        title: "Temas de interface e escala de UI.",
        body: "Temas original, claro, escuro e golden se combinam com preferências de escala de UI para criadores que precisam de controles maiores e leitura mais forte em sessões longas de revisão.",
      },
      covers: {
        label: "Capas",
        title: "Capa do álbum primeiro, override por faixa quando precisar.",
        body: "A arte do álbum pode ser compartilhada pela série enquanto faixas individuais mantêm um caminho de override. O texto da série usa controles diretos de posição com alinhamento acompanhando o ponto escolhido.",
      },
      lab: {
        label: "Laboratório de atmosferas",
        title: "Experimente o clima antes de abrir o app.",
        body: "A prévia abaixo é uma versão leve para o site: ela não substitui o renderer do Sonara Hub, mas mostra como as novas famílias variam em paleta, movimento e intensidade.",
        previewAria: "Prévia interativa da atmosfera selecionada",
        controls: {
          atmosphere: "Atmosfera",
          palette: "Paleta",
          motion: "Movimento",
          intensity: "Intensidade",
        },
        palettes: {
          dawn: "Amanhecer",
          prism: "Prisma",
          nocturne: "Noturno",
        },
        presets: {
          "stratosphere-flight": {
            name: "Stratosphere flight",
            description:
              "Céu em camadas, horizonte suave e deslocamento lento.",
            tags: ["céu", "paralaxe", "cinema"],
          },
          "shambhala-passage": {
            name: "Shambhala passage",
            description: "Portal simétrico com luz dourada e pulso contido.",
            tags: ["portal", "simetria", "luz"],
          },
          "neural-haze": {
            name: "Neural haze",
            description: "Contornos orgânicos, névoa calma e pouca distração.",
            tags: ["orgânico", "névoa", "calmo"],
          },
          "light-trails": {
            name: "Light trails",
            description:
              "Rastros luminosos com curvas largas e energia controlada.",
            tags: ["rastro", "movimento", "brilho"],
          },
        },
      },
    },
    workflow: {
      label: "Fluxo",
      title: "Um lançamento, cinco movimentos claros.",
      body: "O produto acompanha a direção natural do criador: de músicas brutas para um pacote audiovisual pronto para publicação.",
      steps: [
        ["01", "Importar", "Abra uma pasta e preserve os arquivos originais."],
        ["02", "Preparar", "Revise tags, letras, capas e qualidade técnica."],
        [
          "03",
          "Organizar",
          "Confirme o álbum como catálogo antes do tratamento.",
        ],
        [
          "04",
          "Visualizar",
          "Navegue por atmosferas, variantes, waveform, camadas e texto.",
        ],
        [
          "05",
          "Publicar",
          "Gere vídeos, sidecars, assets de divulgação e feeds experimentais de podcast.",
        ],
      ],
    },
    releaseFormats: {
      label: "Experimentos de publicação",
      title:
        "Lançamentos musicais, assets visuais e feeds de podcast compartilham a mesma fonte.",
      body: "O produto ainda se concentra em áudio e vídeo ambiente, mas a superfície de lançamento está crescendo: temas de encarte, manifestos promocionais e exportações RSS de podcast são moldados a partir do mesmo projeto local.",
      cards: [
        {
          label: "Núcleo estável",
          title: "Áudio, capas e vídeos",
          body: "Trate MP3s, revise metadados, monte a identidade do catálogo e exporte vídeos atmosféricos com sidecars de YouTube.",
        },
        {
          label: "Camada em crescimento",
          title: "Assets promocionais e encartes",
          body: "Gere manifestos de publicação e assets visuais temáticos que herdam a identidade do álbum em vez de começar uma campanha do zero.",
        },
        {
          label: "Experimental",
          title: "Workspace de podcast",
          body: "Ferramentas opt-in de podcast agrupam episódios, preservam metadados de feed, aplicam escolhas de processamento para voz e exportam RSS/sidecars.",
        },
      ],
    },
    screenshots: {
      label: "Dentro do Sonara",
      title: "Um instrumento, não um dashboard.",
      body: "Capturas reais do estúdio carregado com um álbum: as mesmas superfícies escuras e ritmo editorial conduzidos de ponta a ponta.",
      slots: [
        {
          title: "Biblioteca de áudio",
          caption:
            "Revisão em lote, tags, capa compartilhada e status de processamento.",
        },
        {
          title: "Prévia de catálogo",
          caption:
            "Uma página de disco para confirmar identidade de álbum e capas em série.",
        },
        {
          title: "Grade de vídeo",
          caption:
            "Miniaturas em estilo YouTube antes de renderizar a série visual.",
        },
        {
          title: "Estúdio visual",
          caption:
            "Um canvas dominante com inspetores focados e variantes de presets.",
        },
      ],
    },
    principles: {
      label: "Princípios",
      title: "Feito para posse, não dependência.",
      items: [
        {
          label: "Local first",
          title: "Seus arquivos ficam na sua máquina.",
          body: "Sonara trabalha com pastas no disco e mantém sessões locais privadas por padrão.",
        },
        {
          label: "Privacidade por design",
          title: "Sem contas ou uploads obrigatórios.",
          body: "O produto é desenhado para posse, não lock-in de nuvem ou processamento remoto.",
        },
        {
          label: "Foco em criadores",
          title: "Construído em torno da preparação de lançamento.",
          body: "Metadados, arte, letras, checagens de áudio, visuais e sidecars de publicação são tratados como um fluxo único.",
        },
        {
          label: "Acessível por padrão",
          title: "Temas legíveis e UI escalável.",
          body: "Temas, controles por teclado, foco claro e opções de escala maior fazem parte da superfície do produto.",
        },
        {
          label: "Open source",
          title: "Transparente enquanto cresce.",
          body: "O repositório é público, as arestas ficam visíveis e contribuições são bem-vindas.",
        },
      ],
    },
    openSource: {
      label: "Open source",
      title: "Uma pequena ferramenta de estúdio, construída em público.",
      body: "Sonara Hub é desenvolvido publicamente no GitHub. O repositório, testes, issues e caminho de release ficam visíveis enquanto o MVP amadurece rumo a uma aplicação Windows.",
      follow: "Acompanhar desenvolvimento",
      codeAria: "Comandos de desenvolvimento local",
      code: `git clone https://github.com/mafhper/sonara_hub
cd sonara_hub
npm ci
npm run dev

workspace: Biblioteca de audio
workspace: Estudio visual
experimento: Podcast RSS
visuais: browser de presets + V5
storage: autosave local`,
    },
    roadmap: {
      label: "Rota futura",
      title:
        "Um workspace completo de publicação para criadores independentes.",
      body: "Preparação de áudio e vídeo ambiente são a fundação. A próxima fase avança para um app Windows dedicado, publicação de podcast mais rica, catálogo mais profundo, mais famílias visuais e validação em resoluções maiores preservando o núcleo local-first.",
      aria: "Trilha futura de aperfeiçoamento",
      items: [
        "Empacotamento desktop para Windows",
        "Internacionalização do app em pt-BR, inglês e espanhol",
        "Publicação de podcast mais rica",
        "Mais famílias originais de atmosferas",
        "Validação 2K e 4K quando o hardware permitir",
      ],
    },
    finalCta: {
      title: "Crie a trilha sonora.",
      accent: "Construa a atmosfera.",
      github: "Ver no GitHub",
      follow: "Acompanhar desenvolvimento",
    },
    footer: {
      home: "Início do Sonara Hub",
      project: "Projeto open-source",
    },
  },
  en: {
    header: {
      aria: "Site navigation",
      home: "Sonara Hub home",
      primary: "Primary navigation",
      nav: {
        workspaces: "Workspaces",
        visualSystem: "Visuals",
        workflow: "Workflow",
        releaseFormats: "Publishing",
        roadmap: "Roadmap",
      },
    },
    hero: {
      status: "Local-first studio in active development",
      title: "Prepare, organize and visualize your music.",
      body: "Sonara Hub is a local-first creative studio for independent musicians, labels and storytellers. Treat audio, shape album artwork, browse curated atmospheres, and export publication-ready visuals without uploads, accounts or lock-in.",
      actions: {
        github: "View on GitHub",
        download: "Download soon",
      },
    },
    showcase: {
      descriptors: {
        cover: "Album cover",
        screen: "Inside the app",
        video: "Exported to YouTube",
      },
      cards: {
        beauty: "The Beauty of Almost",
        visualStudio: "Visual Studio",
        musicVideo: "Music video",
        azul: "Azul de Roda",
        albumCatalog: "Album catalog",
        jardim: "Jardim dos Ventos",
      },
    },
    strip: [
      "Local first",
      "Privacy by design",
      "No uploads",
      "Album workflow",
      "Visual preset browser",
      "Shared album covers",
      "Podcast experiments",
      "Accessible UI scale",
      "Open source",
    ],
    story: {
      label: "The problem",
      title:
        "Publishing a record should not mean stitching together six utilities.",
      paragraphs: [
        "Independent creators usually move between tag editors, loudness tools, cover utilities, video generators and publishing checklists. Each step works, but the flow gets fragmented.",
        "Sonara Hub turns that chain into one local workspace: prepare the audio, organize album identity, then build a visual atmosphere that can carry videos, artwork series and future publishing formats.",
      ],
    },
    workspaces: {
      label: "Two workspaces",
      title: "Audio becomes visual without leaving the studio.",
      body: "The same folder, metadata and cover decisions feed the visual export. No duplicate entry, no disconnected publishing pass.",
      audio: {
        eyebrow: "01 - Audio Library",
        title: "Prepare the record.",
        description:
          "Import folders, analyze MP3 quality, review ID3 tags, manage lyrics, choose shared album covers and generate treated copies before publication.",
        features: [
          "Metadata and lyrics",
          "Shared and per-track covers",
          "Loudness and peak review",
          "Batch treatment",
          "Opt-in podcast metadata",
        ],
      },
      visual: {
        eyebrow: "02 - Visual Studio",
        title: "Build the atmosphere.",
        description:
          "Create ambient visualizers with layered media, waveform treatments, cover series text and a compact browser for curated motion families.",
        features: [
          "Ambient scenes",
          "Preset browser and variants",
          "Layered media",
          "Waveform styles",
          "YouTube-ready sidecars",
          "Cover and text series",
        ],
      },
    },
    visualSystem: {
      label: "Visual system",
      title: "Atmospheres are now browsed, not guessed.",
      body: "The flat preset list is evolving into a compact browser with categories, variants, swatches, tags and performance tiers. Style presets stay separate from position controls, so the visual choice is easier to understand and safer to reuse.",
      atmospheres: {
        label: "Atmospheres V5",
        title: "New families, calmer audio response.",
        body: "Vinyl, piano ribbons and storybook scenes were tuned to react with intention. The new WebGL families expand the mood range without copying public shader code or letting the music drive uncontrolled motion.",
        aria: "New visual atmosphere examples",
        items: [
          [
            "Stratosphere flight",
            "Slow aerial parallax for cinematic releases.",
          ],
          [
            "Shambhala passage",
            "Symmetric light architecture with contained music response.",
          ],
          [
            "Neural haze",
            "Soft organic contours for restrained ambient movement.",
          ],
          ["Light trails", "Luminous ribbons for motion without visual chaos."],
        ],
      },
      themes: {
        label: "Themes",
        title: "Interface themes and UI scale.",
        body: "Original, light, dark and golden themes are paired with UI scale preferences for creators who need larger controls and stronger readability during long review sessions.",
      },
      covers: {
        label: "Covers",
        title: "Album cover first, track override when needed.",
        body: "Album artwork can be shared across the set while individual tracks keep their own override path. Cover series text uses direct position controls with alignment that follows the chosen point.",
      },
      lab: {
        label: "Atmosphere lab",
        title: "Try the mood before opening the app.",
        body: "The preview below is a lightweight site version: it does not replace the Sonara Hub renderer, but it shows how the new families shift across palette, motion and intensity.",
        previewAria: "Interactive preview of the selected atmosphere",
        controls: {
          atmosphere: "Atmosphere",
          palette: "Palette",
          motion: "Motion",
          intensity: "Intensity",
        },
        palettes: {
          dawn: "Dawn",
          prism: "Prism",
          nocturne: "Nocturne",
        },
        presets: {
          "stratosphere-flight": {
            name: "Stratosphere flight",
            description: "Layered sky, soft horizon and slow drift.",
            tags: ["sky", "parallax", "cinema"],
          },
          "shambhala-passage": {
            name: "Shambhala passage",
            description:
              "Symmetric portal with golden light and contained pulse.",
            tags: ["portal", "symmetry", "light"],
          },
          "neural-haze": {
            name: "Neural haze",
            description: "Organic contours, calm haze and low distraction.",
            tags: ["organic", "haze", "calm"],
          },
          "light-trails": {
            name: "Light trails",
            description:
              "Luminous trails with wide curves and controlled energy.",
            tags: ["trails", "motion", "glow"],
          },
        },
      },
    },
    workflow: {
      label: "Workflow",
      title: "One release, five clear movements.",
      body: "The product is built around the direction a creator naturally wants to move: from raw songs to a publication-ready audiovisual package.",
      steps: [
        [
          "01",
          "Import",
          "Open a folder and keep ownership of the original files.",
        ],
        ["02", "Prepare", "Review tags, lyrics, covers and technical quality."],
        [
          "03",
          "Organize",
          "Confirm the album as a catalog before treating files.",
        ],
        [
          "04",
          "Visualize",
          "Browse atmospheres, variants, waveform, media layers and text.",
        ],
        [
          "05",
          "Publish",
          "Generate videos, sidecars, promo assets and experimental podcast feeds.",
        ],
      ],
    },
    releaseFormats: {
      label: "Publishing experiments",
      title:
        "Music releases, visual assets and podcast feeds share one source.",
      body: "The product still centers on audio and ambient video, but the release surface is widening: booklet themes, promo manifests and podcast RSS exports are being shaped around the same local project.",
      cards: [
        {
          label: "Stable core",
          title: "Audio, covers and videos",
          body: "Treat MP3s, review metadata, assemble catalog identity and export atmospheric videos with matching YouTube sidecars.",
        },
        {
          label: "Growing layer",
          title: "Promo and booklet assets",
          body: "Generate publication manifests and themed visual assets that inherit the album identity instead of starting from a blank campaign.",
        },
        {
          label: "Experimental",
          title: "Podcast workspace",
          body: "Opt-in podcast tools group episodes, preserve feed metadata, apply voice-oriented processing choices and export RSS/sidecar artifacts.",
        },
      ],
    },
    screenshots: {
      label: "Inside Sonara",
      title: "An instrument, not a dashboard.",
      body: "Real captures from the studio, loaded with an album: the same dark surfaces and editorial rhythm carried end to end.",
      slots: [
        {
          title: "Audio Library",
          caption:
            "Batch review, tags, shared cover art and processing status.",
        },
        {
          title: "Catalog preview",
          caption:
            "A record-page view to confirm album identity and series covers.",
        },
        {
          title: "Video grid",
          caption: "YouTube-style thumbnails before rendering the visual set.",
        },
        {
          title: "Visual Studio",
          caption:
            "A dominant canvas with focused inspectors and preset variants.",
        },
      ],
    },
    principles: {
      label: "Principles",
      title: "Built for ownership, not dependency.",
      items: [
        {
          label: "Local first",
          title: "Your files stay on your machine.",
          body: "Sonara works with folders on disk and keeps local sessions private by default.",
        },
        {
          label: "Privacy by design",
          title: "No accounts or uploads required.",
          body: "The product is designed for ownership, not cloud lock-in or remote processing.",
        },
        {
          label: "Creator-focused",
          title: "Built around release preparation.",
          body: "Metadata, artwork, lyrics, audio checks, visuals and publishing sidecars are treated as one flow.",
        },
        {
          label: "Accessible by default",
          title: "Readable themes and scalable UI.",
          body: "Theme choices, keyboard-friendly controls, clear focus states and larger UI scale options are part of the product surface.",
        },
        {
          label: "Open source",
          title: "Transparent while it grows.",
          body: "The repository is public, the rough edges are visible, and contributions are welcome.",
        },
      ],
    },
    openSource: {
      label: "Open source",
      title: "A small studio tool, built in the open.",
      body: "Sonara Hub is developed publicly on GitHub. The repository, tests, issues and release path stay visible while the MVP matures into a Windows application.",
      follow: "Follow development",
      codeAria: "Local development commands",
      code: `git clone https://github.com/mafhper/sonara_hub
cd sonara_hub
npm ci
npm run dev

workspace: Audio Library
workspace: Visual Studio
experiment: Podcast RSS
visuals: preset browser + V5
storage: local autosave`,
    },
    roadmap: {
      label: "Roadmap",
      title: "A complete publishing workspace for independent creators.",
      body: "Audio preparation and ambient video are the foundation. The next phase moves toward a dedicated Windows app, richer podcast publishing, deeper catalog tooling, more visual families and higher-resolution validation while preserving the local-first core.",
      aria: "Future improvement track",
      items: [
        "Windows desktop packaging",
        "App-wide localization in pt-BR, English and Spanish",
        "Richer podcast publishing",
        "More original atmosphere families",
        "2K and 4K validation when hardware allows",
      ],
    },
    finalCta: {
      title: "Create the soundtrack.",
      accent: "Build the atmosphere.",
      github: "View on GitHub",
      follow: "Follow development",
    },
    footer: {
      home: "Sonara Hub home",
      project: "Open-source project",
    },
  },
  es: {
    header: {
      aria: "Navegación del sitio",
      home: "Inicio de Sonara Hub",
      primary: "Navegación principal",
      nav: {
        workspaces: "Workspaces",
        visualSystem: "Visuales",
        workflow: "Flujo",
        releaseFormats: "Publicación",
        roadmap: "Ruta futura",
      },
    },
    hero: {
      status: "Estudio local-first en desarrollo activo",
      title: "Prepara, organiza y visualiza tu música.",
      body: "Sonara Hub es un estudio creativo local-first para músicos independientes, sellos y narradores. Trata audio, define portadas de álbum, navega atmósferas visuales y exporta materiales listos para publicar sin subidas, cuentas ni dependencia de la nube.",
      actions: {
        github: "Ver en GitHub",
        download: "Descarga pronto",
      },
    },
    showcase: {
      descriptors: {
        cover: "Portada de álbum",
        screen: "Dentro de la app",
        video: "Exportado a YouTube",
      },
      cards: {
        beauty: "The Beauty of Almost",
        visualStudio: "Estudio visual",
        musicVideo: "Video musical",
        azul: "Azul de Roda",
        albumCatalog: "Catálogo del álbum",
        jardim: "Jardim dos Ventos",
      },
    },
    strip: [
      "Local first",
      "Privacidad por diseño",
      "Sin subidas",
      "Flujo de álbum",
      "Browser visual",
      "Portadas compartidas",
      "Podcast experimental",
      "Escala de UI accesible",
      "Open source",
    ],
    story: {
      label: "El problema",
      title:
        "Publicar un disco no debería exigir unir seis utilidades distintas.",
      paragraphs: [
        "Los creadores independientes suelen pasar por editores de etiquetas, herramientas de loudness, utilidades de portada, generadores de video y listas de publicación. Cada paso funciona, pero el flujo se fragmenta.",
        "Sonara Hub convierte esa cadena en un workspace local: prepara el audio, organiza la identidad del álbum y construye una atmósfera visual capaz de sostener videos, series de portadas y formatos futuros de publicación.",
      ],
    },
    workspaces: {
      label: "Dos workspaces",
      title: "El audio se vuelve visual sin salir del estudio.",
      body: "La misma carpeta, los metadatos y las decisiones de portada alimentan la exportación visual. Sin duplicar datos, sin una etapa de publicación desconectada.",
      audio: {
        eyebrow: "01 - Biblioteca de audio",
        title: "Prepara el disco.",
        description:
          "Importa carpetas, analiza calidad MP3, revisa etiquetas ID3, gestiona letras, elige portadas compartidas y genera copias tratadas antes de publicar.",
        features: [
          "Metadatos y letras",
          "Portadas compartidas y por pista",
          "Revisión de loudness y pico",
          "Tratamiento por lote",
          "Metadatos de podcast opt-in",
        ],
      },
      visual: {
        eyebrow: "02 - Estudio visual",
        title: "Construye la atmósfera.",
        description:
          "Crea visualizadores ambientales con medios en capas, tratamientos de waveform, texto de series de portada y un browser compacto para familias de movimiento curadas.",
        features: [
          "Escenas ambientales",
          "Browser de presets y variantes",
          "Medios en capas",
          "Estilos de waveform",
          "Sidecars listos para YouTube",
          "Series de portada y texto",
        ],
      },
    },
    visualSystem: {
      label: "Sistema visual",
      title: "Las atmósferas ahora se navegan, no se adivinan.",
      body: "La lista plana de presets evoluciona hacia un browser compacto con categorías, variantes, muestras de color, tags y tiers de rendimiento. Los presets de estilo quedan separados de los controles de posición, así la elección visual es más clara y más segura para reutilizar.",
      atmospheres: {
        label: "Atmósferas V5",
        title: "Nuevas familias, respuesta al audio más calmada.",
        body: "Vinilo, cintas de piano y escenas ilustradas fueron ajustadas para reaccionar con intención. Las nuevas familias WebGL amplían el rango visual sin copiar código público de shaders ni dejar que la música provoque movimientos descontrolados.",
        aria: "Ejemplos de nuevas atmósferas visuales",
        items: [
          [
            "Stratosphere flight",
            "Paralaje aéreo lento para lanzamientos cinematográficos.",
          ],
          [
            "Shambhala passage",
            "Arquitectura de luz simétrica con respuesta musical contenida.",
          ],
          [
            "Neural haze",
            "Contornos orgánicos suaves para movimiento ambiental discreto.",
          ],
          ["Light trails", "Trazos luminosos con movimiento sin caos visual."],
        ],
      },
      themes: {
        label: "Temas",
        title: "Temas de interfaz y escala de UI.",
        body: "Los temas original, claro, oscuro y golden se combinan con preferencias de escala de UI para creadores que necesitan controles más grandes y lectura más fuerte en sesiones largas de revisión.",
      },
      covers: {
        label: "Portadas",
        title:
          "Primero la portada del álbum, override por pista si hace falta.",
        body: "La arte del álbum puede compartirse en toda la serie mientras las pistas individuales mantienen su propio override. El texto de serie usa controles directos de posición con alineación siguiendo el punto elegido.",
      },
      lab: {
        label: "Laboratorio de atmósferas",
        title: "Prueba el clima antes de abrir la app.",
        body: "La vista previa de abajo es una versión ligera para el sitio: no reemplaza el renderer de Sonara Hub, pero muestra cómo las nuevas familias cambian con paleta, movimiento e intensidad.",
        previewAria: "Vista previa interactiva de la atmósfera seleccionada",
        controls: {
          atmosphere: "Atmósfera",
          palette: "Paleta",
          motion: "Movimiento",
          intensity: "Intensidad",
        },
        palettes: {
          dawn: "Amanecer",
          prism: "Prisma",
          nocturne: "Nocturno",
        },
        presets: {
          "stratosphere-flight": {
            name: "Stratosphere flight",
            description:
              "Cielo en capas, horizonte suave y desplazamiento lento.",
            tags: ["cielo", "paralaje", "cine"],
          },
          "shambhala-passage": {
            name: "Shambhala passage",
            description: "Portal simétrico con luz dorada y pulso contenido.",
            tags: ["portal", "simetría", "luz"],
          },
          "neural-haze": {
            name: "Neural haze",
            description:
              "Contornos orgánicos, niebla calma y baja distracción.",
            tags: ["orgánico", "niebla", "calma"],
          },
          "light-trails": {
            name: "Light trails",
            description:
              "Trazos luminosos con curvas amplias y energía controlada.",
            tags: ["trazos", "movimiento", "brillo"],
          },
        },
      },
    },
    workflow: {
      label: "Flujo",
      title: "Un lanzamiento, cinco movimientos claros.",
      body: "El producto sigue la dirección natural del creador: de canciones crudas a un paquete audiovisual listo para publicar.",
      steps: [
        [
          "01",
          "Importar",
          "Abre una carpeta y conserva los archivos originales.",
        ],
        ["02", "Preparar", "Revisa tags, letras, portadas y calidad técnica."],
        [
          "03",
          "Organizar",
          "Confirma el álbum como catálogo antes del tratamiento.",
        ],
        [
          "04",
          "Visualizar",
          "Navega atmósferas, variantes, waveform, capas y texto.",
        ],
        [
          "05",
          "Publicar",
          "Genera videos, sidecars, assets promocionales y feeds experimentales de podcast.",
        ],
      ],
    },
    releaseFormats: {
      label: "Experimentos de publicación",
      title:
        "Lanzamientos musicales, assets visuales y feeds de podcast comparten una sola fuente.",
      body: "El producto sigue centrado en audio y video ambiental, pero la superficie de lanzamiento crece: temas de booklet, manifiestos promocionales y exportaciones RSS de podcast se forman desde el mismo proyecto local.",
      cards: [
        {
          label: "Núcleo estable",
          title: "Audio, portadas y videos",
          body: "Trata MP3s, revisa metadatos, arma la identidad del catálogo y exporta videos atmosféricos con sidecars de YouTube.",
        },
        {
          label: "Capa en crecimiento",
          title: "Assets promocionales y booklets",
          body: "Genera manifiestos de publicación y assets visuales temáticos que heredan la identidad del álbum en vez de comenzar una campaña desde cero.",
        },
        {
          label: "Experimental",
          title: "Workspace de podcast",
          body: "Herramientas opt-in de podcast agrupan episodios, preservan metadatos de feed, aplican decisiones de procesamiento para voz y exportan RSS/sidecars.",
        },
      ],
    },
    screenshots: {
      label: "Dentro de Sonara",
      title: "Un instrumento, no un dashboard.",
      body: "Capturas reales del estudio cargado con un álbum: las mismas superficies oscuras y ritmo editorial de punta a punta.",
      slots: [
        {
          title: "Biblioteca de audio",
          caption:
            "Revisión por lote, tags, portada compartida y estado de procesamiento.",
        },
        {
          title: "Vista de catálogo",
          caption:
            "Una página de disco para confirmar identidad de álbum y portadas en serie.",
        },
        {
          title: "Grilla de video",
          caption:
            "Miniaturas estilo YouTube antes de renderizar la serie visual.",
        },
        {
          title: "Estudio visual",
          caption:
            "Un canvas dominante con inspectores enfocados y variantes de presets.",
        },
      ],
    },
    principles: {
      label: "Principios",
      title: "Hecho para propiedad, no dependencia.",
      items: [
        {
          label: "Local first",
          title: "Tus archivos quedan en tu máquina.",
          body: "Sonara trabaja con carpetas en disco y mantiene sesiones locales privadas por defecto.",
        },
        {
          label: "Privacidad por diseño",
          title: "Sin cuentas ni subidas obligatorias.",
          body: "El producto está diseñado para propiedad, no lock-in de nube ni procesamiento remoto.",
        },
        {
          label: "Enfocado en creadores",
          title: "Construido alrededor de la preparación de lanzamientos.",
          body: "Metadatos, arte, letras, chequeos de audio, visuales y sidecars de publicación se tratan como un flujo único.",
        },
        {
          label: "Accesible por defecto",
          title: "Temas legibles y UI escalable.",
          body: "Temas, controles por teclado, foco claro y opciones de escala mayor forman parte de la superficie del producto.",
        },
        {
          label: "Open source",
          title: "Transparente mientras crece.",
          body: "El repositorio es público, las aristas son visibles y las contribuciones son bienvenidas.",
        },
      ],
    },
    openSource: {
      label: "Open source",
      title: "Una pequeña herramienta de estudio, construida en público.",
      body: "Sonara Hub se desarrolla públicamente en GitHub. El repositorio, los tests, issues y camino de release quedan visibles mientras el MVP madura hacia una aplicación Windows.",
      follow: "Seguir desarrollo",
      codeAria: "Comandos de desarrollo local",
      code: `git clone https://github.com/mafhper/sonara_hub
cd sonara_hub
npm ci
npm run dev

workspace: Biblioteca de audio
workspace: Estudio visual
experimento: Podcast RSS
visuales: browser de presets + V5
storage: autosave local`,
    },
    roadmap: {
      label: "Ruta futura",
      title:
        "Un workspace completo de publicación para creadores independientes.",
      body: "Preparación de audio y video ambiental son la base. La próxima fase avanza hacia una app Windows dedicada, publicación de podcast más rica, catálogo más profundo, más familias visuales y validación en resoluciones mayores preservando el núcleo local-first.",
      aria: "Trilha futura de mejoras",
      items: [
        "Empaquetado desktop para Windows",
        "Internacionalización de la app en pt-BR, inglés y español",
        "Publicación de podcast más rica",
        "Más familias originales de atmósferas",
        "Validación 2K y 4K cuando el hardware lo permita",
      ],
    },
    finalCta: {
      title: "Crea la banda sonora.",
      accent: "Construye la atmósfera.",
      github: "Ver en GitHub",
      follow: "Seguir desarrollo",
    },
    footer: {
      home: "Inicio de Sonara Hub",
      project: "Proyecto open-source",
    },
  },
} as const;

type SiteCopy = (typeof siteCopy)[Locale];

const SiteCopyContext = createContext<SiteCopy>(siteCopy.en);

function useSiteCopy() {
  return useContext(SiteCopyContext);
}

function detectPreferredLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const languages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const language of languages) {
    const normalized = language.toLowerCase();
    if (normalized === "pt-br" || normalized.startsWith("pt")) return "pt-BR";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("en")) return "en";
  }
  return supportedLocales[0];
}

export function App() {
  const locale = useMemo(detectPreferredLocale, []);
  const copy = siteCopy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <SiteCopyContext.Provider value={copy}>
      <main className="site-shell">
        <Header />
        <Hero />
        <ContinuityStrip />
        <Story />
        <Workspaces />
        <VisualSystems />
        <Workflow />
        <ReleaseFormats />
        <ScreenshotGallery />
        <Principles />
        <OpenSource />
        <FutureVision />
        <FinalCta />
        <Footer />
      </main>
    </SiteCopyContext.Provider>
  );
}

function Header() {
  const copy = useSiteCopy();

  return (
    <header className="topbar" aria-label={copy.header.aria}>
      <a className="brand" href="#top" aria-label={copy.header.home}>
        <img
          className="brand-logo"
          src={BRAND_MARK_URL}
          alt=""
          width="28"
          height="28"
          aria-hidden="true"
        />
        <span>Sonara Hub</span>
      </a>
      <nav className="nav-links" aria-label={copy.header.primary}>
        <a href="#workspaces">{copy.header.nav.workspaces}</a>
        <a href="#visual-system">{copy.header.nav.visualSystem}</a>
        <a href="#workflow">{copy.header.nav.workflow}</a>
        <a href="#release-formats">{copy.header.nav.releaseFormats}</a>
        <a href="#roadmap">{copy.header.nav.roadmap}</a>
      </nav>
      <a className="button button-quiet button-compact" href={GITHUB_URL}>
        <GithubIcon className="icon" />
        GitHub
      </a>
    </header>
  );
}

function Hero() {
  const copy = useSiteCopy();

  return (
    <section id="top" className="hero-section" data-motion-stage="0">
      <img
        className="hero-image"
        src={heroAmbient}
        alt=""
        width="1920"
        height="1080"
      />
      <AtmosphereCanvas />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-content">
        <p className="status-pill">
          <span className="status-dot" aria-hidden="true" />
          {copy.hero.status}
        </p>
        <h1>{copy.hero.title}</h1>
        <p className="hero-copy">{copy.hero.body}</p>
        <div className="hero-actions" aria-label="Primary actions">
          <a className="button button-primary" href={GITHUB_URL}>
            <GithubIcon className="icon" />
            {copy.hero.actions.github}
            <ArrowIcon className="icon icon-trailing" />
          </a>
          <a
            className="button button-secondary"
            href={`${GITHUB_URL}/releases`}
          >
            <DownloadIcon className="icon" />
            {copy.hero.actions.download}
          </a>
        </div>
      </div>
      <HeroShowcase />
    </section>
  );
}

type ShowcaseCard = {
  kind: "cover" | "screen" | "video";
  labelKey:
    | "beauty"
    | "visualStudio"
    | "musicVideo"
    | "azul"
    | "albumCatalog"
    | "jardim";
  image: string;
};

function HeroShowcase() {
  const copy = useSiteCopy();
  const cards: ShowcaseCard[] = useMemo(
    () => [
      { kind: "cover", labelKey: "beauty", image: heroCoverBeauty },
      { kind: "screen", labelKey: "visualStudio", image: shotAzulVisual },
      { kind: "video", labelKey: "musicVideo", image: shotAzulFrame },
      { kind: "cover", labelKey: "azul", image: heroCoverAzul },
      { kind: "screen", labelKey: "albumCatalog", image: shotJardimCatalog },
      { kind: "cover", labelKey: "jardim", image: heroCoverJardim },
    ],
    [],
  );
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % cards.length);
    }, 3500);
    return () => window.clearInterval(id);
  }, [cards.length, paused]);

  return (
    <div
      className="hero-showcase"
      aria-hidden="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => setActive((current) => (current + 1) % cards.length)}
    >
      <div className="showcase-stage">
        {cards.map((card, index) => {
          const depth = (index - active + cards.length) % cards.length;
          const label = copy.showcase.cards[card.labelKey];
          return (
            <figure
              key={card.labelKey}
              className={`showcase-card showcase-${card.kind}`}
              data-depth={depth > 2 ? "back" : String(depth)}
            >
              {card.kind === "video" ? (
                <div className="showcase-window">
                  <span className="showcase-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <div className="showcase-clip">
                    <img src={card.image} alt="" loading="lazy" />
                    <span className="showcase-play" />
                    <span className="showcase-bar" />
                  </div>
                </div>
              ) : card.kind === "screen" ? (
                <div className="showcase-window">
                  <span className="showcase-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <img src={card.image} alt="" loading="lazy" />
                </div>
              ) : (
                <div className="showcase-cd">
                  <img src={card.image} alt="" loading="lazy" />
                </div>
              )}
              <figcaption className="card-info">
                <strong>{label}</strong>
                <span>{copy.showcase.descriptors[card.kind]}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function AtmosphereCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });

    if (!gl) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const resize2d = () => {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const gradient = ctx.createLinearGradient(
          0,
          0,
          rect.width,
          rect.height,
        );
        gradient.addColorStop(0, "#08080a");
        gradient.addColorStop(0.45, "#183947");
        gradient.addColorStop(0.72, "#75592e");
        gradient.addColorStop(1, "#08080a");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, rect.width, rect.height);
      };
      resize2d();
      window.addEventListener("resize", resize2d);
      return () => window.removeEventListener("resize", resize2d);
    }

    const vertexSource = `
      attribute vec2 aPosition;
      varying vec2 vUv;
      void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision mediump float;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform float uStage;
      varying vec2 vUv;

      mat2 rot(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat2(c, -s, s, c);
      }

      float ribbon(vec2 uv, float lane, float width, float phase) {
        float wave = lane
          + 0.08 * sin(uv.x * 2.8 + phase)
          + 0.035 * sin(uv.x * 7.0 - phase * 0.72);
        float edge = abs(uv.y - wave);
        return exp(-pow(edge / width, 2.0));
      }

      void main() {
        vec2 uv = vUv;
        vec2 centered = uv - 0.5;
        centered.x *= uResolution.x / max(uResolution.y, 1.0);
        float t = uTime * (0.16 + uStage * 0.018);
        float stage = clamp(uStage, 0.0, 4.0);

        vec2 flow = centered * rot(0.18 * sin(t * 0.4) + stage * 0.035);
        flow.y += 0.06 * sin(flow.x * 2.0 + t);

        float veil = 0.0;
        veil += ribbon(flow * 0.82 + vec2(0.02 * sin(t), 0.0), 0.52, 0.095, t + 0.4);
        veil += ribbon(flow * 1.04 + vec2(0.08, -0.04), 0.46, 0.070, -t * 0.9 + stage);
        veil += ribbon(flow * 1.28 + vec2(-0.10, 0.08), 0.58, 0.055, t * 1.3 + 2.1);

        float waveform = smoothstep(0.78, 0.0, abs(flow.y - 0.28 - 0.03 * sin(flow.x * 14.0 + t * 2.0)));
        float path = smoothstep(0.24, 0.0, abs(flow.y + 0.12 - 0.12 * sin(flow.x * 1.4 + t)));
        veil = mix(veil, veil * 0.72 + waveform * 0.55, smoothstep(0.4, 1.8, stage));
        veil = mix(veil, veil * 0.76 + path * 0.5, smoothstep(1.6, 3.0, stage));

        vec3 base = vec3(0.028, 0.029, 0.037);
        vec3 blue = vec3(0.13, 0.34, 0.45);
        vec3 teal = vec3(0.42, 0.77, 0.75);
        vec3 amber = vec3(0.86, 0.58, 0.28);
        vec3 violet = vec3(0.32, 0.22, 0.46);

        float glow = exp(-dot(centered, centered) * 1.55);
        vec3 color = base;
        color += blue * (0.28 + 0.12 * sin(t + uv.x * 2.2)) * glow;
        color += teal * veil * 0.38;
        color += amber * pow(veil, 1.8) * 0.36;
        color += violet * smoothstep(0.15, 0.95, veil) * 0.18;
        color *= 1.0 - smoothstep(0.62, 1.1, length(centered));

        gl_FragColor = vec4(color, 0.95);
      }
    `;

    const program = createProgram(gl, vertexSource, fragmentSource);
    if (!program) return;

    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const resolutionLocation = gl.getUniformLocation(program, "uResolution");
    const timeLocation = gl.getUniformLocation(program, "uTime");
    const stageLocation = gl.getUniformLocation(program, "uStage");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    let frame = 0;
    let visible = true;
    let stage = 0;
    const startedAt = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const updateStage = () => {
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-motion-stage]"),
      );
      let nextStage = 0;
      let closest = Number.POSITIVE_INFINITY;
      for (const section of sections) {
        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height * 0.4);
        if (distance < closest) {
          closest = distance;
          nextStage = Number(section.dataset.motionStage || "0");
        }
      }
      stage += (nextStage - stage) * 0.04;
    };

    const render = (now: number) => {
      if (visible) {
        updateStage();
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(
          timeLocation,
          reducedMotion ? 0 : (now - startedAt) / 1000,
        );
        gl.uniform1f(stageLocation, stage);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      if (!reducedMotion) {
        frame = window.requestAnimationFrame(render);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry ? entry.isIntersecting : true;
      },
      { threshold: 0.05 },
    );

    resize();
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", updateStage, { passive: true });
    frame = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", updateStage);
      if (frame) window.cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="atmosphere-canvas"
      aria-hidden="true"
      data-testid="hero-canvas"
    />
  );
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function ContinuityStrip() {
  const { strip: items } = useSiteCopy();

  return (
    <section className="continuity-strip" aria-label="Sonara Hub principles">
      <div className="strip-track">
        {[...items, ...items].map((item, index) => (
          <span key={`${item}-${index}`} className="strip-item">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function Story() {
  const copy = useSiteCopy();

  return (
    <section className="section story-section" data-motion-stage="0.7">
      <div className="section-label">{copy.story.label}</div>
      <div className="story-grid">
        <h2>{copy.story.title}</h2>
        <div className="story-copy">
          {copy.story.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function Workspaces() {
  const copy = useSiteCopy();

  return (
    <section id="workspaces" className="section" data-motion-stage="1.4">
      <div className="section-heading">
        <div>
          <div className="section-label">{copy.workspaces.label}</div>
          <h2>{copy.workspaces.title}</h2>
        </div>
        <p>{copy.workspaces.body}</p>
      </div>
      <div className="workspace-grid">
        <WorkspaceCard
          id="audio-library"
          eyebrow={copy.workspaces.audio.eyebrow}
          title={copy.workspaces.audio.title}
          description={copy.workspaces.audio.description}
          image={shotAudioLibrary}
          tone="audio"
          features={[...copy.workspaces.audio.features]}
        />
        <WorkspaceCard
          id="visual-studio"
          eyebrow={copy.workspaces.visual.eyebrow}
          title={copy.workspaces.visual.title}
          description={copy.workspaces.visual.description}
          image={shotVisualStudio}
          tone="visual"
          features={[...copy.workspaces.visual.features]}
        />
      </div>
    </section>
  );
}

function VisualSystems() {
  const copy = useSiteCopy();

  return (
    <section
      id="visual-system"
      className="section visual-system-section"
      data-motion-stage="1.9"
    >
      <div className="section-heading">
        <div>
          <div className="section-label">{copy.visualSystem.label}</div>
          <h2>{copy.visualSystem.title}</h2>
        </div>
        <p>{copy.visualSystem.body}</p>
      </div>

      <div className="feature-grid">
        <article className="feature-panel feature-panel-wide">
          <div className="section-label">
            {copy.visualSystem.atmospheres.label}
          </div>
          <h3>{copy.visualSystem.atmospheres.title}</h3>
          <p>{copy.visualSystem.atmospheres.body}</p>
          <div
            className="atmosphere-list"
            aria-label={copy.visualSystem.atmospheres.aria}
          >
            {copy.visualSystem.atmospheres.items.map(([name, body]) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="feature-panel">
          <div className="section-label">{copy.visualSystem.themes.label}</div>
          <h3>{copy.visualSystem.themes.title}</h3>
          <p>{copy.visualSystem.themes.body}</p>
        </article>

        <article className="feature-panel">
          <div className="section-label">{copy.visualSystem.covers.label}</div>
          <h3>{copy.visualSystem.covers.title}</h3>
          <p>{copy.visualSystem.covers.body}</p>
        </article>
      </div>
      <AtmosphereLab />
    </section>
  );
}

function WorkspaceCard({
  id,
  eyebrow,
  title,
  description,
  image,
  features,
  tone,
}: WorkspaceCardProps) {
  return (
    <article id={id} className={`workspace-card workspace-card-${tone}`}>
      <div className="workspace-media">
        <img src={image} alt="" width="1280" height="800" loading="lazy" />
        <div className="workspace-badge">{eyebrow}</div>
      </div>
      <div className="workspace-body">
        <h3>{title}</h3>
        <p>{description}</p>
        <ul>
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function AtmosphereLab() {
  const copy = useSiteCopy();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] =
    useState<AtmosphereLabId>("shambhala-passage");
  const [palette, setPalette] = useState<AtmospherePaletteId>("dawn");
  const [motion, setMotion] = useState(58);
  const [intensity, setIntensity] = useState(68);
  const selectedPreset = copy.visualSystem.lab.presets[selected];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let visible = true;
    const startedAt = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const time = reducedMotion
        ? 0
        : ((now - startedAt) / 1000) * (motion / 60);
      drawAtmospherePreview(context, {
        width: rect.width,
        height: rect.height,
        time,
        intensity: intensity / 100,
        palette: atmospherePaletteColors[palette],
        selected,
      });

      if (!reducedMotion && visible) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry ? entry.isIntersecting : true;
        if (visible && !frame) frame = window.requestAnimationFrame(draw);
        if (!visible && frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { threshold: 0.05 },
    );

    resize();
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [intensity, motion, palette, selected]);

  return (
    <div className="atmosphere-lab">
      <div className="atmosphere-lab-copy">
        <div className="section-label">{copy.visualSystem.lab.label}</div>
        <h3>{copy.visualSystem.lab.title}</h3>
        <p>{copy.visualSystem.lab.body}</p>
      </div>
      <div className="atmosphere-lab-shell">
        <canvas
          ref={canvasRef}
          className="atmosphere-lab-canvas"
          aria-label={copy.visualSystem.lab.previewAria}
          data-testid="atmosphere-lab-canvas"
        />
        <div className="atmosphere-lab-controls">
          <section aria-labelledby="atmosphere-control-title">
            <h4 id="atmosphere-control-title">
              {copy.visualSystem.lab.controls.atmosphere}
            </h4>
            <div className="atmosphere-choice-list">
              {atmosphereLabIds.map((id) => {
                const preset = copy.visualSystem.lab.presets[id];
                return (
                  <button
                    key={id}
                    type="button"
                    className={selected === id ? "active" : ""}
                    aria-pressed={selected === id}
                    onClick={() => setSelected(id)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="palette-control-title">
            <h4 id="palette-control-title">
              {copy.visualSystem.lab.controls.palette}
            </h4>
            <div className="palette-choice-list">
              {atmospherePaletteIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={palette === id ? "active" : ""}
                  aria-pressed={palette === id}
                  onClick={() => setPalette(id)}
                >
                  <span className="palette-swatch" aria-hidden="true">
                    {atmospherePaletteColors[id].slice(1).map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  {copy.visualSystem.lab.palettes[id]}
                </button>
              ))}
            </div>
          </section>

          <div className="lab-range-grid">
            <label>
              <span>{copy.visualSystem.lab.controls.motion}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={motion}
                onChange={(event) => setMotion(Number(event.target.value))}
              />
            </label>
            <label>
              <span>{copy.visualSystem.lab.controls.intensity}</span>
              <input
                type="range"
                min="20"
                max="100"
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="lab-tag-row" aria-label={selectedPreset.name}>
            {selectedPreset.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type AtmosphereDrawOptions = {
  width: number;
  height: number;
  time: number;
  intensity: number;
  palette: string[];
  selected: AtmosphereLabId;
};

function drawAtmospherePreview(
  context: CanvasRenderingContext2D,
  options: AtmosphereDrawOptions,
) {
  const { width, height, palette, intensity, selected, time } = options;
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, palette[0]);
  background.addColorStop(0.52, mixColor(palette[0], palette[1], 0.38));
  background.addColorStop(0.82, mixColor(palette[0], palette[2], 0.26));
  background.addColorStop(1, "#020308");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const bloom = context.createRadialGradient(
    width * 0.64,
    height * 0.42,
    0,
    width * 0.64,
    height * 0.42,
    Math.max(width, height) * 0.68,
  );
  bloom.addColorStop(0, withAlpha(palette[1], 0.32 * intensity));
  bloom.addColorStop(0.44, withAlpha(palette[2], 0.14 * intensity));
  bloom.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = bloom;
  context.fillRect(0, 0, width, height);

  if (selected === "stratosphere-flight") {
    drawStratosphere(context, width, height, time, intensity, palette);
  } else if (selected === "shambhala-passage") {
    drawShambhala(context, width, height, time, intensity, palette);
  } else if (selected === "neural-haze") {
    drawNeuralHaze(context, width, height, time, intensity, palette);
  } else {
    drawLightTrails(context, width, height, time, intensity, palette);
  }

  const vignette = context.createRadialGradient(
    width * 0.5,
    height * 0.46,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(255,255,255,0)");
  vignette.addColorStop(0.72, "rgba(0,0,0,0.1)");
  vignette.addColorStop(1, "rgba(0,0,0,0.48)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawStratosphere(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  palette: string[],
) {
  const horizon = height * (0.58 + Math.sin(time * 0.18) * 0.025);
  const skyBeam = context.createLinearGradient(0, height * 0.15, width, height);
  skyBeam.addColorStop(0, "rgba(255,255,255,0)");
  skyBeam.addColorStop(0.46, withAlpha(palette[3], 0.2 * intensity));
  skyBeam.addColorStop(0.5, withAlpha(palette[1], 0.44 * intensity));
  skyBeam.addColorStop(0.57, "rgba(255,255,255,0)");
  context.fillStyle = skyBeam;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(
    width * 0.72,
    horizon,
    0,
    width * 0.72,
    horizon,
    width * 0.58,
  );
  glow.addColorStop(0, withAlpha(palette[2], 0.34 * intensity));
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const sun = context.createRadialGradient(
    width * 0.73,
    horizon,
    0,
    width * 0.73,
    horizon,
    width * 0.22,
  );
  sun.addColorStop(0, withAlpha(palette[3], 0.44 * intensity));
  sun.addColorStop(0.24, withAlpha(palette[2], 0.22 * intensity));
  sun.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = sun;
  context.fillRect(0, 0, width, height);

  for (let cloud = 0; cloud < 22; cloud += 1) {
    const x = ((cloud * 97 + time * (10 + cloud)) % (width + 160)) - 80;
    const y = horizon - height * 0.22 + ((cloud * 31) % (height * 0.44));
    const radius = 58 + ((cloud * 23) % 120);
    const haze = context.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, withAlpha(cloud % 2 ? palette[1] : palette[3], 0.07));
    haze.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = haze;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  for (let layer = 0; layer < 11; layer += 1) {
    const y = horizon + layer * height * 0.044;
    const drift = time * (12 + layer * 2);
    context.beginPath();
    for (let x = -40; x <= width + 40; x += 18) {
      const wave =
        y +
        Math.sin((x + drift) * 0.008 + layer * 0.7) * (12 + layer * 2) +
        Math.sin((x - drift) * 0.018) * 5;
      if (x === -40) context.moveTo(x, wave);
      else context.lineTo(x, wave);
    }
    context.shadowBlur = 12;
    context.shadowColor = withAlpha(layer % 2 ? palette[1] : palette[3], 0.42);
    context.strokeStyle = withAlpha(layer % 2 ? palette[1] : palette[3], 0.22);
    context.lineWidth = Math.max(1.2, 4.4 - layer * 0.22);
    context.stroke();
  }
  context.shadowBlur = 0;
}

function drawShambhala(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  palette: string[],
) {
  const centerX = width * 0.5;
  const centerY = height * 0.52;
  const pulse = 1 + Math.sin(time * 0.7) * 0.035 * intensity;
  const core = context.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    width * 0.36,
  );
  core.addColorStop(0, withAlpha(palette[2], 0.46 * intensity));
  core.addColorStop(0.22, withAlpha(palette[3], 0.16 * intensity));
  core.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = core;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(centerX, centerY);
  for (let ring = 0; ring < 10; ring += 1) {
    const radius = (38 + ring * 31) * pulse;
    context.beginPath();
    const sides = ring % 2 ? 8 : 6;
    for (let side = 0; side < sides; side += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * side) / sides + ring * 0.055;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.74;
      if (side === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    if (ring % 3 === 0) {
      context.fillStyle = withAlpha(ring % 2 ? palette[1] : palette[2], 0.04);
      context.fill();
    }
    context.shadowBlur = 18;
    context.shadowColor = withAlpha(palette[2], 0.44);
    context.strokeStyle = withAlpha(ring % 2 ? palette[2] : palette[3], 0.2);
    context.lineWidth = 1.2 + intensity * 1.3;
    context.stroke();
  }
  context.shadowBlur = 0;
  for (let ray = 0; ray < 24; ray += 1) {
    const angle = (Math.PI * 2 * ray) / 24 + Math.sin(time * 0.25) * 0.08;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 38, Math.sin(angle) * 28);
    context.lineTo(
      Math.cos(angle) * width * 0.56,
      Math.sin(angle) * height * 0.48,
    );
    context.strokeStyle = withAlpha(palette[2], 0.09 + intensity * 0.11);
    context.lineWidth = 1.2;
    context.stroke();
  }
  for (let point = 0; point < 18; point += 1) {
    const angle = (Math.PI * 2 * point) / 18 + time * 0.08;
    const radius = width * (0.11 + (point % 3) * 0.035);
    context.beginPath();
    context.arc(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.72,
      2.4 + (point % 3) * 1.1,
      0,
      Math.PI * 2,
    );
    context.fillStyle = withAlpha(point % 2 ? palette[3] : palette[2], 0.42);
    context.fill();
  }
  context.restore();
}

function drawNeuralHaze(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  palette: string[],
) {
  for (let blob = 0; blob < 26; blob += 1) {
    const x =
      width * (0.12 + ((blob * 0.173 + Math.sin(time * 0.05 + blob)) % 0.78));
    const y =
      height * (0.14 + ((blob * 0.119 + Math.cos(time * 0.04 + blob)) % 0.72));
    const radius = 54 + ((blob * 23) % 120);
    const haze = context.createRadialGradient(x, y, 0, x, y, radius);
    haze.addColorStop(0, withAlpha(blob % 2 ? palette[1] : palette[2], 0.14));
    haze.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = haze;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  context.shadowBlur = 10;
  context.shadowColor = withAlpha(palette[1], 0.35);
  const nodes = Array.from({ length: 18 }, (_, node) => ({
    x: width * (0.16 + ((node * 0.197 + Math.sin(time * 0.07 + node)) % 0.68)),
    y: height * (0.18 + ((node * 0.163 + Math.cos(time * 0.06 + node)) % 0.62)),
  }));
  for (let node = 0; node < nodes.length; node += 1) {
    const current = nodes[node];
    const next = nodes[(node + 5) % nodes.length];
    context.beginPath();
    context.moveTo(current.x, current.y);
    context.lineTo(next.x, next.y);
    context.strokeStyle = withAlpha(palette[node % 2 ? 2 : 3], 0.1);
    context.lineWidth = 1.1;
    context.stroke();
  }
  for (let contour = 0; contour < 14; contour += 1) {
    context.beginPath();
    for (let point = 0; point <= 120; point += 1) {
      const t = point / 120;
      const angle = t * Math.PI * 2;
      const base = 72 + contour * 19;
      const wobble =
        Math.sin(angle * 3 + time * 0.38 + contour) * 15 +
        Math.cos(angle * 5 - time * 0.22) * 8;
      const x = width * 0.5 + Math.cos(angle) * (base + wobble) * 1.45;
      const y = height * 0.5 + Math.sin(angle) * (base + wobble) * 0.78;
      if (point === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.strokeStyle = withAlpha(
      contour % 2 ? palette[3] : palette[1],
      0.11 + intensity * 0.09,
    );
    context.lineWidth = 1.2 + intensity * 1.4;
    context.stroke();
  }
  for (const [index, node] of nodes.entries()) {
    context.beginPath();
    context.arc(node.x, node.y, 2.6 + (index % 3), 0, Math.PI * 2);
    context.fillStyle = withAlpha(index % 2 ? palette[1] : palette[3], 0.5);
    context.fill();
  }
  context.shadowBlur = 0;
}

function drawLightTrails(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  intensity: number,
  palette: string[],
) {
  context.globalCompositeOperation = "lighter";
  for (let beam = 0; beam < 4; beam += 1) {
    context.save();
    context.translate(width * (0.18 + beam * 0.19), height * 0.54);
    context.rotate(-0.62 + beam * 0.34 + Math.sin(time * 0.1) * 0.04);
    const beamGradient = context.createLinearGradient(
      -width * 0.44,
      0,
      width * 0.44,
      0,
    );
    beamGradient.addColorStop(0, "rgba(255,255,255,0)");
    beamGradient.addColorStop(
      0.42,
      withAlpha(palette[beam % 2 ? 2 : 1], 0.08 + intensity * 0.16),
    );
    beamGradient.addColorStop(
      0.5,
      withAlpha(palette[3], 0.24 + intensity * 0.2),
    );
    beamGradient.addColorStop(
      0.58,
      withAlpha(palette[beam % 2 ? 1 : 2], 0.08 + intensity * 0.16),
    );
    beamGradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = beamGradient;
    context.fillRect(
      -width * 0.56,
      -height * 0.04,
      width * 1.12,
      height * 0.08,
    );
    context.restore();
  }

  for (let flare = 0; flare < 28; flare += 1) {
    const x = (flare * 83 + time * 42) % width;
    const y = height * (0.18 + ((flare * 0.137) % 0.66));
    const radius = 22 + ((flare * 13) % 54);
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, withAlpha(flare % 2 ? palette[2] : palette[3], 0.1));
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  for (let trail = 0; trail < 13; trail += 1) {
    const yBase = height * (0.22 + trail * 0.052);
    const gradient = context.createLinearGradient(0, yBase, width, yBase);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(
      0.28,
      withAlpha(trail % 2 ? palette[1] : palette[2], 0.34),
    );
    gradient.addColorStop(0.58, withAlpha(palette[3], 0.52));
    gradient.addColorStop(0.72, withAlpha(palette[2], 0.28));
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.beginPath();
    for (let x = -20; x <= width + 20; x += 12) {
      const y =
        yBase +
        Math.sin(x * 0.012 + time * (0.7 + trail * 0.035) + trail) *
          (26 + intensity * 26) +
        Math.sin(x * 0.005 - time * 0.36) * 16;
      if (x === -20) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.shadowBlur = 18 + intensity * 18;
    context.shadowColor = withAlpha(trail % 2 ? palette[1] : palette[2], 0.5);
    context.strokeStyle = gradient;
    context.lineWidth = 1.8 + intensity * 5.4;
    context.stroke();
  }
  context.shadowBlur = 0;
  context.globalCompositeOperation = "source-over";
}

function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function mixColor(first: string, second: string, amount: number) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const mix = a.map((value, index) =>
    Math.round(value + (b[index] - value) * amount),
  );
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function Workflow() {
  const copy = useSiteCopy();

  return (
    <section
      id="workflow"
      className="section workflow-section"
      data-motion-stage="2.4"
    >
      <div className="section-heading">
        <div>
          <div className="section-label">{copy.workflow.label}</div>
          <h2>{copy.workflow.title}</h2>
        </div>
        <p>{copy.workflow.body}</p>
      </div>
      <ol className="workflow-list">
        {copy.workflow.steps.map(([number, title, body]) => (
          <li key={number}>
            <span className="step-number">{number}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReleaseFormats() {
  const copy = useSiteCopy();

  return (
    <section
      id="release-formats"
      className="section release-section"
      data-motion-stage="2.9"
    >
      <div className="section-heading">
        <div>
          <div className="section-label">{copy.releaseFormats.label}</div>
          <h2>{copy.releaseFormats.title}</h2>
        </div>
        <p>{copy.releaseFormats.body}</p>
      </div>
      <div className="release-grid">
        {copy.releaseFormats.cards.map((card) => (
          <article key={card.title}>
            <span>{card.label}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScreenshotGallery() {
  const copy = useSiteCopy();
  const images = [
    shotAudioLibrary,
    shotCatalog,
    shotVideoGrid,
    shotVisualStudio,
  ];

  return (
    <section className="section screenshot-section" data-motion-stage="1.8">
      <div className="section-heading">
        <div>
          <div className="section-label">{copy.screenshots.label}</div>
          <h2>{copy.screenshots.title}</h2>
        </div>
        <p>{copy.screenshots.body}</p>
      </div>
      <div className="screenshot-grid">
        {copy.screenshots.slots.map((slot, index) => (
          <article className="workspace-card" key={slot.title}>
            <div className="workspace-media">
              <img
                src={images[index]}
                alt={`${slot.title} — Sonara Hub`}
                loading="lazy"
              />
            </div>
            <div className="workspace-body">
              <h3>{slot.title}</h3>
              <p>{slot.caption}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Principles() {
  const copy = useSiteCopy();
  const principles: Principle[] = useMemo(
    () =>
      copy.principles.items.map((item, index) => ({
        ...item,
        icon: [HomeIcon, ShieldIcon, BrushIcon, AccessibilityIcon, GithubIcon][
          index
        ],
      })),
    [copy.principles.items],
  );

  return (
    <section
      id="principles"
      className="section principles-section"
      data-motion-stage="3.4"
    >
      <div className="section-heading">
        <div>
          <div className="section-label">{copy.principles.label}</div>
          <h2>{copy.principles.title}</h2>
        </div>
      </div>
      <div className="principle-grid">
        {principles.map(({ label, title, body, icon: Icon }) => (
          <article className="principle-panel" key={label}>
            <div className="principle-kicker">
              <Icon className="icon" />
              {label}
            </div>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OpenSource() {
  const copy = useSiteCopy();

  return (
    <section
      id="open-source"
      className="open-source-section"
      data-motion-stage="4"
    >
      <img src={liquidFlow} alt="" width="1080" height="1920" loading="lazy" />
      <div className="open-source-content">
        <div className="section-label">{copy.openSource.label}</div>
        <h2>{copy.openSource.title}</h2>
        <p>{copy.openSource.body}</p>
        <div className="source-actions">
          <a className="button button-primary" href={GITHUB_URL}>
            <GithubIcon className="icon" />
            mafhper/sonara_hub
          </a>
          <a className="button button-secondary" href={`${GITHUB_URL}/issues`}>
            {copy.openSource.follow}
            <ArrowIcon className="icon icon-trailing" />
          </a>
        </div>
      </div>
      <CodePanel />
    </section>
  );
}

function CodePanel() {
  const copy = useSiteCopy();

  return (
    <aside className="code-panel" aria-label={copy.openSource.codeAria}>
      <div className="code-panel-top">
        <span>~/sonara_hub</span>
        <span>local</span>
      </div>
      <pre>{copy.openSource.code}</pre>
    </aside>
  );
}

function FutureVision() {
  const copy = useSiteCopy();

  return (
    <section
      id="roadmap"
      className="section vision-section"
      data-motion-stage="3"
    >
      <div className="section-label">{copy.roadmap.label}</div>
      <h2>{copy.roadmap.title}</h2>
      <p>{copy.roadmap.body}</p>
      <div className="roadmap-list" aria-label={copy.roadmap.aria}>
        {copy.roadmap.items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  const copy = useSiteCopy();

  return (
    <section className="final-cta" data-motion-stage="2.8">
      <img src={auroraWave} alt="" width="1920" height="1080" loading="lazy" />
      <div className="final-content">
        <h2>
          {copy.finalCta.title}
          <span>{copy.finalCta.accent}</span>
        </h2>
        <div className="hero-actions">
          <a className="button button-primary" href={GITHUB_URL}>
            <GithubIcon className="icon" />
            {copy.finalCta.github}
          </a>
          <a className="button button-secondary" href={`${GITHUB_URL}/issues`}>
            {copy.finalCta.follow}
            <ArrowIcon className="icon icon-trailing" />
          </a>
        </div>
        <FooterWave />
      </div>
    </section>
  );
}

function FooterWave() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let visible = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const t = reducedMotion ? 0 : now / 1000;
      const gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
      gradient.addColorStop(0, "rgba(120, 206, 205, 0)");
      gradient.addColorStop(0.25, "rgba(120, 206, 205, 0.72)");
      gradient.addColorStop(0.62, "rgba(214, 157, 84, 0.86)");
      gradient.addColorStop(1, "rgba(214, 157, 84, 0)");

      for (let layer = 0; layer < 3; layer += 1) {
        ctx.beginPath();
        const yBase = rect.height * (0.42 + layer * 0.14);
        for (let x = 0; x <= rect.width; x += 10) {
          const y =
            yBase +
            Math.sin(x * 0.012 + t * (0.45 + layer * 0.08) + layer) *
              (10 - layer * 2) +
            Math.sin(x * 0.004 - t * 0.3) * 7;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = gradient;
        ctx.globalAlpha = 0.7 - layer * 0.18;
        ctx.lineWidth = 2.4 - layer * 0.35;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!reducedMotion) {
        frame = window.requestAnimationFrame(draw);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry ? entry.isIntersecting : true;
        if (visible && !reducedMotion && frame === 0) {
          frame = window.requestAnimationFrame(draw);
        }
        if (!visible && frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { threshold: 0.05 },
    );

    resize();
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <canvas
      className="footer-wave"
      ref={canvasRef}
      aria-hidden="true"
      data-testid="footer-wave"
    />
  );
}

function Footer() {
  const copy = useSiteCopy();

  return (
    <footer className="footer">
      <a className="brand" href="#top" aria-label={copy.footer.home}>
        <img
          className="brand-logo"
          src={BRAND_MARK_URL}
          alt=""
          width="28"
          height="28"
          aria-hidden="true"
        />
        <span>Sonara Hub</span>
      </a>
      <span>{copy.footer.project}</span>
      <a href={GITHUB_URL}>
        <GithubIcon className="icon" />
        GitHub
      </a>
    </footer>
  );
}

function ArrowIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function BrushIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 5l5 5M13 6l-8 8c-1.5 1.5-1.5 4 0 5.5 1.6 1.6 4 .9 5.4-.5l8-8" />
      <path d="M4 20c2 .2 3.7-.2 5.1-1.5" />
    </svg>
  );
}

function DownloadIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11M7 9l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function GithubIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 19c-4 1.5-4-2-5-2.5" />
      <path d="M15 22v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.4 5.6-6a4.6 4.6 0 0 0-1.3-3.3 4.3 4.3 0 0 0-.1-3.3s-1-.3-3.4 1.3a11.5 11.5 0 0 0-6 0C6.6 3.4 5.6 3.7 5.6 3.7a4.3 4.3 0 0 0-.1 3.3 4.6 4.6 0 0 0-1.3 3.3c0 4.6 2.8 5.7 5.6 6a3 3 0 0 0-.8 2.3V22" />
    </svg>
  );
}

function HomeIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h15V10.5" transform="translate(-2)" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function ShieldIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 2.8 8.4 7 10 4.2-1.6 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function AccessibilityIcon({ className = "" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
      <path d="M5 9.5c2.6.8 4.9 1.2 7 1.2s4.4-.4 7-1.2" />
      <path d="M12 10.8v8.7" />
      <path d="m8 20 4-9.2L16 20" />
    </svg>
  );
}

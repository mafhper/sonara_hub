import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
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

export function App() {
  return (
    <main className="site-shell">
      <Header />
      <Hero />
      <ContinuityStrip />
      <Story />
      <Workspaces />
      <Workflow />
      <ScreenshotGallery />
      <Principles />
      <OpenSource />
      <FutureVision />
      <FinalCta />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="topbar" aria-label="Site navigation">
      <a className="brand" href="#top" aria-label="Sonara Hub home">
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
      <nav className="nav-links" aria-label="Primary navigation">
        <a href="#workspaces">Workspaces</a>
        <a href="#workflow">Workflow</a>
        <a href="#principles">Principles</a>
        <a href="#open-source">Open source</a>
      </nav>
      <a className="button button-quiet button-compact" href={GITHUB_URL}>
        <GithubIcon className="icon" />
        GitHub
      </a>
    </header>
  );
}

function Hero() {
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
          Open-source workstation in development
        </p>
        <h1>Prepare, organize and visualize your music.</h1>
        <p className="hero-copy">
          Sonara Hub is a local-first creative studio for independent musicians
          and storytellers. Treat your audio, shape your catalog, and export
          atmospheric videos without uploads, accounts or lock-in.
        </p>
        <div className="hero-actions" aria-label="Primary actions">
          <a className="button button-primary" href={GITHUB_URL}>
            <GithubIcon className="icon" />
            View on GitHub
            <ArrowIcon className="icon icon-trailing" />
          </a>
          <a
            className="button button-secondary"
            href={`${GITHUB_URL}/releases`}
          >
            <DownloadIcon className="icon" />
            Download soon
          </a>
        </div>
      </div>
      <HeroShowcase />
    </section>
  );
}

type ShowcaseCard = {
  kind: "cover" | "screen" | "video";
  label: string;
  image: string;
};

const showcaseDescriptors: Record<ShowcaseCard["kind"], string> = {
  cover: "Album cover",
  screen: "Inside the app",
  video: "Exported to YouTube",
};

function HeroShowcase() {
  const cards: ShowcaseCard[] = useMemo(
    () => [
      { kind: "cover", label: "The Beauty of Almost", image: heroCoverBeauty },
      { kind: "screen", label: "Visual Studio", image: shotAzulVisual },
      { kind: "video", label: "Music video", image: shotAzulFrame },
      { kind: "cover", label: "Azul de Roda", image: heroCoverAzul },
      { kind: "screen", label: "Album catalog", image: shotJardimCatalog },
      { kind: "cover", label: "Jardim dos Ventos", image: heroCoverJardim },
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
    }, 3800);
    return () => window.clearInterval(id);
  }, [cards.length, paused]);

  return (
    <div
      className="hero-showcase"
      aria-hidden="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="showcase-stage">
        {cards.map((card, index) => {
          const depth = (index - active + cards.length) % cards.length;
          const float = { animationDelay: `${index * -1.3}s` };
          return (
            <figure
              key={card.label}
              className={`showcase-card showcase-${card.kind}`}
              data-depth={depth > 2 ? "back" : String(depth)}
            >
              {card.kind === "video" ? (
                <div className="showcase-video" style={float}>
                  <img src={card.image} alt="" loading="lazy" />
                  <span className="showcase-play" />
                  <span className="showcase-bar" />
                </div>
              ) : card.kind === "screen" ? (
                <div className="showcase-window" style={float}>
                  <span className="showcase-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <img src={card.image} alt="" loading="lazy" />
                </div>
              ) : (
                <div className="showcase-cd" style={float}>
                  <img src={card.image} alt="" loading="lazy" />
                </div>
              )}
              <figcaption className="card-info">
                <strong>{card.label}</strong>
                <span>{showcaseDescriptors[card.kind]}</span>
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
  const items = [
    "Local first",
    "Privacy by design",
    "No uploads",
    "Album workflow",
    "Atmospheric video",
    "Open source",
  ];

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
  return (
    <section className="section story-section" data-motion-stage="0.7">
      <div className="section-label">The problem</div>
      <div className="story-grid">
        <h2>
          Publishing a record should not mean stitching together six utilities.
        </h2>
        <div className="story-copy">
          <p>
            Independent creators usually move between tag editors, loudness
            tools, cover utilities, video generators and publishing checklists.
            Each step works, but the flow gets fragmented.
          </p>
          <p>
            Sonara Hub turns that chain into one local workspace: prepare the
            audio, organize the album, then build the atmosphere around each
            song.
          </p>
        </div>
      </div>
    </section>
  );
}

function Workspaces() {
  return (
    <section id="workspaces" className="section" data-motion-stage="1.4">
      <div className="section-heading">
        <div>
          <div className="section-label">Two workspaces</div>
          <h2>Audio becomes visual without leaving the studio.</h2>
        </div>
        <p>
          The same folder, metadata and cover decisions feed the visual export.
          No duplicate entry, no disconnected publishing pass.
        </p>
      </div>
      <div className="workspace-grid">
        <WorkspaceCard
          id="audio-library"
          eyebrow="01 - Audio Library"
          title="Prepare the record."
          description="Import folders, analyze MP3 quality, review ID3 tags, manage lyrics and generate treated copies before publication."
          image={shotAudioLibrary}
          tone="audio"
          features={[
            "Metadata and lyrics",
            "Cover artwork",
            "Loudness and peak review",
            "Batch treatment",
            "Album catalog preview",
          ]}
        />
        <WorkspaceCard
          id="visual-studio"
          eyebrow="02 - Visual Studio"
          title="Build the atmosphere."
          description="Create ambient visualizers with layered images, videos, waveforms and curated motion families from 720p to 4K."
          image={shotVisualStudio}
          tone="visual"
          features={[
            "Ambient scenes",
            "Layered media",
            "Waveform styles",
            "YouTube-ready sidecars",
            "Resolution presets",
          ]}
        />
      </div>
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

function Workflow() {
  const steps = [
    ["01", "Import", "Open a folder and keep ownership of the original files."],
    ["02", "Prepare", "Review tags, lyrics, covers and technical quality."],
    ["03", "Organize", "Confirm the album as a catalog before treating files."],
    [
      "04",
      "Visualize",
      "Choose the atmosphere, waveform, media layers and text.",
    ],
    ["05", "Export", "Generate video files and YouTube-ready sidecars."],
  ];

  return (
    <section
      id="workflow"
      className="section workflow-section"
      data-motion-stage="2.4"
    >
      <div className="section-heading">
        <div>
          <div className="section-label">Workflow</div>
          <h2>One release, five clear movements.</h2>
        </div>
        <p>
          The product is built around the direction a creator naturally wants to
          move: from raw songs to a publication-ready audiovisual package.
        </p>
      </div>
      <ol className="workflow-list">
        {steps.map(([number, title, body]) => (
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

function ScreenshotGallery() {
  const slots: Array<{ title: string; caption: string; image: string }> = [
    {
      title: "Audio Library",
      caption: "Batch review, tags, cover art and processing status.",
      image: shotAudioLibrary,
    },
    {
      title: "Catalog preview",
      caption: "A record-page view to confirm album identity.",
      image: shotCatalog,
    },
    {
      title: "Video grid",
      caption: "YouTube-style thumbnails before rendering the set.",
      image: shotVideoGrid,
    },
    {
      title: "Visual Studio",
      caption: "A dominant canvas with focused inspectors around it.",
      image: shotVisualStudio,
    },
  ];

  return (
    <section className="section screenshot-section" data-motion-stage="1.8">
      <div className="section-heading">
        <div>
          <div className="section-label">Inside Sonara</div>
          <h2>An instrument, not a dashboard.</h2>
        </div>
        <p>
          Real captures from the studio, loaded with an album: the same dark
          surfaces and editorial rhythm carried end to end.
        </p>
      </div>
      <div className="screenshot-grid">
        {slots.map((slot) => (
          <article className="workspace-card" key={slot.title}>
            <div className="workspace-media">
              <img
                src={slot.image}
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
  const principles: Principle[] = useMemo(
    () => [
      {
        label: "Local first",
        title: "Your files stay on your machine.",
        body: "Sonara works with folders on disk and keeps local sessions private by default.",
        icon: HomeIcon,
      },
      {
        label: "Privacy by design",
        title: "No accounts or uploads required.",
        body: "The product is designed for ownership, not cloud lock-in or remote processing.",
        icon: ShieldIcon,
      },
      {
        label: "Creator-focused",
        title: "Built around release preparation.",
        body: "Metadata, artwork, lyrics, audio checks and videos are treated as one publishing flow.",
        icon: BrushIcon,
      },
      {
        label: "Open source",
        title: "Transparent while it grows.",
        body: "The repository is public, the rough edges are visible, and contributions are welcome.",
        icon: GithubIcon,
      },
    ],
    [],
  );

  return (
    <section
      id="principles"
      className="section principles-section"
      data-motion-stage="3.4"
    >
      <div className="section-heading">
        <div>
          <div className="section-label">Principles</div>
          <h2>Built for ownership, not dependency.</h2>
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
  return (
    <section
      id="open-source"
      className="open-source-section"
      data-motion-stage="4"
    >
      <img src={liquidFlow} alt="" width="1080" height="1920" loading="lazy" />
      <div className="open-source-content">
        <div className="section-label">Open source</div>
        <h2>A small studio tool, built in the open.</h2>
        <p>
          Sonara Hub is developed publicly on GitHub. The repository, the issues
          and the release path stay visible while the MVP matures into a Windows
          application.
        </p>
        <div className="source-actions">
          <a className="button button-primary" href={GITHUB_URL}>
            <GithubIcon className="icon" />
            mafhper/sonara_hub
          </a>
          <a className="button button-secondary" href={`${GITHUB_URL}/issues`}>
            Follow development
            <ArrowIcon className="icon icon-trailing" />
          </a>
        </div>
      </div>
      <CodePanel />
    </section>
  );
}

function CodePanel() {
  return (
    <aside className="code-panel" aria-label="Local development commands">
      <div className="code-panel-top">
        <span>~/sonara_hub</span>
        <span>local</span>
      </div>
      <pre>{`git clone https://github.com/mafhper/sonara_hub
cd sonara_hub
npm ci
npm run dev

workspace: Biblioteca de audio
workspace: Estudio visual
storage: local autosave`}</pre>
    </aside>
  );
}

function FutureVision() {
  return (
    <section className="section vision-section" data-motion-stage="3">
      <div className="section-label">Future vision</div>
      <h2>A complete publishing workspace for independent creators.</h2>
      <p>
        Audio preparation and ambient video are the foundation. The next phase
        moves toward a dedicated Windows app, richer catalog tooling and more
        refined visual families while preserving the local-first core.
      </p>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final-cta" data-motion-stage="2.8">
      <img src={auroraWave} alt="" width="1920" height="1080" loading="lazy" />
      <div className="final-content">
        <h2>
          Create the soundtrack.
          <span>Build the atmosphere.</span>
        </h2>
        <div className="hero-actions">
          <a className="button button-primary" href={GITHUB_URL}>
            <GithubIcon className="icon" />
            View on GitHub
          </a>
          <a className="button button-secondary" href={`${GITHUB_URL}/issues`}>
            Follow development
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
  return (
    <footer className="footer">
      <a className="brand" href="#top" aria-label="Sonara Hub home">
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
      <span>Open-source project</span>
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

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";
import { normalizeVisualSettings } from "../shared/visual-effects.mjs";

const runtimePath = fileURLToPath(
  new URL("../shared/canvas-scene-runtime.mjs", import.meta.url),
);

export async function renderWebglBackgroundVideo({
  outputPath,
  size,
  duration,
  settings,
  audioEnvelope,
  composition = {},
  onProgress,
}) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const rendererPath = path.join(
    path.dirname(outputPath),
    "scene-renderer.html",
  );
  const runtimeSource = await fs.readFile(runtimePath, "utf8");
  const runtimeUrl = `data:text/javascript;base64,${Buffer.from(runtimeSource).toString("base64")}`;
  await fs.writeFile(
    rendererPath,
    buildRendererHtml({
      runtimeUrl,
      size,
      scene: normalizeVisualSettings(settings.visualSettings ?? settings),
      audioEnvelope,
      composition,
    }),
    "utf8",
  );

  const file = await fs.open(outputPath, "w");
  let bytesWritten = 0;
  let writeQueue = Promise.resolve();
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--allow-file-access-from-files",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: size.width, height: size.height },
  });
  const page = await context.newPage();
  const diagnostics = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      diagnostics.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });

  await page.exposeFunction("reportSceneProgress", async (progress) => {
    onProgress(
      Math.max(4, Math.min(92, Math.round(progress))),
      "Renderizando cena",
    );
  });
  await page.exposeFunction("saveSceneChunk", async (chunkBase64) => {
    const buffer = Buffer.from(chunkBase64, "base64");
    if (!buffer.length) return;
    writeQueue = writeQueue.then(async () => {
      await file.write(buffer);
      bytesWritten += buffer.length;
    });
    await writeQueue;
  });

  try {
    await page.goto(pathToFileURL(rendererPath).href, { waitUntil: "load" });
    await page.waitForFunction(() => typeof window.recordScene === "function");
    try {
      await page.evaluate(
        ({ durationSeconds, fps }) => window.recordScene(durationSeconds, fps),
        { durationSeconds: duration, fps: settings.webglFps },
      );
    } catch (error) {
      throw describeSceneRenderError(error, {
        diagnostics,
        scene: normalizeVisualSettings(settings.visualSettings ?? settings),
        size,
        fps: settings.webglFps,
      });
    }
    await writeQueue;
  } finally {
    await file.close();
    await context.close();
    await browser.close();
  }

  await assertValidWebm(outputPath, bytesWritten);
}

export function describeSceneRenderError(
  error,
  { diagnostics = [], scene, size, fps },
) {
  const original = error instanceof Error ? error.message : String(error);
  const contextLost = /contexto perdido:\s*true|context lost/i.test(original);
  const shaderFailure = /WEBGL_SHADER|shader WebGL|compileShader/i.test(
    original,
  );
  const code = contextLost
    ? "WEBGL_CONTEXT_LOST"
    : shaderFailure
      ? "WEBGL_SHADER_ERROR"
      : "WEBGL_RENDER_ERROR";
  const detail = [
    `Código: ${code}`,
    `Preset: ${scene.name || scene.id}`,
    `Renderer: ${scene.rendererId}`,
    `Resolução interna: ${size.width}x${size.height} @ ${fps} fps`,
    `Erro original: ${original}`,
    diagnostics.length
      ? `Diagnóstico do Chromium:\n${diagnostics.slice(-8).join("\n")}`
      : "",
    contextLost
      ? "Ação sugerida: tente o perfil Rápido ou Automático, reduza a resolução desta exportação ou escolha um renderer vetorial/tela escura para confirmar se o problema é do contexto WebGL."
      : "Ação sugerida: copie esta mensagem e revise o preset/renderer usado na exportação.",
  ]
    .filter(Boolean)
    .join("\n");
  const wrapped = new Error(
    `Falha ao renderizar a cena de vídeo (${code}). Use "Copiar erro" para analisar o diagnóstico.`,
  );
  wrapped.code = code;
  wrapped.detail = detail;
  wrapped.cause = error;
  return wrapped;
}

export function buildRendererHtml({
  runtimeUrl,
  size,
  scene,
  audioEnvelope = { frameRate: 12, frames: [] },
  composition,
}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #08090b; }
    canvas { display: block; width: ${size.width}px; height: ${size.height}px; }
  </style>
</head>
<body>
  <canvas id="scene" width="${size.width}" height="${size.height}"></canvas>
  <script type="module">
    import { createSceneRuntime, loadMediaElements } from ${JSON.stringify(runtimeUrl)};
    const scene = ${JSON.stringify(scene)};
    const audioEnvelope = ${JSON.stringify(audioEnvelope)};
    const composition = await loadMediaElements(${JSON.stringify(composition)});
    const canvas = document.getElementById("scene");
    const runtime = createSceneRuntime(canvas, scene, composition);
    runtime.resize(${size.width}, ${size.height});

    function audioAt(time) {
      if (!audioEnvelope.frames.length) return { energy: 0, bass: 0, mid: 0, high: 0, samples: [], spectrum: [] };
      const position = Math.max(0, time * audioEnvelope.frameRate);
      const leftIndex = Math.min(audioEnvelope.frames.length - 1, Math.floor(position));
      const rightIndex = Math.min(audioEnvelope.frames.length - 1, leftIndex + 1);
      const mix = position - leftIndex;
      const left = audioEnvelope.frames[leftIndex], right = audioEnvelope.frames[rightIndex];
      const lerp = (a, b) => a + (b - a) * mix;
      const lerpArray = (a = [], b = []) => {
        const length = Math.max(a.length, b.length);
        return Array.from({ length }, (_, index) => lerp(a[index] ?? 0, b[index] ?? 0));
      };
      return {
        energy: lerp(left.energy, right.energy),
        bass: lerp(left.bass, right.bass),
        mid: lerp(left.mid, right.mid),
        high: lerp(left.high, right.high),
        samples: lerpArray(left.samples, right.samples),
        spectrum: lerpArray(left.spectrum, right.spectrum),
      };
    }

    const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

    window.recordScene = async (durationSeconds, fps) => {
      if (!window.MediaRecorder) throw new Error("MediaRecorder indisponível no Chromium");
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";
      const stream = canvas.captureStream(0);
      const [track] = stream.getVideoTracks();
      if (typeof track?.requestFrame !== "function") {
        throw new Error("Captura determinística do canvas indisponível no Chromium");
      }
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: Math.max(3000000, canvas.width * canvas.height * 0.74),
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data.arrayBuffer().then((buffer) => window.saveSceneChunk(arrayBufferToBase64(buffer))));
        }
      };
      recorder.start(250);
      const frameDuration = 1000 / fps;
      const totalFrames = Math.max(2, Math.ceil(durationSeconds * fps));
      for (let index = 0; index < totalFrames; index += 1) {
        const time = Math.min(durationSeconds, index / fps);
        runtime.setAudio(audioAt(time));
        runtime.render(time);
        track.requestFrame();
        window.reportSceneProgress(((index + 1) / totalFrames) * 88 + 4);
        await delay(frameDuration);
      }
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        if (recorder.state === "recording") recorder.requestData();
        setTimeout(() => {
          if (recorder.state === "inactive") resolve();
          else recorder.stop();
        }, 250);
      });
      await Promise.all(chunks);
    };

    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) {
        binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 32768));
      }
      return btoa(binary);
    }
  </script>
</body>
</html>`;
}

async function assertValidWebm(outputPath, bytesWritten) {
  const stat = await fs.stat(outputPath);
  const size = Math.max(stat.size, bytesWritten);
  if (size < 1024) {
    throw new Error(
      `Cena exportou um WebM vazio ou incompleto (${size} bytes).`,
    );
  }
  const handle = await fs.open(outputPath, "r");
  try {
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    if (
      header[0] !== 0x1a ||
      header[1] !== 0x45 ||
      header[2] !== 0xdf ||
      header[3] !== 0xa3
    ) {
      throw new Error("Cena exportou um arquivo sem cabecalho WebM valido.");
    }
  } finally {
    await handle.close();
  }
  await assertWebmDecodable(outputPath);
}

export function assertWebmDecodeReport(stderr) {
  if (
    /File ended prematurely|EBML header parsing failed|Invalid data found/i.test(
      stderr,
    )
  ) {
    throw new Error("Cena exportou um WebM truncado ou invalido.");
  }
}

function assertWebmDecodable(outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-hide_banner", "-i", outputPath, "-f", "null", "-"],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        assertWebmDecodeReport(stderr);
        if (code !== 0) {
          throw new Error(
            `Cena WebM não pode ser decodificada: ${stderr.slice(-1200)}`,
          );
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

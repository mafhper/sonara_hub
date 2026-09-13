// Amostragem de recursos em produção (#79, F1 + F3.2).
//
// F1 produz as séries temporais que o Adaptive Scheduler (#79, F2) consome:
//   sysCpu  → carga de CPU do sistema (os.cpus deltas) — sinal de janela
//             estável para a histerese <65% sobe / 65-85% mantém / >85% reduz.
//   workerCpu → CPU do próprio worker (process.cpuUsage) — custo do processo.
//   rssBytes/heapUsedBytes → footprint do worker.
//   freeMemBytes/totalMemBytes → guard de RAM do F3 (RAM livre < 2 GB não sobe).
//
// F3.2 adiciona o leitor de VRAM dedicada (Windows): `additionalReaders`
// aceitam funções síncronas OU assíncronas; o leitor WMI roda fora da fila do
// loop (spawn de powershell), com timeout (mata o filho) e backoff por
// sequência de falhas — um leitor travado não segura a amostragem.
//
// F4.1 adiciona a telemetria de apenas-correlação: `onSample` (callback por
// amostra sanitizada, usado para streaming IPC throttled no worker) e o leitor
// de GPU Engine (`gpu3d`/`gpuCopy`/`vcn` — % de utilização por tipo de engine,
// agregando o máximo entre instâncias, mesma regra do probe offline). O store e
// o endpoint NÃO mudam aqui: F4.1 só torna possível "qual job estava em qual
// stage quando o recurso foi observado".
//
// Sanitização (mesma regra do sampler offline em
// .dev/tasks/gpu-plus/probes/resource-sampler.ps1): percentuais não-finitos
// viram 0 e valores são clampados a 0..100. Dados corrompidos de contador não
// chegam aos agregadores.
//
// Env overrides (instrumentos A/B, não defaults de produção):
//   SONARA_RESOURCE_SAMPLER_INTERVAL_MS, SONARA_RESOURCE_SAMPLER_DISABLED=1
//   SONARA_VRAM_READER_TIMEOUT_MS, SONARA_VRAM_READER_BACKOFF_MS,
//   SONARA_ADAPTIVE_VRAM_TOTAL_BYTES (override do total DXGI; ausente →
//   auto-resolução DXGI no startup, uma vez — Task A pós-#79). Falha de
//   resolução não é falha do sampler/servidor; é ausência de sinal (guard neutro).
import os from "node:os";
import { spawn as childSpawn } from "node:child_process";

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_MAX_SAMPLES = 240;
const DEFAULT_WINDOW_MS = 60000;
const MAX_TIMER_INTERVAL_MS = 60000;
const MAX_READER_TIMEOUT_MS = 15000;

// Consulta WMI compacta: entre as instâncias GPUAdapterMemory (uma por LUID),
// escolhe a de maior DedicatedUsage (a placa discreta — ex.: RX 7600) e imprime
// só o inteiro. Corrida de child process: custo ~0.1-0.4s, mitigado por
// timeout/backoff; nenhum console é exibido (windowsHide).
const VRAM_WINDOWS_COMMAND =
  "$u=[long]0;Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory|ForEach-Object{if($_.DedicatedUsage -gt [long]$u){$u=[long]$_.DedicatedUsage}};Write-Output $u";

// Consulta WMI compacta de GPU Engine: uma passagem por instância, agregando o
// máximo de utilização por tipo (3D / Copy / Video Codec Engine) e imprimindo
// um objeto JSON de uma linha. Mesma regra do probe offline (Resource-sampler.ps1).
const GPU_ENGINE_WINDOWS_COMMAND =
  "$m=@{};Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine|ForEach-Object{$n=[string]$_.Name;$u=[double]$_.UtilizationPercentage;if($u -lt 0 -or $u -gt 100){$u=0};if($n -match 'engtype_3D'){if($u -gt [double]$m.gpu3d){$m.gpu3d=$u}};if($n -match 'engtype_Copy'){if($u -gt [double]$m.gpuCopy){$m.gpuCopy=$u}};if($n -match 'engtype_Video(?! JPEG)'){if($u -gt [double]$m.vcn){$m.vcn=$u}}};[pscustomobject]@{gpu3d=[double]$m.gpu3d;gpuCopy=[double]$m.gpuCopy;vcn=[double]$m.vcn}|ConvertTo-Json -Compress";

// Task A (pós-#79) — Capácidade física de VRAM via DXGI (fonte autoritativa).
// WMI/contadores expõem DedicatedUsage mas NÃO o total físico; DXGI
// (CreateDXGIFactory1 → EnumAdapters(0) → GetDesc) é a única fonte correta
// (o Win32_VideoController.AdapterRAM satura em ~4 GB). Roda UMA vez no startup;
// o reader WMI continua responsável apenas pelo DedicatedUsage por amostra. A
// chamada COM roda inteira em C# via Add-Type; o PS só invoca o estático e
// imprime o inteiro (parseDedicatedUsage reusa o mesmo parser do usage).
const DXGI_TOTAL_WINDOWS_COMMAND =
  "$ErrorActionPreference='Stop';Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;[StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]public struct DXGI_ADAPTER_DESC{[MarshalAs(UnmanagedType.ByValArray,SizeConst=128)]public char[] Description;public uint VendorId;public uint DeviceId;public uint SubSysId;public uint Revision;public ulong DedicatedVideoMemory;public ulong DedicatedSystemMemory;public ulong SharedSystemMemory;public int LuidLow;public int LuidHigh;}public static class DxgiTotal{[DllImport(\"dxgi.dll\",PreserveSig=true)]static extern int CreateDXGIFactory1(ref Guid riid,out IntPtr ppFactory);delegate int EnumAdaptersDel(IntPtr factory,uint index,out IntPtr adapter);delegate int GetDescDel(IntPtr adapter,out DXGI_ADAPTER_DESC desc);public static long Resolve(){Guid g=new Guid(\"770aae78-f26f-4dba-a829-253c83d1b387\");IntPtr f;int hr=CreateDXGIFactory1(ref g,out f);if(hr!=0)return -1;try{IntPtr vt=Marshal.ReadIntPtr(f,0);IntPtr pe=Marshal.ReadIntPtr(vt,7*IntPtr.Size);var e=(EnumAdaptersDel)Marshal.GetDelegateForFunctionPointer(pe,typeof(EnumAdaptersDel));IntPtr a;if(e(f,0,out a)!=0)return -2;IntPtr avt=Marshal.ReadIntPtr(a,0);IntPtr pg=Marshal.ReadIntPtr(avt,8*IntPtr.Size);var gd=(GetDescDel)Marshal.GetDelegateForFunctionPointer(pg,typeof(GetDescDel));DXGI_ADAPTER_DESC d;if(gd(a,out d)!=0)return -3;return (long)d.DedicatedVideoMemory;}finally{Marshal.Release(f);}}}';$t=[DxgiTotal]::Resolve();if($t -lt 0){exit 2};Write-Output $t";

export function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function sanitizeResourceSample(sample) {
  const s = sample ?? {};
  return {
    t: Number.isFinite(s.t) ? s.t : 0,
    pid: Number.isFinite(s.pid) ? s.pid : 0,
    stage: typeof s.stage === "string" ? s.stage : "unknown",
    sysCpu: clampPct(s.sysCpu),
    workerCpu: clampPct(s.workerCpu),
    rssBytes: Number.isFinite(s.rssBytes) ? Math.max(0, s.rssBytes) : 0,
    heapUsedBytes: Number.isFinite(s.heapUsedBytes)
      ? Math.max(0, s.heapUsedBytes)
      : 0,
    freeMemBytes: Number.isFinite(s.freeMemBytes)
      ? Math.max(0, s.freeMemBytes)
      : 0,
    totalMemBytes: Number.isFinite(s.totalMemBytes)
      ? Math.max(0, s.totalMemBytes)
      : 0,
    vramUsedBytes: Number.isFinite(s.vramUsedBytes)
      ? Math.max(0, s.vramUsedBytes)
      : 0,
    vramTotalBytes: Number.isFinite(s.vramTotalBytes)
      ? Math.max(0, s.vramTotalBytes)
      : 0,
    gpu3d: clampPct(s.gpu3d),
    gpuCopy: clampPct(s.gpuCopy),
    vcn: clampPct(s.vcn),
    ...(s.extras ?? {}),
  };
}

// Cria um medidor de CPU do sistema por deltas de os.cpus() (funciona no
// Windows, onde os.loadavg é constante 0). `getCpus` é injetável para teste.
export function createSystemCpuMeter(getCpus = os.cpus) {
  let prev = snapshotCpuTimes(getCpus());
  return function sample() {
    const next = getCpus();
    let idle = 0;
    let total = 0;
    for (let i = 0; i < next.length; i++) {
      const n = next[i].times;
      const p = prev[i];
      if (!n || !p) continue;
      const dTotal =
        n.user -
        p.user +
        n.nice -
        p.nice +
        n.sys -
        p.sys +
        n.idle -
        p.idle +
        (n.irq ?? 0) -
        (p.irq ?? 0);
      const dIdle = n.idle - p.idle;
      if (dTotal > 0) {
        total += dTotal;
        idle += dIdle;
      }
    }
    prev = snapshotCpuTimes(next);
    if (total <= 0) return 0;
    return clampPct((1 - idle / total) * 100);
  };
}

function snapshotCpuTimes(cpus) {
  return (cpus || []).map((c) => ({
    user: c.times.user ?? 0,
    nice: c.times.nice ?? 0,
    sys: c.times.sys ?? 0,
    idle: c.times.idle ?? 0,
    irq: c.times.irq ?? 0,
  }));
}

export function p95(values) {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

function seriesStats(values) {
  const v = Array.from(values).filter((n) => Number.isFinite(n));
  if (v.length === 0) return { count: 0, avg: 0, peak: 0, p95: 0 };
  const sum = v.reduce((acc, n) => acc + n, 0);
  return {
    count: v.length,
    avg: sum / v.length,
    peak: Math.max(...v),
    p95: p95(v),
  };
}

// Agrega amostras em janelas temporais fixas (F2: "métricas de utilização por
// janela"). Função pura — base determinística das decisões do scheduler.
export function aggregateResourceSamples(
  samples,
  { windowMs = DEFAULT_WINDOW_MS } = {},
) {
  const list = Array.isArray(samples) ? samples : [];
  if (list.length === 0) {
    return { windows: [], summary: null };
  }
  const sorted = list
    .map(sanitizeResourceSample)
    .filter((s) => s.t > 0)
    .sort((a, b) => a.t - b.t);
  if (sorted.length === 0) {
    return { windows: [], summary: null };
  }
  const firstT = sorted[0].t;
  const effectiveWindow = Math.max(
    1,
    Math.floor(windowMs) || DEFAULT_WINDOW_MS,
  );

  const buckets = new Map();
  for (const sample of sorted) {
    const idx = Math.floor((sample.t - firstT) / effectiveWindow);
    if (!buckets.has(idx)) buckets.set(idx, []);
    buckets.get(idx).push(sample);
  }

  const windows = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([idx, bucket]) => {
      const sys = seriesStats(bucket.map((s) => s.sysCpu));
      const worker = seriesStats(bucket.map((s) => s.workerCpu));
      const vramUsed = seriesStats(bucket.map((s) => s.vramUsedBytes));
      const minFree = Math.min(...bucket.map((s) => s.freeMemBytes));
      const peakRss = Math.max(...bucket.map((s) => s.rssBytes));
      const totalMem = Math.max(...bucket.map((s) => s.totalMemBytes));
      const vramTotal = Math.max(...bucket.map((s) => s.vramTotalBytes));
      return {
        windowMs: effectiveWindow,
        startT: firstT + idx * effectiveWindow,
        endT: firstT + (idx + 1) * effectiveWindow,
        sampleCount: sys.count,
        sysCpu: { avg: sys.avg, peak: sys.peak, p95: sys.p95 },
        workerCpu: { avg: worker.avg, peak: worker.peak },
        vramUsedBytes: {
          avg: vramUsed.avg,
          peak: vramUsed.peak,
          p95: vramUsed.p95,
        },
        vramTotalBytes: vramTotal,
        vramUsedPct:
          vramTotal > 0 && vramUsed.peak > 0
            ? (vramUsed.peak / vramTotal) * 100
            : 0,
        freeMemBytes: minFree,
        freeMemPct: totalMem > 0 ? (minFree / totalMem) * 100 : 0,
        peakRssBytes: peakRss,
      };
    });

  const sysAll = seriesStats(sorted.map((s) => s.sysCpu));
  const workerAll = seriesStats(sorted.map((s) => s.workerCpu));
  const vramAll = seriesStats(sorted.map((s) => s.vramUsedBytes));
  const minFree = Math.min(...sorted.map((s) => s.freeMemBytes));
  const totalMem = Math.max(...sorted.map((s) => s.totalMemBytes));
  const vramTotal = Math.max(...sorted.map((s) => s.vramTotalBytes));
  return {
    windows,
    summary: {
      wallMs: sorted[sorted.length - 1].t - firstT,
      sampleCount: sorted.length,
      sysCpu: { avg: sysAll.avg, peak: sysAll.peak, p95: sysAll.p95 },
      workerCpu: { avg: workerAll.avg, peak: workerAll.peak },
      vramUsedBytes: { avg: vramAll.avg, peak: vramAll.peak, p95: vramAll.p95 },
      vramTotalBytes: vramTotal,
      vramUsedPct:
        vramTotal > 0 && vramAll.peak > 0
          ? (vramAll.peak / vramTotal) * 100
          : 0,
      freeMemBytes: minFree,
      freeMemPct: totalMem > 0 ? (minFree / totalMem) * 100 : 0,
      peakRssBytes: Math.max(...sorted.map((s) => s.rssBytes)),
    },
  };
}

export function createResourceSampler({
  intervalMs = DEFAULT_INTERVAL_MS,
  maxSamples = DEFAULT_MAX_SAMPLES,
  additionalReaders = [],
  getStage = null,
  enabled = true,
  onSample = null,
} = {}) {
  const safeEnabled = Boolean(enabled);
  let effectiveInterval = Math.floor(intervalMs) || DEFAULT_INTERVAL_MS;
  if (effectiveInterval < 50) effectiveInterval = 50;
  if (effectiveInterval > MAX_TIMER_INTERVAL_MS) {
    effectiveInterval = MAX_TIMER_INTERVAL_MS;
  }
  let timer = null;
  let running = false;
  let pending = false;
  let samples = [];
  let processPrev = process.cpuUsage();
  let processPrevAt = Date.now();
  const systemCpuMeter = createSystemCpuMeter();
  const startT = Date.now();

  const collectExtras = (now, readers) => {
    const extras = {};
    const promises = [];
    for (const reader of readers) {
      let result = null;
      try {
        result = reader({ t: now, pid: process.pid });
      } catch {
        result = null;
      }
      if (result && typeof result.then === "function") {
        promises.push(Promise.resolve(result).catch(() => null));
      } else if (result && typeof result === "object") {
        Object.assign(extras, result);
      }
    }
    return { extras, promises };
  };

  const sampleOnce = async () => {
    const now = Date.now();
    const processNow = process.cpuUsage();
    const elapsedUs = (now - processPrevAt) * 1000;
    const ownPct =
      elapsedUs > 0
        ? ((processNow.user -
            processPrev.user +
            processNow.system -
            processPrev.system) /
            elapsedUs) *
          100
        : 0;
    processPrev = processNow;
    processPrevAt = now;
    const mem = process.memoryUsage();
    const { extras, promises } = collectExtras(now, additionalReaders);
    if (promises.length > 0) {
      const settled = await Promise.all(promises);
      for (const value of settled) {
        if (value && typeof value === "object") {
          Object.assign(extras, value);
        }
      }
    }
    const sample = sanitizeResourceSample({
      t: now,
      pid: process.pid,
      stage: getStage ? String(getStage() ?? "unknown") : "unknown",
      sysCpu: systemCpuMeter(),
      workerCpu: ownPct,
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      freeMemBytes: os.freemem(),
      totalMemBytes: os.totalmem(),
      extras,
    });
    if (samples.length < maxSamples) {
      samples.push(sample);
    }
    if (typeof onSample === "function") {
      try {
        onSample(sample);
      } catch {
        // Telemetria de correlação nunca derruba a amostragem.
      }
    }
    return sample;
  };

  const scheduleOnce = () => {
    if (pending) return;
    pending = true;
    sampleOnce().finally(() => {
      pending = false;
    });
  };

  return {
    start() {
      if (!safeEnabled || running) return;
      running = true;
      scheduleOnce();
      timer = setInterval(() => {
        if (running) scheduleOnce();
      }, effectiveInterval);
      if (timer.unref) timer.unref();
    },
    stop() {
      if (!running) return null;
      running = false;
      if (timer) clearInterval(timer);
      timer = null;
      return {
        startedAt: startT,
        stoppedAt: Date.now(),
        samples,
        aggregate: aggregateResourceSamples(samples, {
          windowMs: DEFAULT_WINDOW_MS,
        }),
      };
    },
    // Agregação da janela rolante de agora-`windowMs` até agora — sinal usado
    // pelo loop do Adaptive Scheduler (F2) sem parar a amostragem.
    window(windowMs = DEFAULT_WINDOW_MS, now = Date.now()) {
      if (!safeEnabled || samples.length === 0) {
        return { windows: [], summary: null };
      }
      const cutoff =
        now - Math.max(1, Math.floor(windowMs) || DEFAULT_WINDOW_MS);
      const recent = samples.filter((s) => s.t >= cutoff);
      return aggregateResourceSamples(recent, {
        windowMs: DEFAULT_WINDOW_MS,
      });
    },
  };
}

export function samplerIntervalFromEnv(environment = process.env) {
  const value = Number(environment.SONARA_RESOURCE_SAMPLER_INTERVAL_MS);
  if (!(Number.isFinite(value) && value >= 50)) {
    return DEFAULT_INTERVAL_MS;
  }
  if (value > MAX_TIMER_INTERVAL_MS) return MAX_TIMER_INTERVAL_MS;
  return Math.floor(value);
}

function parseDedicatedUsage(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1];
  if (!/^\d+$/.test(last)) return null;
  const value = Number(last);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

// F3.2 — Leitor assíncrono de VRAM dedicada (Windows).
//
// O `additionalReaders` do sampler aceita funções síncronas e assíncronas; este
// leitor roda um powershell fora da fila (spawn com windowsHide), com:
//   - timeoutMs: mata o filho e resolve null (amostra sem VRAM);
//   - maxMisses/backoffMs: após N falhas seguidas, não spawna de novo durante
//     backoffMs (leitor travado não segura a amostragem nem o CPU);
//   - totalBytes: total físico, resolvido UMA vez (DXGI no startup, env
//     SONARA_ADAPTIVE_VRAM_TOTAL_BYTES). Se ausente, vramTotalBytes=0 e o
//     agregador mantém vramUsedPct=0 (guard neutro até haver total).
// `spawn` é injetável para teste.
export function createWindowsGpuDedicatedUsageReader({
  timeoutMs = 4000,
  backoffMs = 60000,
  maxMisses = 2,
  totalBytes = null,
  spawn = childSpawn,
} = {}) {
  let safeTimeout = Math.floor(timeoutMs) || 4000;
  if (safeTimeout < 50) safeTimeout = 50;
  if (safeTimeout > MAX_READER_TIMEOUT_MS) {
    safeTimeout = MAX_READER_TIMEOUT_MS;
  }
  const safeBackoff = Math.max(0, Math.floor(backoffMs) || 60000);
  const safeMaxMisses = Math.max(1, Math.floor(maxMisses) || 2);
  const safeTotal =
    Number.isFinite(totalBytes) && totalBytes > 0 ? Math.max(0, totalBytes) : 0;
  let misses = 0;
  let skipUntil = 0;

  const readOnce = () =>
    new Promise((resolve) => {
      let child;
      try {
        child = spawn(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-Command", VRAM_WINDOWS_COMMAND],
          { windowsHide: true },
        );
      } catch {
        resolve(null);
        return;
      }
      let out = "";
      let settled = false;
      let killTimer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        try {
          child.kill();
        } catch {
          /* filho já terminou */
        }
        resolve(value);
      };
      killTimer = setTimeout(() => finish(null), safeTimeout);
      child.stdout?.on("data", (data) => {
        out += String(data);
      });
      child.on("error", () => finish(null));
      child.on("close", () => finish(parseDedicatedUsage(out)));
    });

  return async function readVram({ t: _t, pid: _pid }) {
    const now = Date.now();
    if (now < skipUntil) {
      return { vramUsedBytes: null, vramTotalBytes: null };
    }
    const used = await readOnce();
    if (used === null) {
      misses += 1;
      if (misses >= safeMaxMisses) {
        misses = 0;
        skipUntil = Date.now() + safeBackoff;
      }
      return { vramUsedBytes: null, vramTotalBytes: null };
    }
    misses = 0;
    return { vramUsedBytes: used, vramTotalBytes: safeTotal };
  };
}

export function vramReaderOptionsFromEnv(environment = process.env) {
  const timeoutMs = Number(environment.SONARA_VRAM_READER_TIMEOUT_MS);
  const backoffMs = Number(environment.SONARA_VRAM_READER_BACKOFF_MS);
  const totalBytes = Number(environment.SONARA_ADAPTIVE_VRAM_TOTAL_BYTES);
  return {
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.floor(timeoutMs)
        : undefined,
    backoffMs:
      Number.isFinite(backoffMs) && backoffMs > 0
        ? Math.floor(backoffMs)
        : undefined,
    totalBytes:
      Number.isFinite(totalBytes) && totalBytes > 0
        ? Math.floor(totalBytes)
        : null,
  };
}

// Task A (pós-#79) — Resolvedor da capacidade física de VRAM via DXGI.
//
// Roda UMA vez no startup (a capacidade da placa não muda em execução normal);
// o resultado é cacheado e só alimenta o `totalBytes` do reader WMI — que
// continua responsável apenas pelo DedicatedUsage por amostra (responsabilidades
// não misturadas). Assíncrono com timeout e windowsHide, mesmo padrão do reader;
// `spawn` injetável para teste. Fail/timeout → resolve null, nunca lança.
export function createWindowsDxgiTotalResolver({
  timeoutMs = 10000,
  spawn = childSpawn,
} = {}) {
  let safeTimeout = Math.floor(timeoutMs) || 10000;
  if (safeTimeout < 50) safeTimeout = 50;
  if (safeTimeout > MAX_READER_TIMEOUT_MS) {
    safeTimeout = MAX_READER_TIMEOUT_MS;
  }
  return function resolveDxgiTotal() {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(
          "powershell",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            DXGI_TOTAL_WINDOWS_COMMAND,
          ],
          { windowsHide: true },
        );
      } catch {
        resolve(null);
        return;
      }
      let out = "";
      let settled = false;
      let killTimer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        try {
          child.kill();
        } catch {
          /* filho já terminou */
        }
        resolve(value);
      };
      killTimer = setTimeout(() => finish(null), safeTimeout);
      child.stdout?.on("data", (data) => {
        out += String(data);
      });
      child.on("error", () => finish(null));
      child.on("close", () => finish(parseDedicatedUsage(out)));
    });
  };
}

// Task A (pós-#79) — Resolução do total de VRAM com origem observável.
//
// Ordem: override de env válido (SONARA_ADAPTIVE_VRAM_TOTAL_BYTES) → DXGI no
// startup → indisponível. Valor de env inválido/zero/negativo NAO é aceito
// silenciosamente (aviso no log e fallback para DXGI). Qualquer falha de
// resolução NÃO é falha do sampler nem do servidor — é apenas ausência de sinal
// para o guard de VRAM (guarda neutro). Devolve:
//   { value: <number|null>, source: "env" | "dxgi" | "unavailable" }
// Nenhuma chamada síncrona bloqueante no caminho do sampler (o resolver DXGI é
// assíncrono e roda uma única vez, fora do loop de amostragem).
export async function resolveVramTotalBytes({
  environment = process.env,
  dxgiResolver = null,
} = {}) {
  const raw = environment.SONARA_ADAPTIVE_VRAM_TOTAL_BYTES;
  const hasRaw = raw !== undefined && raw !== null && String(raw).trim() !== "";
  const fromEnv = Number(raw);
  if (hasRaw && Number.isFinite(fromEnv) && fromEnv > 0) {
    return { value: Math.floor(fromEnv), source: "env" };
  }
  if (hasRaw) {
    console.warn(
      `[vram-total] SONARA_ADAPTIVE_VRAM_TOTAL_BYTES inválido (${JSON.stringify(
        raw,
      )}); ignorado e tentando DXGI.`,
    );
  }
  if (typeof dxgiResolver !== "function") {
    if (!hasRaw) {
      console.warn(
        "[vram-total] total ausente e sem resolver DXGI → guard de VRAM neutro.",
      );
    }
    return { value: null, source: "unavailable" };
  }
  try {
    const resolved = await dxgiResolver();
    if (Number.isFinite(resolved) && resolved > 0) {
      return { value: Math.floor(resolved), source: "dxgi" };
    }
    console.warn(
      "[vram-total] resolução DXGI falhou → guard de VRAM neutro (sampler segue normal).",
    );
    return { value: null, source: "unavailable" };
  } catch (error) {
    console.warn(
      `[vram-total] resolução DXGI lançou erro → guard neutro: ${error?.message ?? error}`,
    );
    return { value: null, source: "unavailable" };
  }
}

// F4.1 — Leitor de GPU Engine (Windows). Reporta a utilização agregada por tipo
// de engine: gpu3d (engtype_3D), gpuCopy (engtype_Copy) e vcn
// (engtype_Video Codec Engine) — máximos entre instâncias, mesma regra do probe
// offline. Valores fora de 0..100 viram 0 na query; falha/timeout/backoff
// resolvem { gpu3d: null, gpuCopy: null, vcn: null } (o sanitize vira 0).
export function createWindowsGpuEngineUsageReader({
  timeoutMs = 4000,
  backoffMs = 60000,
  maxMisses = 2,
  spawn = childSpawn,
} = {}) {
  let safeTimeout = Math.floor(timeoutMs) || 4000;
  if (safeTimeout < 50) safeTimeout = 50;
  if (safeTimeout > MAX_READER_TIMEOUT_MS) {
    safeTimeout = MAX_READER_TIMEOUT_MS;
  }
  const safeBackoff = Math.max(0, Math.floor(backoffMs) || 60000);
  const safeMaxMisses = Math.max(1, Math.floor(maxMisses) || 2);
  let misses = 0;
  let skipUntil = 0;

  const readOnce = () =>
    new Promise((resolve) => {
      let child;
      try {
        child = spawn(
          "powershell",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            GPU_ENGINE_WINDOWS_COMMAND,
          ],
          { windowsHide: true },
        );
      } catch {
        resolve(null);
        return;
      }
      let out = "";
      let settled = false;
      let killTimer = null;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        try {
          child.kill();
        } catch {
          /* filho já terminou */
        }
        resolve(value);
      };
      killTimer = setTimeout(() => finish(null), safeTimeout);
      child.stdout?.on("data", (data) => {
        out += String(data);
      });
      child.on("error", () => finish(null));
      child.on("close", () => finish(parseEngineUsage(out)));
    });

  return async function readEngine({ t: _t, pid: _pid }) {
    const now = Date.now();
    if (now < skipUntil) {
      return { gpu3d: null, gpuCopy: null, vcn: null };
    }
    const usage = await readOnce();
    if (usage === null) {
      misses += 1;
      if (misses >= safeMaxMisses) {
        misses = 0;
        skipUntil = Date.now() + safeBackoff;
      }
      return { gpu3d: null, gpuCopy: null, vcn: null };
    }
    misses = 0;
    return usage;
  };
}

function parseEngineUsage(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  let object;
  try {
    object = JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
  if (!object || typeof object !== "object") return null;
  const pct = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  };
  return {
    gpu3d: pct(object.gpu3d),
    gpuCopy: pct(object.gpuCopy),
    vcn: pct(object.vcn),
  };
}

// F4.1 — Throttle de streaming do worker para o processo principal. Garante
// "cadência de amostragem ≠ cadência de IPC": a cada chamada decide se emite a
// amostra (trailing — emite a mais recente assim que `intervalMs` passa desde a
// última emissão), permitindo o sampler coletar mais fino que o envio.
export function createSampleStreamThrottle({
  intervalMs = 5000,
  now = Date.now,
} = {}) {
  const safeInterval = Math.max(50, Math.floor(intervalMs) || 5000);
  let lastSentAt = 0;
  return function decide(sample) {
    const timestamp = now();
    if (lastSentAt > 0 && timestamp - lastSentAt < safeInterval) return null;
    lastSentAt = timestamp;
    return sample;
  };
}

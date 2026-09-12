// Adaptive Scheduler (#79, F2) — máquina de estados de concorrência do render.
//
// Decisões baseadas em JANELAS ESTABILIZADAS, não em instantes isolados de CPU
// baixa (princípio do Evidence Gate / docs/performance/evidence-ffmpeg-gpu-2026-09-11.md):
//   signal.sysCpu < riseThreshold (65)  por riseSamples janelas  → sobe
//   signal.sysCpu > fallThreshold (85)  por fallSamples janelas  → reduz
//   entre 65..85                                                  → mantém
// Com cooldown entre decisões (minDecisionIntervalMs) para evitar
// oscilar 2→3→2→3 em torno do threshold.
//
// Guards (F3):
//   - RAM  (freeMemBytes < minFreeMemBytes)  → não sobe; com CPU alta reduz.
//   - VRAM (vramUsedBytes/vramTotalBytes) com histerese por watermarks globais
//     (decisão aprovada: pressão GLOBAL, sem atribuição por processo):
//       ratio >= HIGH (0.85) → mesma semântica do guard de RAM (bloqueia subida;
//                              com CPU alta reduz).
//       ratio >  LOW (0.70)  → bloqueia subida (mantém/decrementsa permitidos).
//       ratio <= LOW         → sem restrição de VRAM.
//     Sem vramTotalBytes, vramUsedPct=0 → guard neutro (fail-open observado).
//   - Recovery hysteresis (F3.4): após um decrease por pressão (RAM/VRAM),
//     `lastPressureAt` trava novas subidas por `recoveryCooldownMs` mesmo que a
//     pressão já tenha passado — evita 2→1→2→1 e 2→3→2→3 em torno do threshold.
//
// Conservadorismo inicial (#79): a subida só acontece até max (default = 2 =
// concurrency de partida). O fluxo seguro prevê provar 2→1 antes de liberar
// 2→3; liberar a subida = subir max via env. Nunca excedemos max aqui.
//
// Toda decisão é determinística: same input sequence → same output sequence.
// `stepAdaptiveScheduler` é pura (recebe e devolve estado) para ser testável.
//
// Env overrides (instrumentos A/B, não defaults de produção):
//   SONARA_ADAPTIVE_SCHEDULER=1 (liga o loop no index.mjs)
//   SONARA_ADAPTIVE_RISE_THRESHOLD / FALL_THRESHOLD
//   SONARA_ADAPTIVE_RISE_SAMPLES / FALL_SAMPLES
//   SONARA_ADAPTIVE_MIN_CONCURRENCY / MAX_CONCURRENCY
//   SONARA_ADAPTIVE_COOLDOWN_MS, SONARA_ADAPTIVE_WINDOW_MS,
//   SONARA_ADAPTIVE_MIN_FREE_MEM_BYTES
//   SONARA_ADAPTIVE_VRAM_HIGH_WATERMARK / VRAM_LOW_WATERMARK
//   SONARA_ADAPTIVE_VRAM_TOTAL_BYTES (total DXGI resolvido uma vez)
//   SONARA_ADAPTIVE_RECOVERY_COOLDOWN_MS
const DEFAULT_MIN_FREE_MEM_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_VRAM_HIGH_WATERMARK = 0.85;
const DEFAULT_VRAM_LOW_WATERMARK = 0.7;
const DEFAULT_RECOVERY_COOLDOWN_MS = 90 * 1000;

export function clampConcurrency(value, min, max) {
  const v = Math.floor(Number(value));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

export function initialState({
  current = 2,
  min = 1,
  max = current,
  cooldownMs = 30000,
} = {}) {
  const lower = Math.max(1, Math.floor(Number(min) || 1));
  const upper = Math.max(lower, Math.floor(Number(max) || lower));
  const start = clampConcurrency(current, lower, upper);
  return {
    concurrency: start,
    min: lower,
    max: upper,
    cooldownMs: Math.max(0, Math.floor(Number(cooldownMs) || 0)),
    upStreak: 0,
    downStreak: 0,
    lastDecisionAt: null,
    lastPressureAt: null,
  };
}

export function sanitizeSignal(signal) {
  if (!signal || typeof signal !== "object") return null;
  const sysCpu = Number(signal.sysCpu);
  if (!Number.isFinite(sysCpu)) return null;
  const freeMemBytes = Number(signal.freeMemBytes);
  const vramUsedBytes = Number(signal.vramUsedBytes);
  const vramTotalBytes = Number(signal.vramTotalBytes);
  return {
    sysCpu: Math.min(100, Math.max(0, sysCpu)),
    freeMemBytes: Number.isFinite(freeMemBytes) ? freeMemBytes : null,
    vramUsedBytes:
      Number.isFinite(vramUsedBytes) && vramUsedBytes >= 0
        ? vramUsedBytes
        : null,
    vramTotalBytes:
      Number.isFinite(vramTotalBytes) && vramTotalBytes > 0
        ? vramTotalBytes
        : null,
  };
}

export function stepAdaptiveScheduler(
  state,
  { signal, now = Date.now() } = {},
) {
  const currentState = state ?? initialState();
  const decision = {
    action: "hold",
    next: currentState.concurrency,
    reason: null,
  };
  const sanitized = sanitizeSignal(signal);
  if (!sanitized) {
    decision.reason = "no-signal";
    return { state: currentState, decision };
  }

  const riseThreshold = Number(signal.riseThreshold ?? 65);
  const fallThreshold = Number(signal.fallThreshold ?? 85);
  const riseSamples = Math.max(1, Number(signal.riseSamples ?? 2));
  const fallSamples = Math.max(1, Number(signal.fallSamples ?? 1));
  const minFreeMemBytes = Number(
    signal.minFreeMemBytes ?? DEFAULT_MIN_FREE_MEM_BYTES,
  );
  const vramHighWatermark = Number(
    signal.vramHighWatermark ?? DEFAULT_VRAM_HIGH_WATERMARK,
  );
  const vramLowWatermark = Number(
    signal.vramLowWatermark ?? DEFAULT_VRAM_LOW_WATERMARK,
  );
  const recoveryCooldownMs = Number(
    signal.recoveryCooldownMs ?? DEFAULT_RECOVERY_COOLDOWN_MS,
  );
  const cooledDown =
    currentState.lastDecisionAt == null ||
    now - currentState.lastDecisionAt >= currentState.cooldownMs;

  const memoryLow =
    sanitized.freeMemBytes != null && sanitized.freeMemBytes < minFreeMemBytes;
  const vramRatio =
    sanitized.vramTotalBytes != null && sanitized.vramUsedBytes != null
      ? sanitized.vramUsedBytes / sanitized.vramTotalBytes
      : null;
  const vramHigh = vramRatio != null && vramRatio >= vramHighWatermark;
  const vramPressure = vramRatio != null && vramRatio > vramLowWatermark;
  const guardLabel = memoryLow ? "memória" : "vram";

  const pressureBlocked = memoryLow || vramHigh;
  if (pressureBlocked) {
    if (
      currentState.concurrency > currentState.min &&
      cooledDown &&
      sanitized.sysCpu > fallThreshold
    ) {
      decision.action = "decrease";
      decision.next = Math.max(currentState.min, currentState.concurrency - 1);
      decision.reason = `${guardLabel} alta + cpu ${sanitized.sysCpu.toFixed(1)} > ${fallThreshold}`;
      return {
        state: {
          ...currentState,
          concurrency: decision.next,
          lastDecisionAt: now,
          lastPressureAt: now,
          upStreak: 0,
          downStreak: 0,
        },
        decision,
      };
    }
    decision.reason = `${guardLabel}-guard (não sobe)`;
    return { state: { ...currentState, upStreak: 0 }, decision };
  }

  if (sanitized.sysCpu > fallThreshold) {
    const downStreak = currentState.downStreak + 1;
    const nextState = { ...currentState, downStreak, upStreak: 0 };
    if (downStreak >= fallSamples) {
      if (currentState.concurrency > currentState.min && cooledDown) {
        decision.action = "decrease";
        decision.next = Math.max(
          currentState.min,
          currentState.concurrency - 1,
        );
        decision.reason = `sysCpu ${sanitized.sysCpu.toFixed(1)} > ${fallThreshold} (${downStreak}/${fallSamples})`;
        return {
          state: {
            ...nextState,
            concurrency: decision.next,
            lastDecisionAt: now,
            downStreak: 0,
          },
          decision,
        };
      }
      decision.reason =
        currentState.concurrency <= currentState.min ? "já mínimo" : "cooldown";
    } else {
      decision.reason = `sysCpu alto aguardando streak (${downStreak}/${fallSamples})`;
    }
    return { state: nextState, decision };
  }

  if (sanitized.sysCpu < riseThreshold) {
    const upStreak = currentState.upStreak + 1;
    const nextState = { ...currentState, upStreak, downStreak: 0 };
    if (vramPressure) {
      decision.reason = `vram-pressure (não sobe) ${vramRatio.toFixed(3)} > ${vramLowWatermark}`;
      return {
        state: { ...currentState, upStreak: 0, downStreak: 0 },
        decision,
      };
    }
    const recovering =
      currentState.lastPressureAt != null &&
      now - currentState.lastPressureAt < recoveryCooldownMs;
    if (recovering) {
      const remainingMs = Math.max(
        0,
        currentState.lastPressureAt + recoveryCooldownMs - now,
      );
      decision.reason = `recovery (histerese pós-pressão, resta ${Math.ceil(remainingMs / 1000)}s)`;
      return {
        state: { ...currentState, upStreak: 0, downStreak: 0 },
        decision,
      };
    }
    if (upStreak >= riseSamples) {
      if (currentState.concurrency < currentState.max && cooledDown) {
        decision.action = "increase";
        decision.next = Math.min(
          currentState.max,
          currentState.concurrency + 1,
        );
        decision.reason = `sysCpu ${sanitized.sysCpu.toFixed(1)} < ${riseThreshold} (${upStreak}/${riseSamples})`;
        return {
          state: {
            ...nextState,
            concurrency: decision.next,
            lastDecisionAt: now,
            upStreak: 0,
          },
          decision,
        };
      }
      decision.reason =
        currentState.concurrency >= currentState.max ? "já máximo" : "cooldown";
    } else {
      decision.reason = `sysCpu baixo aguardando streak (${upStreak}/${riseSamples})`;
    }
    return { state: nextState, decision };
  }

  decision.reason = `sysCpu ${sanitized.sysCpu.toFixed(1)} na banda [${riseThreshold}, ${fallThreshold}]`;
  return {
    state: { ...currentState, upStreak: 0, downStreak: 0 },
    decision,
  };
}

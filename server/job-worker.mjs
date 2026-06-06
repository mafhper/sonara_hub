import { fork, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const JOB_WORKER_EXIT_CODE = "JOB_WORKER_EXIT";
export const JOB_WORKER_TIMEOUT_CODE = "JOB_WORKER_TIMEOUT";
export const JOB_WORKER_CANCELED_CODE = "JOB_WORKER_CANCELED";

const defaultWorkerPath = fileURLToPath(
  new URL("./render-job-worker.mjs", import.meta.url),
);

export function createWorkerJobError({
  code = JOB_WORKER_EXIT_CODE,
  message,
  detail,
  cause,
}) {
  const error = new Error(message || workerErrorMessage(code));
  error.code = code;
  error.detail = detail || error.message;
  if (cause) error.cause = cause;
  return error;
}

export function runRenderWorkerJob({
  jobId,
  kind,
  onWorkerDone,
  onWorkerStart,
  payload,
  timeoutMs = 45 * 60 * 1000,
  updateJob,
  workerPath = defaultWorkerPath,
}) {
  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [], {
      cwd: path.dirname(path.dirname(workerPath)),
      serialization: "advanced",
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    let stderr = "";
    let stdout = "";
    let settled = false;
    let cancelRequested = false;
    let timedOut = false;
    let killTimer = null;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      closeChild(child);
      onWorkerDone?.();
      callback(value);
    };

    const controller = {
      pid: child.pid,
      cancel() {
        if (settled) return;
        cancelRequested = true;
        sendChildMessage(child, { type: "cancel" });
        killTimer = setTimeout(() => {
          void terminateProcessTree(child.pid);
        }, 1500);
      },
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      controller.cancel();
    }, timeoutMs);

    onWorkerStart?.(controller);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("message", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "stage" || message.type === "progress") {
        updateJob(jobId, message.patch ?? workerPatchFromMessage(message));
        return;
      }
      if (message.type === "result") {
        const patch = message.patch ?? {};
        updateJob(jobId, patch);
        finish(resolve, patch);
        return;
      }
      if (message.type === "error") {
        const error = createWorkerErrorFromMessage(message);
        if (error.code === JOB_WORKER_CANCELED_CODE) {
          updateJob(jobId, {
            status: "canceled",
            progress: 0,
            message: "Cancelado",
            errorCode: JOB_WORKER_CANCELED_CODE,
            errorDetail: error.detail,
          });
        }
        finish(reject, error);
      }
    });

    child.on("error", (error) => {
      finish(
        reject,
        createWorkerJobError({
          code: JOB_WORKER_EXIT_CODE,
          message: "Falha ao iniciar worker de render/export.",
          detail: error.stack || error.message,
          cause: error,
        }),
      );
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      if (timedOut) {
        finish(
          reject,
          createWorkerJobError({
            code: JOB_WORKER_TIMEOUT_CODE,
            message: "Worker de render/export excedeu o tempo limite.",
            detail: workerExitDetail({ exitCode, signal, stderr, stdout }),
          }),
        );
        return;
      }
      if (cancelRequested) {
        updateJob(jobId, {
          status: "canceled",
          progress: 0,
          message: "Cancelado",
          errorCode: JOB_WORKER_CANCELED_CODE,
        });
        finish(
          reject,
          createWorkerJobError({
            code: JOB_WORKER_CANCELED_CODE,
            message: "Worker de render/export cancelado.",
            detail: workerExitDetail({ exitCode, signal, stderr, stdout }),
          }),
        );
        return;
      }
      finish(
        reject,
        createWorkerJobError({
          code: JOB_WORKER_EXIT_CODE,
          message: "Worker de render/export encerrou antes de concluir.",
          detail: workerExitDetail({ exitCode, signal, stderr, stdout }),
        }),
      );
    });

    sendChildMessage(child, {
      type: "run",
      jobId,
      kind,
      payload,
    });
  });
}

function workerPatchFromMessage(message) {
  return {
    ...(message.stage !== undefined ? { stage: message.stage } : {}),
    ...(message.stageStartedAt !== undefined
      ? { stageStartedAt: message.stageStartedAt }
      : {}),
    ...(message.stageTimings !== undefined
      ? { stageTimings: message.stageTimings }
      : {}),
    ...(message.progress !== undefined ? { progress: message.progress } : {}),
    ...(message.message !== undefined ? { message: message.message } : {}),
  };
}

function createWorkerErrorFromMessage(message) {
  return createWorkerJobError({
    code: String(message.errorCode || JOB_WORKER_EXIT_CODE),
    message: String(message.message || "Falha no worker de render/export."),
    detail: String(message.errorDetail || message.message || ""),
  });
}

function sendChildMessage(child, message) {
  if (!child.connected) return;
  try {
    child.send(message);
  } catch {
    // The close/error handlers will surface the failed worker state.
  }
}

function closeChild(child) {
  try {
    if (child.connected) child.disconnect();
  } catch {
    // Child is already disconnected.
  }
  if (child.exitCode === null && !child.killed) {
    child.kill();
  }
}

async function terminateProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
      });
      killer.on("error", resolve);
      killer.on("close", resolve);
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  setTimeout(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }, 1500).unref();
}

function workerExitDetail({ exitCode, signal, stderr, stdout }) {
  return [
    `exitCode=${exitCode ?? "null"}`,
    `signal=${signal ?? "null"}`,
    stderr ? `stderr:\n${stderr.slice(-3000)}` : "",
    stdout ? `stdout:\n${stdout.slice(-1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function workerErrorMessage(code) {
  if (code === JOB_WORKER_TIMEOUT_CODE) {
    return "Worker de render/export excedeu o tempo limite.";
  }
  if (code === JOB_WORKER_CANCELED_CODE) {
    return "Worker de render/export cancelado.";
  }
  return "Worker de render/export encerrou antes de concluir.";
}

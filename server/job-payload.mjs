import fs from "node:fs/promises";
import path from "node:path";

export const JOB_PAYLOAD_MISSING_CODE = "JOB_PAYLOAD_MISSING";
export const defaultRenderMaxAttempts = 2;

export async function persistRenderJobPayload({
  jobId,
  kind,
  payload,
  workDir,
}) {
  const jobWorkDir = path.join(workDir, jobId);
  const inputsDir = path.join(jobWorkDir, "inputs");
  await fs.mkdir(inputsDir, { recursive: true });

  const persisted = {
    ...payload,
    audioPath: await copyInputPath(payload.audioPath, inputsDir, "audio"),
    backgroundFile: await copyFileObject(
      payload.backgroundFile,
      inputsDir,
      "background",
    ),
    coverFile: await copyFileObject(payload.coverFile, inputsDir, "cover"),
    mediaLayerFiles: await Promise.all(
      (payload.mediaLayerFiles ?? []).map((file, index) =>
        copyFileObject(file, inputsDir, `layer-${index + 1}`),
      ),
    ),
  };
  const payloadRef = path.join(jobWorkDir, "payload.json");
  await fs.writeFile(
    payloadRef,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        jobId,
        kind,
        payload: persisted,
        schemaVersion: 1,
      },
      null,
      2,
    ),
    "utf8",
  );
  return { payload: persisted, payloadRef };
}

export async function loadRenderJobPayload(payloadRef) {
  try {
    const parsed = JSON.parse(await fs.readFile(payloadRef, "utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.payload) {
      throw payloadMissingError(payloadRef);
    }
    return {
      kind: parsed.kind,
      payload: parsed.payload,
    };
  } catch (error) {
    if (error?.code === JOB_PAYLOAD_MISSING_CODE) throw error;
    if (error?.code === "ENOENT") throw payloadMissingError(payloadRef);
    throw error;
  }
}

export function payloadMissingError(payloadRef) {
  const error = new Error(
    "Payload persistente do job não foi encontrado para retomar a execução.",
  );
  error.code = JOB_PAYLOAD_MISSING_CODE;
  error.detail = `payloadRef=${payloadRef || ""}`;
  return error;
}

async function copyInputPath(sourcePath, inputsDir, slot) {
  if (!sourcePath) return sourcePath;
  const extension = safeExtension(sourcePath);
  const targetPath = path.join(inputsDir, `${slot}${extension}`);
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
}

async function copyFileObject(file, inputsDir, slot) {
  if (!file?.path) return file ?? null;
  const targetPath = await copyInputPath(
    file.path,
    inputsDir,
    `${slot}${safeFileStem(file.originalname || file.path)}`,
  );
  return {
    ...file,
    originalPath: file.path,
    path: targetPath,
  };
}

function safeExtension(filePath) {
  const extension = path.extname(String(filePath || "")).toLowerCase();
  return /^[.\w-]{1,16}$/.test(extension) ? extension : "";
}

function safeFileStem(value) {
  const stem = path.basename(String(value || ""), path.extname(String(value)));
  return stem
    ? `-${stem
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)}`
    : "";
}

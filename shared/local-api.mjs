export class LocalApiError extends Error {
  constructor(message, status = 0, options = {}) {
    super(message, options);
    this.name = "LocalApiError";
    this.status = status;
  }
}

export async function fetchJson(input, init) {
  const response = await request(input, init);
  const text = await response.text();
  const data = text ? parseJson(text) : {};
  if (!response.ok) {
    throw new LocalApiError(
      data.error || `O servidor local respondeu com erro ${response.status}.`,
      response.status,
    );
  }
  return data;
}

export async function fetchJsonWithRetry(input, init, options = {}) {
  const attempts = Math.max(1, options.attempts ?? 3);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchJson(input, init);
    } catch (error) {
      if (attempt === attempts || !isTransient(error)) throw error;
      options.onRetry?.(attempt);
      await wait(options.delayMs ?? 300);
    }
  }
  throw new LocalApiError("Servidor local indisponível.");
}

export async function fetchOptional(input, init) {
  const response = await request(input, init);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new LocalApiError(
      `Não consegui baixar um arquivo da exportação (${response.status}).`,
      response.status,
    );
  }
  return response;
}

export function localApiMessage(error, action = "concluir esta operacao") {
  if (error instanceof LocalApiError) return error.message;
  const detail = error instanceof Error ? error.message : String(error);
  return `Não consegui ${action}. ${detail}`;
}

async function request(input, init) {
  try {
    return await fetch(assertLocalApiInput(input), init);
  } catch (cause) {
    throw new LocalApiError(
      "O servidor local está indisponível. Aguarde alguns segundos e tente novamente.",
      0,
      { cause },
    );
  }
}

export function assertLocalApiInput(input) {
  const raw =
    typeof input === "string" || input instanceof URL ? input : input?.url;
  const base = globalThis.location?.href;
  let url;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw new LocalApiError("A URL da API local é inválida.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "::1", "[::1]", "localhost"].includes(
      url.hostname.toLowerCase(),
    )
  ) {
    throw new LocalApiError("A API local precisa usar um endereço loopback.");
  }
  if (base && url.origin !== new URL(base).origin) {
    throw new LocalApiError(
      "A API local precisa usar a mesma origem da aplicação.",
    );
  }
  return input instanceof Request ? new Request(url, input) : url;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function isTransient(error) {
  return (
    error instanceof LocalApiError && (!error.status || error.status >= 500)
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

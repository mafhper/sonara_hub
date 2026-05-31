export class LocalApiError extends Error {
  status: number;
}

export function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T>;

export function fetchJsonWithRetry<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (attempt: number) => void;
  },
): Promise<T>;

export function fetchOptional(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response | null>;

export function localApiMessage(error: unknown, action?: string): string;

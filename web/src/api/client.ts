// Minimal fetch wrapper. Every /api/* call goes through here so error
// envelopes ({ error, code }) are unwrapped into a typed ApiError and
// JSON parsing happens in one place.

import type { WireError } from "@/types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = opts;
  const init: RequestInit = { method, signal };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "network error", 0);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? safeParse(text) : null;

  if (!res.ok) {
    const env = parsed as WireError | null;
    throw new ApiError(env?.error ?? `request failed (${res.status})`, res.status, env?.code);
  }

  return parsed as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Thin fetch wrapper for the FastAPI backend.
 *
 * Every path stays relative ("/api/...") so the same code works behind the
 * Vite dev proxy and behind any reverse proxy in production.
 *
 * The backend reports failures as {error, message, details} (see
 * app/api/main.py AppError handler); ApiError turns those into readable text.
 * Nothing here invents fallback data: a failed call throws, and the calling
 * view is responsible for rendering an honest empty/error state.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Human-readable one-liner, including backend `details` when present. */
  get readable(): string {
    const extra = formatDetails(this.details);
    return extra ? `${this.message} (${extra})` : this.message;
  }
}

function formatDetails(details: unknown): string {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details;
  if (Array.isArray(details)) return details.map(d => formatDetails(d)).filter(Boolean).join('; ');
  if (typeof details === 'object') {
    return Object.entries(details as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${formatDetails(v) || String(v)}`)
      .join(', ');
  }
  return String(details);
}

/** Turn any thrown value into a message safe to show a user. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.readable;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`;
  let message = `${res.status} ${res.statusText || 'Request failed'}`;
  let details: unknown;

  const body = await res.text().catch(() => '');
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') {
        // AppError shape: {error, message, details}
        if (typeof parsed.message === 'string') message = parsed.message;
        if (typeof parsed.error === 'string') code = parsed.error;
        if ('details' in parsed) details = parsed.details;
        // FastAPI validation shape: {detail: [...]} or {detail: "..."}
        if (!('message' in parsed) && 'detail' in parsed) {
          const d = parsed.detail;
          message = typeof d === 'string' ? d : 'Request rejected by the API';
          if (typeof d !== 'string') details = d;
        }
      }
    } catch {
      message = body.slice(0, 300);
    }
  }
  return new ApiError(res.status, code, message, details);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError(
      0,
      'network_error',
      `Cannot reach the API at ${path}. Is the backend running on the configured port?`,
      err instanceof Error ? err.message : undefined
    );
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

export function apiPostForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'POST', body: form, signal });
}

export function apiDelete<T = void>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'DELETE', signal });
}

/** True when a request failed because the endpoint does not exist on the backend. */
export function isNotImplemented(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405);
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Poll `path` until `isDone` returns true. Used for the asynchronous
 * endpoints that answer 202 + an id (case analysis, eval runs).
 */
export async function poll<T>(
  path: string,
  isDone: (value: T) => boolean,
  onUpdate?: (value: T) => void,
  { intervalMs = 1000, timeoutMs = 15 * 60 * 1000, signal }: PollOptions = {}
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    if (signal?.aborted) throw new ApiError(0, 'aborted', 'Polling cancelled');
    const value = await apiGet<T>(path, signal);
    onUpdate?.(value);
    if (isDone(value)) return value;
    if (Date.now() - startedAt > timeoutMs) {
      throw new ApiError(
        0,
        'poll_timeout',
        `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${path} to finish.`
      );
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

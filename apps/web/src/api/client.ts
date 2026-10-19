/**
 * Purpose: The one way the web app talks to the local server.
 * Scope: JSON and binary requests with the required `X-LTTS-Client` header (the server's CSRF
 *   guard), uniform `ApiError`s carrying the server's stable error codes, and audio blob fetches.
 * Does NOT belong: Caching or React state (queries.ts) — keep this framework-free and testable.
 */

export const CLIENT_HEADER = { 'X-LTTS-Client': 'web' } as const;

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? {};
  }
}

const NETWORK_ERROR: ApiErrorBody = {
  code: 'network_error',
  message: "Can't reach the local server. Make sure `npm run dev` is still running.",
};

async function toError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: ApiErrorBody };
    if (body.error) return new ApiError(response.status, body.error);
  } catch {
    // fall through to a generic error
  }
  return new ApiError(response.status, {
    code: 'http_error',
    message: `The server answered ${response.status}.`,
  });
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  json?: unknown;
  body?: BodyInit;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { ...CLIENT_HEADER };
  let body = options.body;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: body ?? null,
      signal: options.signal ?? null,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!response.ok) throw await toError(response);
  return response;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface PreparedAudio {
  /** Direct same-origin URL for an audio element (WebKit refuses media from Blob URLs). */
  url: string;
  duration: number;
}

/**
 * Make sure audio exists (failures arrive as JSON errors), then return the direct URL the server
 * advertises for the cached clip. The response body is discarded; the media element streams it.
 */
export async function prepareAudio(
  path: string,
  options: RequestOptions = {},
): Promise<PreparedAudio> {
  const response = await send(path, options);
  const duration = Number(response.headers.get('X-Audio-Duration') ?? '0');
  const url = response.headers.get('X-Audio-Url') ?? buildUrl(path, options.query);
  await response.body?.cancel().catch(() => undefined);
  return { url, duration: Number.isFinite(duration) ? duration : 0 };
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

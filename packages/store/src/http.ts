/**
 * HTTP / app-level error for remotes.
 * Use for 404 vs empty 200, and for `200` responses with an error payload inside.
 */
export class RemoteError extends Error {
  readonly code: string | number | undefined;
  /** HTTP status when known (404, 500, or 200 with error body). */
  readonly status: number | undefined;
  /** Parsed body or raw text. */
  readonly body: unknown;

  constructor(
    message: string,
    opts?: { code?: string | number; status?: number; body?: unknown; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'RemoteError';
    this.code = opts?.code;
    this.status = opts?.status;
    this.body = opts?.body;
  }
}

export function isRemoteError(value: unknown): value is RemoteError {
  return value instanceof RemoteError;
}

export interface FromResponseOptions {
  /** Forward HTTP / app codes into `store.status(...).httpStatus` / `.code`. */
  report?: (info: { status: number; code?: string | number }) => void;
  /**
   * Treat a 2xx JSON body as an application error.
   * Default: `{ ok: false }`, `{ success: false }`, or a non-null `error` field.
   */
  isErrorBody?: (body: unknown, res: Response) => boolean;
  /** Returned for empty 204 / empty 200 bodies. Default `null` (valid empty success). */
  empty?: unknown;
}

function defaultIsErrorBody(body: unknown): boolean {
  if (body == null || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  if (o.ok === false || o.success === false) return true;
  if ('error' in o && o.error != null && o.error !== false) return true;
  return false;
}

function appErrorFromBody(body: unknown, res: Response): RemoteError {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const nested = o && typeof o.error === 'object' && o.error ? (o.error as Record<string, unknown>) : null;
  const code =
    (o?.code as string | number | undefined) ??
    (o?.errorCode as string | number | undefined) ??
    (nested?.code as string | number | undefined) ??
    res.status;
  let message = res.statusText || `HTTP ${res.status}`;
  if (typeof o?.message === 'string') message = o.message;
  else if (typeof nested?.message === 'string') message = nested.message;
  else if (typeof o?.error === 'string') message = o.error;
  return new RemoteError(message, { code, status: res.status, body });
}

/**
 * Read a `Response` into data or throw `RemoteError`.
 * - `!res.ok` (e.g. 404) → error with `status` / `code`
 * - empty 200/204 → `empty` (default `null`), not an error
 * - 2xx JSON with `{ ok: false }` / `{ error: … }` → error (status still 200)
 */
export async function fromResponse<T = unknown>(res: Response, opts?: FromResponseOptions): Promise<T> {
  const report = opts?.report;
  const empty = (opts && 'empty' in opts! ? opts.empty : null) as T;
  const isErrorBody = opts?.isErrorBody ?? defaultIsErrorBody;

  if (!res.ok) {
    let body: unknown;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text || undefined;
    }
    const err = appErrorFromBody(body ?? { message: res.statusText }, res);
    report?.({ status: res.status, code: err.code ?? res.status });
    throw err;
  }

  report?.({ status: res.status });

  if (res.status === 204) return empty;

  const text = await res.text();
  if (!text) return empty;

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return text as T;
  }

  if (isErrorBody(body, res)) {
    const err = appErrorFromBody(body, res);
    report?.({ status: res.status, code: err.code ?? res.status });
    throw err;
  }

  return body as T;
}

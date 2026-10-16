/*
 * [INPUT]: Craft 22c9f0414ab63e0a22814c9a2ada740206e09091 source; see NOTICE.
 * [OUTPUT]: Retained authentication/request logic, adapted to BOAI host boundaries.
 * [POS]: sources/craft upstream module.
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { appendQueryAuth, buildApiAuthHeaders, type ApiCredential, type ApiAuthSpec } from './api-auth'
export interface ApiConfig { name: string; baseUrl: string; auth?: ApiAuthSpec; defaultHeaders?: Record<string, string> }
const MAX_DOWNLOAD_SIZE = 4 * 1024 * 1024
const formatBytes = (value: number) => `${value} bytes`
export type ApiCredentialSource =
  | ApiCredential
  | (() => Promise<string>)
  | (() => Promise<ApiCredential | null>);

/**
 * Type guard to check if credential source is a token getter function.
 * Both narrow shapes (Promise<string> and Promise<ApiCredential | null>) flow
 * through the same call site and are normalized by the caller.
 */
function isTokenGetter(
  cred: ApiCredentialSource
): cred is () => Promise<string> | Promise<ApiCredential | null> {
  return typeof cred === 'function';
}

/** Summarize callback type — typically agent.runMiniCompletion.bind(agent) */
export type SummarizeCallback = (prompt: string) => Promise<string | null>;


/**
 * Build headers for an API request, injecting authentication and default headers.
 *
 * Thin wrapper over the shared assembly in @craft-agent/session-tools-core/api-auth,
 * which source_test uses as well, so validator and runtime cannot drift (OSS #1067).
 */
export function buildHeaders(
  auth: ApiConfig['auth'],
  credential: ApiCredential,
  defaultHeaders?: Record<string, string>
): Record<string, string> {
  return buildApiAuthHeaders(auth, credential, defaultHeaders);
}

/**
 * Build the full URL for an API request
 */
function buildUrl(
  baseUrl: string,
  path: string,
  method: string,
  params: Record<string, unknown> | undefined,
  auth: ApiConfig['auth'],
  credential: ApiCredential
): string {
  // Normalize: remove trailing slash from baseUrl and ensure path starts with /
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${normalizedBase}${normalizedPath}`;

  // Query param auth (string credentials only), shared with source_test
  url = appendQueryAuth(url, auth, credential);

  // Handle GET params in query string
  if (method === 'GET' && params && Object.keys(params).length > 0) {
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        // Handle arrays and objects
        if (typeof value === 'object') {
          urlParams.append(key, JSON.stringify(value));
        } else {
          urlParams.append(key, String(value));
        }
      }
    }
    const queryString = urlParams.toString();
    if (queryString) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}${queryString}`;
    }
  }

  return url;
}

/** One API request as executed against a source's baseUrl */
export interface ApiRequestInput {
  /** Endpoint path under the source's baseUrl */
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request body (POST/PUT/PATCH) or query parameters (GET); supports _rawBody/_contentType */
  params?: Record<string, unknown>;
}

export interface ExecuteApiRequestOptions {
  /** Cancels the in-flight fetch when aborted */
  signal?: AbortSignal;
  /** Abort automatically after this many ms (composed with `signal`) */
  timeoutMs?: number;
}

/** Raw outcome of an API request (body not yet interpreted) */
export interface ApiRequestOutcome {
  /** True for 2xx responses */
  ok: boolean;
  status: number;
  /** Raw response body */
  buffer: Buffer;
  /** Response Content-Type header, when present */
  contentType: string | null;
}

/** Thrown before the body is loaded when Content-Length exceeds MAX_DOWNLOAD_SIZE */
export class ApiResponseTooLargeError extends Error {
  constructor(readonly sizeBytes: number) {
    super(`Response too large: ${formatBytes(sizeBytes)} exceeds ${formatBytes(MAX_DOWNLOAD_SIZE)} limit. Use a streaming download tool for large files.`);
    this.name = 'ApiResponseTooLargeError';
  }
}

/**
 * Execute one authenticated request against an API source.
 *
 * This is the single fetch path for API sources — the MCP tool handler and
 * the Pages action bridge both go through it, so credential resolution stays
 * lazy (resolved here, never crossing a process/IPC boundary) and
 * cancellation works everywhere.
 *
 * @throws ApiResponseTooLargeError when Content-Length exceeds the download cap
 * @throws on network failure or abort (fetch semantics)
 */
export async function executeApiRequest(
  config: ApiConfig,
  credential: ApiCredentialSource,
  request: ApiRequestInput,
  options?: ExecuteApiRequestOptions,
): Promise<ApiRequestOutcome> {
  const { path, method, params } = request;

  // Resolve credential — if a getter, call it to get a fresh credential.
  // A null result (vault has nothing for this source) is normalized to an
  // empty string; buildHeaders / buildUrl already treat that as "no auth",
  // letting the upstream API surface its own 401.
  const rawCredential = isTokenGetter(credential)
    ? await credential()
    : credential;
  const resolvedCredential: ApiCredential = rawCredential ?? '';

  const url = buildUrl(config.baseUrl, path, method, params, config.auth, resolvedCredential);
  const headers = buildHeaders(config.auth, resolvedCredential, config.defaultHeaders);

  // Never log the full URL: for query-auth sources buildUrl embeds the
  // credential (`?api_key=…`), and GET params may carry sensitive values too.

  // Compose caller signal with the timeout signal (either aborts the fetch)
  const signals: AbortSignal[] = [];
  if (options?.signal) signals.push(options.signal);
  if (options?.timeoutMs !== undefined) signals.push(AbortSignal.timeout(options.timeoutMs));

  const fetchOptions: RequestInit = {
    method,
    headers,
    ...(signals.length > 0 ? { signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) } : {}),
  };

  // Add body for non-GET requests
  if (method !== 'GET' && params && Object.keys(params).length > 0) {
    // Support raw text bodies via _rawBody param (e.g., for endpoints expecting plain text)
    if (typeof params._rawBody === 'string') {
      fetchOptions.body = params._rawBody;
      (fetchOptions.headers as Record<string, string>)['Content-Type'] =
        typeof params._contentType === 'string' ? params._contentType : 'text/plain';
    } else {
      fetchOptions.body = JSON.stringify(params);
    }
  }

  // Header VALUES are never logged — Authorization and friends are live
  // credentials and this line used to put them in main.log under CRAFT_DEBUG.

  const response = await fetch(url, { ...fetchOptions, redirect: 'error' });

  // OOM safety: reject before loading into memory
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_DOWNLOAD_SIZE) {
      await response.body?.cancel();
      throw new ApiResponseTooLargeError(size);
    }
  }

  // Load response as raw buffer — callers handle binary detection
  const parts: Uint8Array[] = []; let bytes = 0;
  const reader = response.body?.getReader();
  try {
    if (reader) for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_DOWNLOAD_SIZE) throw new ApiResponseTooLargeError(bytes);
      parts.push(value);
    }
  } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
  const buffer = Buffer.concat(parts);

  return {
    ok: response.ok,
    status: response.status,
    buffer,
    contentType: response.headers.get('content-type'),
  };
}

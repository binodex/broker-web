import { PayError, isAbortError } from "./errors.js";
import type { PayRegion } from "./types.js";
import { PATHS, readError, readPing } from "./wire.js";

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/;
const API_PATH = /^\/v1\/?$/;

export const PROBE_TIMEOUT_MS = 2500;

const isTransportAllowed = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname));

export const normalizeOrigins = (entries: readonly string[]): string[] =>
  entries.flatMap((entry) => {
    try {
      const url = new URL(entry);
      return isTransportAllowed(url) ? [url.origin] : [];
    } catch {
      return [];
    }
  });

export const validateApiBase = (
  value: unknown,
  allowedOrigins?: readonly string[],
): string | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (!isTransportAllowed(url)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!API_PATH.test(url.pathname)) return null;
    if (value.includes("?") || value.includes("#")) return null;
    if (allowedOrigins && !normalizeOrigins(allowedOrigins).includes(url.origin)) {
      return null;
    }
    return `${url.origin}/v1`;
  } catch {
    return null;
  }
};

export const validateWidgetOrigin = (
  value: unknown,
  allowedOrigins?: readonly string[],
): string | null => {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (!isTransportAllowed(url) || url.username || url.password) return null;
    if (allowedOrigins && !normalizeOrigins(allowedOrigins).includes(url.origin)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const unique = (values: string[]): string[] => Array.from(new Set(values));

export interface ResolvedHosts {
  apiBases: string[];
  widgetOrigins: string[];
  widgetOriginByBase: Record<string, string>;
}

export const resolveHosts = (input: {
  apiBases: readonly unknown[];
  widgetOrigins: readonly unknown[];
  widgetUrl?: string | null;
  allowedApiOrigins?: readonly string[];
  allowedWidgetOrigins?: readonly string[];
}): ResolvedHosts => {
  const apiBases = unique(
    input.apiBases.flatMap((base) => {
      const valid = validateApiBase(base, input.allowedApiOrigins);
      return valid ? [valid] : [];
    }),
  );
  const declared = input.widgetOrigins.length
    ? input.widgetOrigins
    : input.widgetUrl
      ? [input.widgetUrl]
      : [];
  const widgetOrigins = unique(
    declared.flatMap((entry) => {
      const valid = validateWidgetOrigin(entry, input.allowedWidgetOrigins);
      return valid ? [valid] : [];
    }),
  );
  const widgetOriginByBase: Record<string, string> = {};
  input.apiBases.forEach((base, index) => {
    const api = validateApiBase(base, input.allowedApiOrigins);
    const widget = validateWidgetOrigin(input.widgetOrigins[index], input.allowedWidgetOrigins);
    if (api && widget && !(api in widgetOriginByBase)) widgetOriginByBase[api] = widget;
  });
  return { apiBases, widgetOrigins, widgetOriginByBase };
};

export const orderFrameOrigins = (input: {
  declared: readonly unknown[];
  proven: readonly string[];
  allowedWidgetOrigins?: readonly string[];
}): string[] => {
  const declared = unique(
    input.declared.flatMap((entry) => {
      const valid = validateWidgetOrigin(entry, input.allowedWidgetOrigins);
      return valid ? [valid] : [];
    }),
  );
  if (declared.length === 0) return [...input.proven];
  if (input.proven.length === 0) return declared;
  return input.proven.filter((origin) => declared.includes(origin));
};

export type ProbeResult =
  | { ok: true; serverTime: number | null }
  | { ok: false; disabled: boolean };

export const probeApiBase = async (
  fetcher: typeof fetch,
  base: string,
  signal: AbortSignal,
): Promise<ProbeResult> => {
  try {
    const response = await fetcher(`${base}${PATHS.ping}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        disabled: readError(response.status, data).code === "PAY_API_DISABLED",
      };
    }
    return { ok: true, serverTime: readPing(data).serverTime };
  } catch (error) {
    if (signal.aborted && isAbortError(error)) throw error;
    return { ok: false, disabled: false };
  }
};

export interface Timers {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export const defaultTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const probeWithTimeout = (
  fetcher: typeof fetch,
  base: string,
  signal: AbortSignal,
  timeoutMs: number,
  timers: Timers,
): Promise<ProbeResult> => {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  let handle: unknown;
  const timeout = new Promise<ProbeResult>((resolve) => {
    handle = timers.setTimeout(() => {
      controller.abort();
      resolve({ ok: false, disabled: false });
    }, timeoutMs);
  });
  const probe = probeApiBase(fetcher, base, controller.signal).catch(
    (): ProbeResult => ({ ok: false, disabled: false }),
  );
  return Promise.race([probe, timeout]).finally(() => {
    timers.clearTimeout(handle);
    signal.removeEventListener("abort", onAbort);
    controller.abort();
  });
};

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }
};

export interface SelectHostInput {
  bases: readonly string[];
  region: PayRegion | null;
  fetch: typeof fetch;
  signal: AbortSignal;
  timeoutMs?: number;
  timers?: Timers;
  exclude?: ReadonlySet<string>;
}

export interface SelectedHost {
  base: string;
  serverTime: number | null;
}

const unreachable = () =>
  new PayError("HOST_UNREACHABLE", "No payment API host answered");

const disabled = () =>
  new PayError("PAY_API_DISABLED", "Pay API is not available", { status: 404 });

export const selectApiBase = async (
  input: SelectHostInput,
): Promise<SelectedHost> => {
  const timers = input.timers ?? defaultTimers;
  const timeoutMs = input.timeoutMs ?? PROBE_TIMEOUT_MS;
  const candidates = input.bases.filter((base) => !input.exclude?.has(base));
  if (candidates.length === 0) throw unreachable();

  if (input.region === "unknown" && candidates.length > 1) {
    const race = new AbortController();
    const onAbort = () => race.abort();
    input.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const outcome = await new Promise<SelectedHost | "disabled" | "unreachable">(
        (resolve) => {
          let pending = candidates.length;
          let sawDisabled = false;
          candidates.forEach((base) => {
            void probeWithTimeout(input.fetch, base, race.signal, timeoutMs, timers).then(
              (result) => {
                if (result.ok) {
                  resolve({ base, serverTime: result.serverTime });
                  return;
                }
                if (result.disabled) sawDisabled = true;
                pending -= 1;
                if (pending === 0) resolve(sawDisabled ? "disabled" : "unreachable");
              },
            );
          });
        },
      );
      throwIfAborted(input.signal);
      if (outcome === "disabled") throw disabled();
      if (outcome === "unreachable") throw unreachable();
      return outcome;
    } finally {
      race.abort();
      input.signal.removeEventListener("abort", onAbort);
    }
  }

  let sawDisabled = false;
  for (const base of candidates) {
    throwIfAborted(input.signal);
    const result = await probeWithTimeout(
      input.fetch,
      base,
      input.signal,
      timeoutMs,
      timers,
    );
    throwIfAborted(input.signal);
    if (result.ok) return { base, serverTime: result.serverTime };
    if (result.disabled) sawDisabled = true;
  }
  throw sawDisabled ? disabled() : unreachable();
};

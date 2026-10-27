import { requestSession } from "../session.js";
import { PaySdkError } from "../errors.js";
import {
  defaultTimers,
  orderFrameOrigins,
  resolveHosts,
  selectApiBase,
  type Timers,
} from "./api-base.js";
import type { ServerClock } from "./clock.js";
import { PayError, isAbortError } from "./errors.js";
import type { PayEventInput } from "./events.js";
import type { PayMode, PayRegion, SessionSourceOptions } from "./types.js";
import {
  PATHS,
  readError,
  readRedeem,
  readSessionExtras,
  toRedeemBody,
  type WireSessionResponse,
} from "./wire.js";

export const RENEW_LEAD_MS = 60_000;
const DEFAULT_TOKEN_TTL_S = 900;

export interface AuthOptions extends SessionSourceOptions {
  mode: PayMode;
  clientId?: string;
  apiBase?: string;
  allowedApiOrigins?: readonly string[];
  allowedWidgetOrigins?: readonly string[];
  fetch: typeof fetch;
  timers?: Timers;
  probeTimeoutMs?: number;
  clock: ServerClock;
  pageOrigin: () => string;
  emit: (event: PayEventInput) => void;
  onPhase: (phase: "session" | "ready") => void;
}

export interface Auth {
  ensure: (signal?: AbortSignal) => Promise<void>;
  renewIfStale: (generation: number, signal?: AbortSignal) => Promise<void>;
  failover: (failedBase: string, signal?: AbortSignal) => Promise<boolean>;
  authorize: (headers: Record<string, string>) => void;
  generation: () => number;
  base: () => string | null;
  widgetOrigins: () => string[];
  frameOrigins: (declared: readonly unknown[]) => string[];
  destroy: () => void;
}

const abortError = (): Error => {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
};

export const raceAbort = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
};

const sessionFailed = (message: string, status: number | null = null) =>
  new PayError("SESSION_FAILED", message, { status });

export const createAuth = (options: AuthOptions): Auth => {
  const timers = options.timers ?? defaultTimers;
  const lifetime = new AbortController();
  let token: string | null = null;
  let generation = 0;
  let expiresAt = 0;
  let base: string | null = null;
  let bases: string[] = [];
  let widgetOrigins: string[] = [];
  let widgetOriginByBase: Record<string, string> = {};
  let region: PayRegion | null = null;
  let inflight: Promise<void> | null = null;
  let failoverInflight: Promise<boolean> | null = null;
  let renewTimer: unknown = null;

  const scheduleRenewal = () => {
    if (renewTimer !== null) timers.clearTimeout(renewTimer);
    const delay = Math.max(0, expiresAt - RENEW_LEAD_MS - Date.now());
    renewTimer = timers.setTimeout(() => {
      renewTimer = null;
      void renew().catch(() => undefined);
    }, delay);
  };

  const fetchSession = async (signal: AbortSignal) => {
    try {
      return (await requestSession(
        {
          mode: options.mode,
          sessionEndpoint: options.sessionEndpoint,
          createSession: options.createSession,
        },
        signal,
      )) as WireSessionResponse;
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw error;
      throw sessionFailed(
        error instanceof PaySdkError ? error.message : "Could not create widget session",
      );
    }
  };

  let choice = 0;

  const chooseBase = async (
    signal: AbortSignal,
    exclude?: ReadonlySet<string>,
  ): Promise<{ base: string; current: boolean }> => {
    choice += 1;
    const mine = choice;
    const selected = await selectApiBase({
      bases,
      region,
      fetch: options.fetch,
      signal,
      timers,
      timeoutMs: options.probeTimeoutMs,
      exclude,
    });
    const current = mine === choice;
    if (current) {
      base = selected.base;
      options.clock.observe(selected.serverTime);
    }
    return { base: selected.base, current };
  };

  const establish = async (renewed: boolean): Promise<void> => {
    const signal = lifetime.signal;
    if (!renewed) options.onPhase("session");
    const excluded = new Set<string>();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const session = await fetchSession(signal);
      const extras = readSessionExtras(session);
      if (extras.payApi === false) {
        throw new PayError("PAY_API_UNAVAILABLE", "Pay API is switched off");
      }
      const declared = options.apiBase ? [options.apiBase] : extras.apiBases;
      if (declared.length === 0 || (extras.payApi !== true && !options.apiBase)) {
        throw new PayError("PAY_API_UNAVAILABLE", "The session names no pay API host");
      }
      const hosts = resolveHosts({
        apiBases: declared,
        widgetOrigins: extras.widgetOrigins,
        widgetUrl: extras.widgetUrl,
        allowedApiOrigins: options.allowedApiOrigins,
        allowedWidgetOrigins: options.allowedWidgetOrigins,
      });
      if (hosts.apiBases.length === 0) {
        throw new PayError("INVALID_API_BASE", "No usable pay API host in the session");
      }
      const clientId = options.clientId ?? extras.clientId;
      if (!clientId) throw sessionFailed("clientId is required to redeem the session");
      bases = hosts.apiBases;
      widgetOrigins = hosts.widgetOrigins;
      widgetOriginByBase = hosts.widgetOriginByBase;
      region = extras.region;
      let target = base;
      if (!target || !bases.includes(target) || excluded.has(target)) {
        target = (await chooseBase(signal, excluded)).base;
      }
      let response: Response;
      try {
        response = await options.fetch(`${target}${PATHS.redeem}`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(
            toRedeemBody({
              session: session.session,
              origin: options.pageOrigin(),
              clientId,
              mode: options.mode,
            }),
          ),
          credentials: "omit",
          cache: "no-store",
          signal,
        });
      } catch (error) {
        if (signal.aborted || isAbortError(error)) throw error;
        excluded.add(target);
        base = null;
        if (attempt === 0 && bases.some((entry) => !excluded.has(entry))) continue;
        throw new PayError("HOST_UNREACHABLE", "The pay API host did not answer");
      }
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = readError(response.status, data);
        if (error.code === "PAY_API_DISABLED") throw error;
        throw sessionFailed("The widget session was rejected", response.status);
      }
      const redeemed = readRedeem(data);
      if (redeemed.payApi === false) {
        throw new PayError("PAY_API_UNAVAILABLE", "Pay API is switched off");
      }
      if (!base) base = target;
      token = redeemed.accessToken;
      generation += 1;
      expiresAt = Date.now() + (redeemed.expiresIn ?? DEFAULT_TOKEN_TTL_S) * 1000;
      scheduleRenewal();
      options.onPhase("ready");
      options.emit({ type: "session.ready", renewed });
      return;
    }
    throw new PayError("HOST_UNREACHABLE", "The pay API host did not answer");
  };

  const provenWidgetOrigins = (): string[] => {
    const preferred = base ? widgetOriginByBase[base] : undefined;
    return preferred
      ? [preferred, ...widgetOrigins.filter((origin) => origin !== preferred)]
      : [...widgetOrigins];
  };

  const renew = (): Promise<void> => {
    if (lifetime.signal.aborted) return Promise.reject(abortError());
    if (!inflight) {
      inflight = establish(generation > 0).finally(() => {
        inflight = null;
      });
    }
    return inflight;
  };

  return {
    ensure: (signal) => {
      if (token && Date.now() < expiresAt - RENEW_LEAD_MS && !inflight) {
        return Promise.resolve();
      }
      return raceAbort(renew(), signal);
    },
    renewIfStale: (stale, signal) => {
      if (generation !== stale && !inflight) return Promise.resolve();
      return raceAbort(inflight ?? renew(), signal);
    },
    failover: (failedBase, signal) => {
      if (base !== failedBase) return Promise.resolve(base !== null);
      if (!failoverInflight) {
        failoverInflight = chooseBase(lifetime.signal, new Set([failedBase]))
          .then((result) => result.current || base !== failedBase)
          .catch(() => false)
          .finally(() => {
            failoverInflight = null;
          });
      }
      return raceAbort(failoverInflight, signal);
    },
    authorize: (headers) => {
      if (token) headers.Authorization = `Bearer ${token}`;
    },
    generation: () => generation,
    base: () => base,
    widgetOrigins: () => provenWidgetOrigins(),
    frameOrigins: (declared) =>
      orderFrameOrigins({
        declared,
        proven: provenWidgetOrigins(),
        allowedWidgetOrigins: options.allowedWidgetOrigins,
      }),
    destroy: () => {
      lifetime.abort();
      if (renewTimer !== null) timers.clearTimeout(renewTimer);
      renewTimer = null;
      token = null;
    },
  };
};

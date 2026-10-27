import { defaultTimers, type Timers } from "./api-base.js";
import { createAuth } from "./auth.js";
import { createServerClock, type ServerClock } from "./clock.js";
import { PayError, isAbortError, toPayError } from "./errors.js";
import { createEvent, type PayEvent, type PayEventInput } from "./events.js";
import { createEmitter, createStore, type ReadableStore } from "./store.js";
import type {
  CreateDepositInput,
  CreateSession,
  CreateWithdrawalInput,
  CryptoDeposit,
  Deposit,
  DepositQuote,
  FiatDeposit,
  FrameTicket,
  PayActivity,
  PayContext,
  PayMethods,
  PayMode,
  PayTheme,
  QuoteWithdrawalInput,
  Withdrawal,
  WithdrawalQuoteResult,
} from "./types.js";
import {
  IDEMPOTENCY_HEADER,
  PATHS,
  readActivity,
  readContext,
  readCryptoDepositResponse,
  readDeposit,
  readDepositQuote,
  readError,
  readFiatDepositResponse,
  readFrameTicket,
  readMethods,
  readOnramp,
  readWithdrawal,
  readWithdrawalQuote,
  toActivityQuery,
  toCreateDepositBody,
  toCreateWithdrawalBody,
  toCryptoDepositBody,
  toDepositQuoteQuery,
  toOnrampQuery,
  toQuoteWithdrawalBody,
  toReceiptBody,
} from "./wire.js";

export const MAX_RECEIPT_BYTES = 11 * 1024 * 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,200}$/;

export type ClientStatus = "idle" | "session" | "ready" | "error";

export interface ClientState {
  status: ClientStatus;
  error: PayError | null;
}

export interface PayClientOptions {
  mode: PayMode;
  sessionEndpoint?: string;
  createSession?: CreateSession;
  clientId?: string;
  allowedApiOrigins?: readonly string[];
  allowedWidgetOrigins?: readonly string[];
  apiBase?: string;
  fetch?: typeof fetch;
  locale?: string;
  onEvent?: (event: PayEvent) => void;
  timers?: Timers;
  probeTimeoutMs?: number;
}

export interface PayClient {
  readonly mode: PayMode;
  readonly locale: string | undefined;
  readonly state: ReadableStore<ClientState>;
  readonly clock: ServerClock;
  connect: (signal?: AbortSignal) => Promise<void>;
  getContext: (signal?: AbortSignal) => Promise<PayContext>;
  listMethods: (signal?: AbortSignal) => Promise<PayMethods>;
  quoteDeposit: (
    input: { methodId: string; amount: string },
    signal?: AbortSignal,
  ) => Promise<DepositQuote>;
  createCryptoDeposit: (
    input: { chainId: string; currency: string },
    opts?: { idempotencyKey?: string },
  ) => Promise<CryptoDeposit>;
  createDeposit: (
    input: CreateDepositInput,
    opts?: { idempotencyKey?: string },
  ) => Promise<FiatDeposit>;
  getDeposit: (id: string, signal?: AbortSignal) => Promise<Deposit>;
  attachReceipt: (id: string, file: Blob) => Promise<FiatDeposit>;
  getRequisitesFrameTicket: (id: string, signal?: AbortSignal) => Promise<FrameTicket>;
  getOnrampSession: (input: { theme?: PayTheme }) => Promise<{ url: string }>;
  quoteWithdrawal: (
    input: QuoteWithdrawalInput,
    signal?: AbortSignal,
  ) => Promise<WithdrawalQuoteResult>;
  createWithdrawal: (
    input: CreateWithdrawalInput,
    opts: { idempotencyKey: string },
  ) => Promise<Withdrawal>;
  getWithdrawal: (id: string, signal?: AbortSignal) => Promise<Withdrawal>;
  getActivity: (since: number, signal?: AbortSignal) => Promise<PayActivity>;
  widgetOrigins: () => string[];
  frameOrigins: (declared: readonly unknown[]) => string[];
  onEvent: (listener: (event: PayEvent) => void) => () => void;
  emit: (event: PayEventInput) => void;
  retain: () => () => void;
  readonly destroyed: boolean;
  destroy: () => void;
}

export const createIdempotencyKey = (): string => {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `bp_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
};

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new PayError("VALIDATION_FAILED", "Unreadable file", { details: { field: "file" } }));
    reader.onerror = () =>
      reject(new PayError("VALIDATION_FAILED", "Unreadable file", { details: { field: "file" } }));
    reader.readAsDataURL(file);
  });

interface RequestInit<T> {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
  read: (data: unknown) => T;
}

const linkSignals = (
  primary: AbortSignal,
  secondary: AbortSignal | undefined,
): { signal: AbortSignal; release: () => void } => {
  if (!secondary) return { signal: primary, release: () => undefined };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (primary.aborted || secondary.aborted) controller.abort();
  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    release: () => {
      primary.removeEventListener("abort", abort);
      secondary.removeEventListener("abort", abort);
    },
  };
};

const pageOrigin = (): string => {
  try {
    return window.location.origin;
  } catch {
    return "";
  }
};

export const createPayClient = (options: PayClientOptions): PayClient => {
  const fetcher: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timers = options.timers ?? defaultTimers;
  const clock = createServerClock();
  const emitter = createEmitter<PayEvent>();
  const state = createStore<ClientState>({ status: "idle", error: null });
  const lifetime = new AbortController();
  let destroyed = false;
  let leases = 0;
  let pendingDestroy: unknown = null;

  if (options.onEvent) emitter.subscribe(options.onEvent);

  const emit = (input: PayEventInput) => {
    if (destroyed) return;
    emitter.emit(createEvent(input));
  };

  const auth = createAuth({
    mode: options.mode,
    sessionEndpoint: options.sessionEndpoint,
    createSession: options.createSession,
    clientId: options.clientId,
    apiBase: options.apiBase,
    allowedApiOrigins: options.allowedApiOrigins,
    allowedWidgetOrigins: options.allowedWidgetOrigins,
    fetch: fetcher,
    timers,
    probeTimeoutMs: options.probeTimeoutMs,
    clock,
    pageOrigin,
    emit,
    onPhase: (phase) => {
      if (phase === "ready") state.set({ status: "ready", error: null });
      else if (state.getSnapshot().status !== "ready") {
        state.set({ status: "session", error: null });
      }
    },
  });

  const failSession = (error: unknown): never => {
    if (!isAbortError(error)) {
      const payError = toPayError(error);
      if (!destroyed) {
        state.set({ status: "error", error: payError });
        emit({ type: "error", code: payError.code, scope: "session" });
      }
      throw payError;
    }
    throw error;
  };

  const ensure = async (signal?: AbortSignal) => {
    if (destroyed) throw new PayError("SESSION_FAILED", "The client was destroyed");
    const current = state.getSnapshot().error;
    if (current?.code === "PAY_API_DISABLED") throw current;
    try {
      await auth.ensure(signal);
    } catch (error) {
      failSession(error);
    }
  };

  const request = async <T>(init: RequestInit<T>): Promise<T> => {
    if (init.idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(init.idempotencyKey)) {
      throw new PayError("VALIDATION_FAILED", "Invalid idempotency key", {
        details: { field: IDEMPOTENCY_HEADER },
      });
    }
    let renewed = false;
    let switched = false;
    for (;;) {
      await ensure(init.signal);
      const base = auth.base();
      if (!base) throw new PayError("HOST_UNREACHABLE", "No pay API host");
      const generation = auth.generation();
      const query = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
      const headers: Record<string, string> = { Accept: "application/json" };
      if (init.body !== undefined) headers["Content-Type"] = "application/json";
      if (init.idempotencyKey) headers[IDEMPOTENCY_HEADER] = init.idempotencyKey;
      auth.authorize(headers);
      let response: Response;
      const linked = linkSignals(lifetime.signal, init.signal);
      try {
        response = await fetcher(`${base}${init.path}${query}`, {
          method: init.method,
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          credentials: "omit",
          cache: "no-store",
          signal: linked.signal,
        });
      } catch (error) {
        if (init.signal?.aborted || lifetime.signal.aborted || isAbortError(error)) {
          throw error;
        }
        if (!switched && (await auth.failover(base, init.signal))) {
          switched = true;
          continue;
        }
        throw new PayError("NETWORK_ERROR", "The pay API is unreachable");
      } finally {
        linked.release();
      }
      const data: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const serverTime =
          data && typeof data === "object" ? (data as { server_time?: unknown }).server_time : null;
        if (typeof serverTime === "number") clock.observe(serverTime);
        return init.read(data);
      }
      const error = readError(response.status, data);
      if (error.code === "PAY_API_DISABLED") failSession(error);
      if (response.status === 401 && error.code === "UNAUTHENTICATED") {
        if (renewed) {
          failSession(
            new PayError("SESSION_FAILED", "The session was rejected after renewal", {
              status: 401,
            }),
          );
        }
        renewed = true;
        emit({ type: "session.expired" });
        try {
          await auth.renewIfStale(generation, init.signal);
        } catch (renewError) {
          failSession(renewError);
        }
        continue;
      }
      throw error;
    }
  };

  const client: PayClient = {
    mode: options.mode,
    locale: options.locale,
    state,
    clock,
    connect: (signal) => ensure(signal),
    getContext: (signal) =>
      request({ method: "GET", path: PATHS.context, signal, read: readContext }),
    listMethods: (signal) =>
      request({ method: "GET", path: PATHS.methods, signal, read: readMethods }),
    quoteDeposit: (input, signal) =>
      request({
        method: "GET",
        path: PATHS.depositQuote,
        query: toDepositQuoteQuery(input),
        signal,
        read: readDepositQuote,
      }),
    createCryptoDeposit: (input, opts) =>
      request({
        method: "POST",
        path: PATHS.cryptoDeposit,
        body: toCryptoDepositBody(input),
        idempotencyKey: opts?.idempotencyKey,
        read: readCryptoDepositResponse,
      }),
    createDeposit: (input, opts) =>
      request({
        method: "POST",
        path: PATHS.deposits,
        body: toCreateDepositBody(input),
        idempotencyKey: opts?.idempotencyKey ?? createIdempotencyKey(),
        read: readFiatDepositResponse,
      }),
    getDeposit: (id, signal) =>
      request({ method: "GET", path: PATHS.deposit(id), signal, read: readDeposit }),
    attachReceipt: async (id, file) => {
      if (file.size > MAX_RECEIPT_BYTES) {
        throw new PayError("VALIDATION_FAILED", "The file is too large", {
          details: { field: "file", max: String(MAX_RECEIPT_BYTES) },
        });
      }
      const dataUrl = await readAsDataUrl(file);
      return request({
        method: "POST",
        path: PATHS.receipt(id),
        body: toReceiptBody(dataUrl),
        read: readFiatDepositResponse,
      });
    },
    getRequisitesFrameTicket: (id, signal) =>
      request({ method: "GET", path: PATHS.frameTicket(id), signal, read: readFrameTicket }),
    getOnrampSession: (input) =>
      request({
        method: "GET",
        path: PATHS.onramp,
        query: toOnrampQuery(input),
        read: readOnramp,
      }),
    quoteWithdrawal: (input, signal) =>
      request({
        method: "POST",
        path: PATHS.withdrawalQuote,
        body: toQuoteWithdrawalBody(input),
        signal,
        read: readWithdrawalQuote,
      }),
    createWithdrawal: (input, opts) => {
      if (!opts?.idempotencyKey) {
        return Promise.reject(
          new PayError("VALIDATION_FAILED", "Idempotency key is required", {
            details: { field: IDEMPOTENCY_HEADER },
          }),
        );
      }
      return request({
        method: "POST",
        path: PATHS.withdrawals,
        body: toCreateWithdrawalBody(input),
        idempotencyKey: opts.idempotencyKey,
        read: readWithdrawal,
      });
    },
    getWithdrawal: (id, signal) =>
      request({ method: "GET", path: PATHS.withdrawal(id), signal, read: readWithdrawal }),
    getActivity: (since, signal) =>
      request({
        method: "GET",
        path: PATHS.activity,
        query: toActivityQuery(since),
        signal,
        read: readActivity,
      }),
    widgetOrigins: () => auth.widgetOrigins(),
    frameOrigins: (declared) => auth.frameOrigins(declared),
    onEvent: (listener) => emitter.subscribe(listener),
    emit,
    retain: () => {
      leases += 1;
      if (pendingDestroy !== null) {
        timers.clearTimeout(pendingDestroy);
        pendingDestroy = null;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        leases -= 1;
        if (leases > 0) return;
        pendingDestroy = timers.setTimeout(() => {
          pendingDestroy = null;
          if (leases === 0) client.destroy();
        }, 0);
      };
    },
    get destroyed() {
      return destroyed;
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      lifetime.abort();
      auth.destroy();
    },
  };
  return client;
};

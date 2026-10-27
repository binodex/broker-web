import { defaultTimers, type Timers } from "../api-base.js";
import type { PayClient } from "../client.js";
import { createIntentKeys } from "../intent.js";
import { toCreateDepositBody, toCryptoDepositBody } from "../wire.js";
import { PayError, isAbortError, toPayError } from "../errors.js";
import { compareDecimal, isPositiveDecimal, sanitizeAmountInput } from "../money.js";
import { createPoller, type Poller } from "../poll.js";
import {
  getPayView,
  isTerminalDepositStatus,
  shownPayStatus,
  type PayView,
  type RequisitesView,
} from "../rules/requisites.js";
import { createStore, type ReadableStore } from "../store.js";
import type {
  CreditedDeposit,
  CryptoDeposit,
  Deposit,
  DepositQuote,
  FiatDeposit,
  FiatDepositStatus,
  FiatMethod,
  PayContext,
  PayMethod,
  PayMethods,
  PayTheme,
} from "../types.js";

export type DepositStep =
  | "loading"
  | "pick-method"
  | "enter-amount"
  | "creating"
  | "crypto-address"
  | "requisites"
  | "redirect"
  | "onramp"
  | "done"
  | "error";

export type DepositOutcome = "credited" | "completed" | "failed" | "expired";

export interface DepositFlowState {
  step: DepositStep;
  context: PayContext | null;
  methods: PayMethods | null;
  method: PayMethod | null;
  amount: string;
  customerPhone: string;
  amountError: PayError | null;
  quote: DepositQuote | null;
  quoteLoading: boolean;
  quoteError: PayError | null;
  deposit: Deposit | null;
  view: PayView | null;
  shownStatus: FiatDepositStatus | null;
  knownRequisites: RequisitesView | null;
  onrampUrl: string | null;
  onrampLoading: boolean;
  onrampError: PayError | null;
  credited: CreditedDeposit[];
  receiptPending: boolean;
  receiptError: PayError | null;
  outcome: DepositOutcome | null;
  submitError: PayError | null;
  error: PayError | null;
}

export interface DepositFlowActions {
  start: () => void;
  selectMethod: (methodId: string) => void;
  setAmount: (raw: string) => void;
  setCustomerPhone: (value: string) => void;
  submit: () => Promise<void>;
  attachReceipt: (file: Blob) => Promise<void>;
  loadOnramp: () => Promise<string | null>;
  retryOnramp: () => Promise<string | null>;
  refreshContext: () => Promise<void>;
  back: () => void;
  retry: () => void;
  reset: () => void;
  destroy: () => void;
}

export interface FlowStore<S, A> extends ReadableStore<S> {
  actions: A;
}

export type DepositFlow = FlowStore<DepositFlowState, DepositFlowActions>;

export interface DepositFlowOptions {
  quoteDebounceMs?: number;
  depositPollMs?: number;
  activityPollMs?: number;
  maxPollMs?: number;
  returnUrl?: string;
  onrampTheme?: PayTheme;
  timers?: Timers;
}

const INITIAL: DepositFlowState = {
  step: "loading",
  context: null,
  methods: null,
  method: null,
  amount: "",
  customerPhone: "",
  amountError: null,
  quote: null,
  quoteLoading: false,
  quoteError: null,
  deposit: null,
  view: null,
  shownStatus: null,
  knownRequisites: null,
  onrampUrl: null,
  onrampLoading: false,
  onrampError: null,
  credited: [],
  receiptPending: false,
  receiptError: null,
  outcome: null,
  submitError: null,
  error: null,
};

const routeKey = (chainId: string, currency: string) => `${chainId}/${currency}`;

const stepForView = (view: PayView): DepositStep =>
  view.kind === "redirect" ? "redirect" : "requisites";

export const fiatAmountHint = (
  method: FiatMethod,
  amount: string,
): PayError | null => {
  if (!amount) return null;
  if (!isPositiveDecimal(amount)) return new PayError("VALIDATION_FAILED", "Invalid amount", { details: { field: "amount" } });
  if (method.minAmount && compareDecimal(amount, method.minAmount) === -1) {
    return new PayError("AMOUNT_TOO_SMALL", "Amount below minimum", {
      details: { min: method.minAmount, currency: method.currency },
    });
  }
  if (method.maxAmount && compareDecimal(amount, method.maxAmount) === 1) {
    return new PayError("AMOUNT_TOO_LARGE", "Amount above maximum", {
      details: { max: method.maxAmount, currency: method.currency },
    });
  }
  return null;
};

export const createDepositFlow = (
  client: PayClient,
  options: DepositFlowOptions = {},
): DepositFlow => {
  const timers = options.timers ?? defaultTimers;
  const store = createStore<DepositFlowState>(INITIAL);
  const cryptoCache = new Map<string, CryptoDeposit>();
  const cryptoInflight = new Map<string, Promise<CryptoDeposit>>();
  const seenPayments = new Set<number>();
  let loadController: AbortController | null = null;
  let quoteController: AbortController | null = null;
  let quoteTimer: unknown = null;
  let depositPoller: Poller | null = null;
  let activityPoller: Poller | null = null;
  let onrampPromise: Promise<string | null> | null = null;
  const intents = createIntentKeys();
  const cryptoIntents = createIntentKeys();
  let since = 0;
  let selection = 0;
  let destroyed = false;
  let started = false;

  const get = store.getSnapshot;
  const set = store.set;

  const reportError = (error: PayError, scope: string) => {
    client.emit({ type: "error", code: error.code, scope });
  };

  const clearQuote = () => {
    if (quoteTimer !== null) timers.clearTimeout(quoteTimer);
    quoteTimer = null;
    quoteController?.abort();
    quoteController = null;
  };

  const stopDepositPoll = () => {
    depositPoller?.stop();
    depositPoller = null;
  };

  const releaseOnramp = () => {
    if (!onrampPromise && get().onrampUrl === null && get().onrampError === null) return;
    onrampPromise = null;
    set({ onrampUrl: null, onrampLoading: false, onrampError: null });
  };

  const isCryptoReusable = (deposit: CryptoDeposit): boolean =>
    deposit.status === "active" &&
    (deposit.expiresAt === null || deposit.expiresAt > client.clock.now());

  const finish = (outcome: DepositOutcome) => {
    stopDepositPoll();
    set({ step: "done", outcome });
  };

  const applyFiat = (deposit: FiatDeposit) => {
    const previous = get();
    const known = previous.knownRequisites;
    const view = getPayView(deposit, known, client.clock.now());
    const shownStatus = shownPayStatus(deposit, view);
    const knownRequisites = view.kind === "requisites" ? view.requisites : known;
    if (
      previous.deposit?.id === deposit.id &&
      previous.deposit.kind === "fiat" &&
      previous.deposit.status !== deposit.status
    ) {
      client.emit({ type: "deposit.status", depositId: deposit.id, status: deposit.status });
    }
    set({ deposit, view, shownStatus, knownRequisites });
    if (isTerminalDepositStatus(deposit.status)) {
      finish(deposit.status as DepositOutcome);
    }
  };

  const pollDeposit = (id: string) => {
    stopDepositPoll();
    depositPoller = createPoller(
      async (signal) => {
        const deposit = await client.getDeposit(id, signal);
        if (destroyed || get().deposit?.id !== id) return "stop";
        if (deposit.kind === "fiat") {
          applyFiat(deposit);
          return isTerminalDepositStatus(deposit.status) ? "stop" : "continue";
        }
        const previous = get().deposit;
        if (previous && previous.kind === "crypto" && previous.status !== deposit.status) {
          client.emit({ type: "deposit.status", depositId: deposit.id, status: deposit.status });
        }
        const key = routeKey(deposit.chainId, deposit.currency);
        if (deposit.status === "active") cryptoCache.set(key, deposit);
        else cryptoCache.delete(key);
        set({ deposit });
        return deposit.status === "active" ? "continue" : "stop";
      },
      {
        intervalMs: options.depositPollMs ?? 5000,
        maxIntervalMs: options.maxPollMs ?? 30_000,
        immediate: false,
        timers,
      },
    );
    depositPoller.start();
  };

  const startActivity = () => {
    if (activityPoller) return;
    activityPoller = createPoller(
      async (signal) => {
        const activity = await client.getActivity(since, signal);
        const fresh = activity.deposits.filter(
          (entry) => !seenPayments.has(entry.paymentId) && entry.creditedAt >= since,
        );
        if (fresh.length === 0) return "continue";
        fresh.forEach((entry) => {
          seenPayments.add(entry.paymentId);
          client.emit({
            type: "deposit.credited",
            paymentId: entry.paymentId,
            amountUsd: entry.amountUsd,
            depositSource: entry.source,
            creditedAt: entry.creditedAt,
          });
        });
        set((state) => ({ credited: [...state.credited, ...fresh] }));
        const step = get().step;
        const expected = step === "crypto-address" ? "crypto" : step === "onramp" ? "onramp" : null;
        if (expected && fresh.some((entry) => entry.source === expected)) finish("credited");
        void actions.refreshContext();
        return "continue";
      },
      {
        intervalMs: options.activityPollMs ?? 10_000,
        maxIntervalMs: options.maxPollMs ?? 30_000,
        immediate: false,
        timers,
      },
    );
    activityPoller.start();
  };

  const load = () => {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    set({ step: "loading", error: null });
    Promise.all([client.getContext(controller.signal), client.listMethods(controller.signal)])
      .then(([context, methods]) => {
        if (destroyed || controller.signal.aborted) return;
        since = context.serverTime;
        set({ context, methods, step: "pick-method" });
        startActivity();
      })
      .catch((error: unknown) => {
        if (destroyed || controller.signal.aborted || isAbortError(error)) return;
        const payError = toPayError(error);
        set({ step: "error", error: payError });
        reportError(payError, "load");
      });
  };

  const scheduleQuote = () => {
    clearQuote();
    const { method, amount, amountError } = get();
    if (!method || method.kind !== "fiat" || !amount || amountError) {
      set({ quote: null, quoteLoading: false, quoteError: null });
      return;
    }
    set({ quoteLoading: true, quoteError: null });
    quoteTimer = timers.setTimeout(() => {
      quoteTimer = null;
      const controller = new AbortController();
      quoteController = controller;
      client
        .quoteDeposit({ methodId: method.id, amount }, controller.signal)
        .then((quote) => {
          if (controller.signal.aborted) return;
          set({ quote, quoteLoading: false });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          set({ quote: null, quoteLoading: false, quoteError: toPayError(error) });
        });
    }, options.quoteDebounceMs ?? 400);
  };

  const openCrypto = async (method: Extract<PayMethod, { kind: "crypto" }>, token: number) => {
    const key = routeKey(method.chainId, method.currency);
    const cached = cryptoCache.get(key);
    if (cached && isCryptoReusable(cached)) {
      set({ step: "crypto-address", deposit: cached, submitError: null });
      pollDeposit(cached.id);
      return;
    }
    cryptoCache.delete(key);
    set({ step: "creating", deposit: null, submitError: null });
    let pending = cryptoInflight.get(key);
    let created = false;
    if (!pending) {
      created = true;
      const input = { chainId: method.chainId, currency: method.currency };
      pending = client
        .createCryptoDeposit(input, { idempotencyKey: cryptoIntents.keyFor(toCryptoDepositBody(input)) })
        .then(
          (deposit) => {
            cryptoIntents.settle({ ok: true });
            return deposit;
          },
          (error: unknown) => {
            cryptoIntents.settle({ ok: false, error });
            throw error;
          },
        )
        .finally(() => cryptoInflight.delete(key));
      cryptoInflight.set(key, pending);
    }
    try {
      const deposit = await pending;
      if (deposit.status === "active") cryptoCache.set(key, deposit);
      if (created) {
        client.emit({
          type: "deposit.created",
          depositId: deposit.id,
          kind: "crypto",
          methodId: method.id,
        });
      }
      if (destroyed || token !== selection) return;
      set({ step: "crypto-address", deposit });
      pollDeposit(deposit.id);
    } catch (error) {
      if (destroyed || token !== selection) return;
      const payError = toPayError(error);
      set({ step: "pick-method", submitError: payError });
      reportError(payError, "deposit.create");
    }
  };

  const actions: DepositFlowActions = {
    start: () => {
      if (started || destroyed) return;
      started = true;
      load();
    },
    selectMethod: (methodId) => {
      const methods = get().methods;
      const method = methods?.methods.find((entry) => entry.id === methodId) ?? null;
      if (!method || destroyed) return;
      selection += 1;
      clearQuote();
      stopDepositPoll();
      if (method.kind !== "onramp") releaseOnramp();
      client.emit({ type: "method.selected", methodId: method.id });
      set({
        method,
        amount: "",
        amountError: null,
        quote: null,
        quoteLoading: false,
        quoteError: null,
        deposit: null,
        view: null,
        shownStatus: null,
        knownRequisites: null,
        submitError: null,
        outcome: null,
      });
      if (method.kind === "crypto") {
        if (!method.available) {
          set({ submitError: new PayError("METHOD_UNAVAILABLE") });
          return;
        }
        void openCrypto(method, selection);
        return;
      }
      if (method.kind === "onramp") {
        set({ step: "onramp" });
        void actions.loadOnramp();
        return;
      }
      set({ step: "enter-amount" });
    },
    setAmount: (raw) => {
      const { method, amount: previous } = get();
      const rupees = method?.kind === "fiat" && method.rail === "in";
      const amount = sanitizeAmountInput(rupees ? raw.replace(/,/g, "") : raw, {
        decimals: rupees ? 0 : 2,
      });
      const amountError = method?.kind === "fiat" ? fiatAmountHint(method, amount) : null;
      set({ amount, amountError, submitError: null });
      scheduleQuote();
    },
    setCustomerPhone: (value) => {
      const customerPhone = value.replace(/[^\d+\s()-]/g, "").slice(0, 32);
      set({ customerPhone });
    },
    submit: async () => {
      const state = get();
      const method = state.method;
      if (!method || method.kind !== "fiat" || state.step === "creating") return;
      const hint = fiatAmountHint(method, state.amount);
      if (!state.amount || hint) {
        set({ amountError: hint ?? new PayError("VALIDATION_FAILED", "Amount required", { details: { field: "amount" } }) });
        return;
      }
      const input = {
        methodId: method.id,
        amount: state.amount,
        ...(state.customerPhone.trim()
          ? { customerPhone: state.customerPhone.replace(/[\s()-]/g, "") }
          : {}),
        ...(options.returnUrl ? { returnUrl: options.returnUrl } : {}),
      };
      const idempotencyKey = intents.keyFor(toCreateDepositBody(input));
      const token = selection;
      clearQuote();
      set({ step: "creating", submitError: null, quoteLoading: false });
      try {
        let deposit: FiatDeposit;
        try {
          deposit = await client.createDeposit(input, { idempotencyKey });
          intents.settle({ ok: true });
        } catch (error) {
          intents.settle({ ok: false, error });
          throw error;
        }
        client.emit({
          type: "deposit.created",
          depositId: deposit.id,
          kind: "fiat",
          methodId: method.id,
        });
        if (destroyed || token !== selection) return;
        set({ knownRequisites: null, deposit: null });
        applyFiat(deposit);
        if (get().step === "done") return;
        const view = get().view;
        set({ step: view ? stepForView(view) : "requisites" });
        pollDeposit(deposit.id);
      } catch (error) {
        if (destroyed || token !== selection) return;
        const payError = toPayError(error);
        set({ step: "enter-amount", submitError: payError });
        reportError(payError, "deposit.create");
      }
    },
    attachReceipt: async (file) => {
      const deposit = get().deposit;
      if (!deposit || deposit.kind !== "fiat" || get().receiptPending) return;
      set({ receiptPending: true, receiptError: null });
      try {
        const updated = await client.attachReceipt(deposit.id, file);
        if (destroyed || get().deposit?.id !== deposit.id) return;
        set({ receiptPending: false });
        applyFiat(updated);
      } catch (error) {
        if (destroyed) return;
        const payError = toPayError(error);
        set({ receiptPending: false, receiptError: payError });
        reportError(payError, "deposit.receipt");
      }
    },
    loadOnramp: () => {
      if (onrampPromise) return onrampPromise;
      set({ onrampLoading: true, onrampError: null });
      const request: Promise<string | null> = client
        .getOnrampSession(options.onrampTheme ? { theme: options.onrampTheme } : {})
        .then(({ url }) => {
          if (onrampPromise !== request) return null;
          set({ onrampUrl: url, onrampLoading: false });
          return url;
        })
        .catch((error: unknown) => {
          if (onrampPromise !== request) return null;
          const payError = toPayError(error);
          set({ onrampLoading: false, onrampError: payError });
          reportError(payError, "onramp");
          return null;
        });
      onrampPromise = request;
      return request;
    },
    retryOnramp: () => {
      if (get().onrampLoading) return onrampPromise ?? Promise.resolve(null);
      onrampPromise = null;
      set({ onrampUrl: null });
      return actions.loadOnramp();
    },
    refreshContext: async () => {
      try {
        const context = await client.getContext();
        if (!destroyed) set({ context });
      } catch {
        return;
      }
    },
    back: () => {
      selection += 1;
      clearQuote();
      stopDepositPoll();
      releaseOnramp();
      set({
        step: get().methods ? "pick-method" : "loading",
        method: null,
        deposit: null,
        view: null,
        shownStatus: null,
        knownRequisites: null,
        submitError: null,
        outcome: null,
        amount: "",
        amountError: null,
        quote: null,
        quoteError: null,
        quoteLoading: false,
      });
    },
    retry: () => {
      if (get().step === "error" || !get().methods) {
        load();
        return;
      }
      const method = get().method;
      if (method?.kind === "crypto") actions.selectMethod(method.id);
      else if (method?.kind === "fiat" && get().step === "enter-amount") void actions.submit();
      else if (method?.kind === "onramp") void actions.retryOnramp();
    },
    reset: () => {
      actions.back();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearQuote();
      stopDepositPoll();
      activityPoller?.stop();
      activityPoller = null;
      loadController?.abort();
    },
  };

  return { getSnapshot: store.getSnapshot, subscribe: store.subscribe, actions };
};

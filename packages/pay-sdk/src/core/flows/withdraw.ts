import { defaultTimers, type Timers } from "../api-base.js";
import type { PayClient } from "../client.js";
import { createIntentKeys } from "../intent.js";
import { toCreateWithdrawalBody } from "../wire.js";
import { PayError, isAbortError, toPayError } from "../errors.js";
import { compareDecimal, isPositiveDecimal, sanitizeAmountInput, toFixed2 } from "../money.js";
import { createPoller, type Poller } from "../poll.js";
import { isValidWithdrawAddress } from "../rules/address.js";
import { acceptSlippagePct } from "../rules/slippage.js";
import { createStore } from "../store.js";
import type {
  CryptoMethod,
  PayContext,
  PayMethods,
  SlippageWarning,
  Withdrawal,
  WithdrawalQuote,
  WithdrawalStatus,
} from "../types.js";
import type { FlowStore } from "./deposit.js";

export type WithdrawStep =
  | "loading"
  | "form"
  | "quoting"
  | "slippage-confirm"
  | "two-factor"
  | "submitting"
  | "status"
  | "error";

export interface WithdrawFlowState {
  step: WithdrawStep;
  context: PayContext | null;
  methods: PayMethods | null;
  method: CryptoMethod | null;
  address: string;
  amount: string;
  addressError: PayError | null;
  amountError: PayError | null;
  quote: WithdrawalQuote | null;
  quoteError: PayError | null;
  slippageWarning: SlippageWarning | null;
  acceptedSlippagePct: number | null;
  twoFactorRequired: boolean;
  twoFactorCode: string;
  withdrawal: Withdrawal | null;
  submitError: PayError | null;
  error: PayError | null;
}

export interface WithdrawFlowActions {
  start: () => void;
  selectMethod: (methodId: string) => void;
  setAddress: (value: string) => void;
  setAmount: (raw: string) => void;
  setMax: () => void;
  acceptSlippage: () => void;
  setTwoFactorCode: (value: string) => void;
  submit: () => Promise<void>;
  requote: () => void;
  refreshContext: () => Promise<void>;
  retry: () => void;
  reset: () => void;
  destroy: () => void;
}

export type WithdrawFlow = FlowStore<WithdrawFlowState, WithdrawFlowActions>;

export interface WithdrawFlowOptions {
  quoteDebounceMs?: number;
  pollMs?: number;
  maxPollMs?: number;
  timers?: Timers;
}

const INITIAL: WithdrawFlowState = {
  step: "loading",
  context: null,
  methods: null,
  method: null,
  address: "",
  amount: "",
  addressError: null,
  amountError: null,
  quote: null,
  quoteError: null,
  slippageWarning: null,
  acceptedSlippagePct: null,
  twoFactorRequired: false,
  twoFactorCode: "",
  withdrawal: null,
  submitError: null,
  error: null,
};

const TERMINAL: ReadonlySet<WithdrawalStatus> = new Set<WithdrawalStatus>([
  "completed",
  "failed",
  "cancelled",
  "refunded",
]);

export const isTerminalWithdrawal = (withdrawal: Withdrawal): boolean =>
  TERMINAL.has(withdrawal.status);

const TWO_FA_CODES = new Set(["TWO_FA_REQUIRED", "TWO_FA_INVALID", "TWO_FA_REUSED", "TWO_FA_LOCKED"]);

export const withdrawableOf = (context: PayContext | null): string | null =>
  context ? (context.balance.withdrawable ?? context.balance.available) : null;

export const withdrawAmountHint = (
  amount: string,
  method: CryptoMethod | null,
  methods: PayMethods | null,
  context: PayContext | null,
): PayError | null => {
  if (!amount) return null;
  if (!isPositiveDecimal(amount)) {
    return new PayError("VALIDATION_FAILED", "Invalid amount", { details: { field: "amount" } });
  }
  const min = method?.withdrawal?.minUsd;
  if (min && compareDecimal(amount, min) === -1) {
    return new PayError("AMOUNT_TOO_SMALL", "Amount below minimum", {
      details: { min, currency: "USD" },
    });
  }
  const max = methods?.maxWithdrawUsd;
  if (max && compareDecimal(amount, max) === 1) {
    return new PayError("AMOUNT_TOO_LARGE", "Amount above maximum", {
      details: { max, currency: "USD" },
    });
  }
  const available = withdrawableOf(context);
  if (available && compareDecimal(amount, available) === 1) {
    return new PayError("INSUFFICIENT_BALANCE", "Insufficient balance");
  }
  return null;
};

export const createWithdrawFlow = (
  client: PayClient,
  options: WithdrawFlowOptions = {},
): WithdrawFlow => {
  const timers = options.timers ?? defaultTimers;
  const store = createStore<WithdrawFlowState>(INITIAL);
  const get = store.getSnapshot;
  const set = store.set;
  let loadController: AbortController | null = null;
  let quoteController: AbortController | null = null;
  let quoteTimer: unknown = null;
  let poller: Poller | null = null;
  let submitted: { id: string; quote: WithdrawalQuote | null } | null = null;
  const intents = createIntentKeys();
  let destroyed = false;
  let started = false;
  let intent = 0;

  const clearQuote = () => {
    if (quoteTimer !== null) timers.clearTimeout(quoteTimer);
    quoteTimer = null;
    quoteController?.abort();
    quoteController = null;
  };

  const inputChanged = () => {
    intent += 1;
    set({ acceptedSlippagePct: null, slippageWarning: null, submitError: null });
  };

  const validate = () => {
    const { address, amount, method, methods, context } = get();
    const addressError =
      address.trim() && method && !isValidWithdrawAddress(method.chainId, address)
        ? new PayError("INVALID_ADDRESS", "Invalid address")
        : null;
    const amountError = withdrawAmountHint(amount, method, methods, context);
    set({ addressError, amountError });
    return { addressError, amountError };
  };

  const canQuote = (): boolean => {
    const s = get();
    return (
      !!s.method &&
      !!s.address.trim() &&
      !!s.amount &&
      !s.addressError &&
      !s.amountError
    );
  };

  const runQuote = (delay: number) => {
    clearQuote();
    set({ quote: null, quoteError: null });
    if (!canQuote()) {
      if (get().step === "quoting" || get().step === "slippage-confirm") set({ step: "form" });
      return;
    }
    set({ step: "quoting" });
    const token = intent;
    quoteTimer = timers.setTimeout(() => {
      quoteTimer = null;
      const s = get();
      const method = s.method;
      if (!method) return;
      const controller = new AbortController();
      quoteController = controller;
      client
        .quoteWithdrawal(
          {
            methodId: method.id,
            address: s.address.trim(),
            amount: s.amount,
            ...(s.acceptedSlippagePct !== null ? { acceptSlippagePct: s.acceptedSlippagePct } : {}),
          },
          controller.signal,
        )
        .then((result) => {
          if (controller.signal.aborted || token !== intent || destroyed) return;
          if (result.quote) {
            set({ quote: result.quote, slippageWarning: null, step: "form" });
          } else {
            set({ quote: null, slippageWarning: result.slippageWarning, step: "slippage-confirm" });
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error) || token !== intent) return;
          set({ quote: null, quoteError: toPayError(error), step: "form" });
        });
    }, delay);
  };

  // Until the rail reports its own figures, the status shows the quote this
  // withdrawal was submitted with, as the web modal does.
  const withSubmittedQuote = (withdrawal: Withdrawal): Withdrawal => {
    const quote = submitted?.id === withdrawal.id ? submitted.quote : null;
    if (!quote || withdrawal.receiveAmount !== null) return withdrawal;
    return {
      ...withdrawal,
      receiveAmount: quote.receiveAmount,
      receiveAmountUsd: withdrawal.receiveAmountUsd ?? quote.receiveAmountUsd,
      etaSeconds: withdrawal.etaSeconds ?? quote.etaSeconds,
    };
  };

  const applyWithdrawal = (reported: Withdrawal) => {
    const withdrawal = withSubmittedQuote(reported);
    const previous = get().withdrawal;
    if (
      !previous ||
      previous.id !== withdrawal.id ||
      previous.status !== withdrawal.status ||
      previous.displayStatus !== withdrawal.displayStatus
    ) {
      client.emit({
        type: "withdrawal.status",
        withdrawalId: withdrawal.id,
        status: withdrawal.status,
        displayStatus: withdrawal.displayStatus,
      });
    }
    set({ withdrawal, step: "status" });
  };

  const track = (id: string, initial: Withdrawal | null) => {
    poller?.stop();
    if (initial) applyWithdrawal(initial);
    else set({ step: "status" });
    if (initial && isTerminalWithdrawal(initial)) return;
    poller = createPoller(
      async (signal) => {
        const withdrawal = await client.getWithdrawal(id, signal);
        if (destroyed) return "stop";
        applyWithdrawal(withdrawal);
        return isTerminalWithdrawal(withdrawal) ? "stop" : "continue";
      },
      {
        intervalMs: options.pollMs ?? 4000,
        maxIntervalMs: options.maxPollMs ?? 30_000,
        immediate: initial === null,
        timers,
      },
    );
    poller.start();
  };

  const load = () => {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    set({ step: "loading", error: null });
    Promise.all([client.getContext(controller.signal), client.listMethods(controller.signal)])
      .then(([context, methods]) => {
        if (destroyed || controller.signal.aborted) return;
        const crypto = methods.methods.filter(
          (entry): entry is CryptoMethod => entry.kind === "crypto",
        );
        set({
          context,
          methods,
          method: get().method ?? crypto[0] ?? null,
          twoFactorRequired: context.withdrawal?.twoFactorRequired ?? false,
          step: "form",
        });
        const inFlight = context.withdrawal?.inFlightId;
        if (inFlight) track(inFlight, null);
      })
      .catch((error: unknown) => {
        if (destroyed || controller.signal.aborted || isAbortError(error)) return;
        const payError = toPayError(error);
        set({ step: "error", error: payError });
        client.emit({ type: "error", code: payError.code, scope: "load" });
      });
  };

  const formLocked = () => {
    const step = get().step;
    return step === "submitting" || step === "status" || step === "loading";
  };

  const actions: WithdrawFlowActions = {
    start: () => {
      if (started || destroyed) return;
      started = true;
      load();
    },
    selectMethod: (methodId) => {
      if (formLocked()) return;
      const method = get().methods?.methods.find(
        (entry): entry is CryptoMethod => entry.kind === "crypto" && entry.id === methodId,
      );
      if (!method) return;
      client.emit({ type: "method.selected", methodId });
      inputChanged();
      set({ method });
      validate();
      runQuote(options.quoteDebounceMs ?? 400);
    },
    setAddress: (value) => {
      if (formLocked()) return;
      const address = value.replace(/\s+/g, "").slice(0, 128);
      if (address === get().address) return;
      inputChanged();
      set({ address });
      validate();
      runQuote(options.quoteDebounceMs ?? 400);
    },
    setAmount: (raw) => {
      if (formLocked()) return;
      const amount = sanitizeAmountInput(raw);
      if (amount === get().amount) return;
      inputChanged();
      set({ amount });
      validate();
      runQuote(options.quoteDebounceMs ?? 400);
    },
    setMax: () => {
      const available = withdrawableOf(get().context);
      if (!available || !isPositiveDecimal(available)) return;
      actions.setAmount(toFixed2(available));
    },
    acceptSlippage: () => {
      const warning = get().slippageWarning;
      if (!warning?.slippagePct) return;
      const accepted = acceptSlippagePct(warning.slippagePct);
      if (accepted === null) return;
      set({ acceptedSlippagePct: accepted, slippageWarning: null });
      runQuote(0);
    },
    setTwoFactorCode: (value) => {
      const twoFactorCode = value.replace(/\D/g, "").slice(0, 6);
      if (twoFactorCode === get().twoFactorCode) return;
      set({ twoFactorCode, submitError: null });
    },
    requote: () => runQuote(0),
    refreshContext: async () => {
      try {
        const context = await client.getContext();
        if (!destroyed) {
          set({ context });
          validate();
        }
      } catch {
        return;
      }
    },
    submit: async () => {
      const s = get();
      if (!s.method || !s.quote || s.step === "submitting" || s.step === "status") return;
      const { addressError, amountError } = validate();
      if (addressError || amountError) return;
      if (s.twoFactorRequired && s.twoFactorCode.length !== 6) {
        set({ step: "two-factor" });
        return;
      }
      const input = {
        methodId: s.method.id,
        address: s.address.trim(),
        amount: s.amount,
        quote: s.quote,
        ...(s.acceptedSlippagePct !== null ? { acceptSlippagePct: s.acceptedSlippagePct } : {}),
        ...(s.twoFactorRequired && s.twoFactorCode ? { twoFactorCode: s.twoFactorCode } : {}),
      };
      const idempotencyKey = intents.keyFor(toCreateWithdrawalBody(input));
      const token = intent;
      set({ step: "submitting", submitError: null });
      try {
        const withdrawal = await client.createWithdrawal(input, { idempotencyKey });
        intents.settle({ ok: true });
        if (destroyed) return;
        submitted = { id: withdrawal.id, quote: s.quote };
        client.emit({ type: "withdrawal.created", withdrawalId: withdrawal.id });
        track(withdrawal.id, withdrawal);
      } catch (error) {
        intents.settle({ ok: false, error });
        if (destroyed || token !== intent) return;
        const payError = toPayError(error);
        client.emit({ type: "error", code: payError.code, scope: "withdrawal.create" });
        if (payError.code === "WITHDRAWAL_IN_PROGRESS" && payError.details.withdrawalId) {
          track(payError.details.withdrawalId, null);
          return;
        }
        if (payError.code === "IDEMPOTENCY_CONFLICT" || payError.code === "WITHDRAWAL_IN_PROGRESS") {
          const inFlight = await client
            .getContext()
            .then((context) => {
              if (!destroyed) set({ context });
              return context.withdrawal?.inFlightId ?? null;
            })
            .catch(() => null);
          if (destroyed) return;
          if (inFlight) {
            track(inFlight, null);
            return;
          }
        }
        if (TWO_FA_CODES.has(payError.code)) {
          set({
            step: "two-factor",
            twoFactorRequired: true,
            twoFactorCode: payError.code === "TWO_FA_REQUIRED" ? get().twoFactorCode : "",
            submitError: payError.code === "TWO_FA_REQUIRED" && !s.twoFactorCode ? null : payError,
          });
          return;
        }
        set({
          step: get().twoFactorRequired && s.twoFactorCode ? "two-factor" : "form",
          submitError: payError,
        });
      }
    },
    retry: () => {
      if (get().step === "error" || !get().methods) load();
      else runQuote(0);
    },
    reset: () => {
      poller?.stop();
      poller = null;
      clearQuote();
      inputChanged();
      set({
        step: get().methods ? "form" : "loading",
        address: "",
        amount: "",
        addressError: null,
        amountError: null,
        quote: null,
        quoteError: null,
        twoFactorCode: "",
        withdrawal: null,
      });
      void actions.refreshContext();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      clearQuote();
      poller?.stop();
      poller = null;
      loadController?.abort();
    },
  };

  return { getSnapshot: store.getSnapshot, subscribe: store.subscribe, actions };
};

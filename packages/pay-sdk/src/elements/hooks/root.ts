"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientStatus, PayClient } from "../../core/client.js";
import type { PayError } from "../../core/errors.js";
import type { PayEvent } from "../../core/events.js";
import type { DepositFlowActions, DepositFlowState } from "../../core/flows/deposit.js";
import type { WithdrawFlowActions, WithdrawFlowState } from "../../core/flows/withdraw.js";
import {
  errorMessage,
  formatEta,
  type PayLocale,
  type Translate,
} from "../../core/i18n/index.js";
import { formatMoney, formatUsd } from "../../core/money.js";
import type { Balance, PayContext, PayMethods, PayMode } from "../../core/types.js";
import {
  useDepositFlowStore,
  useFlowError,
  usePayRoot,
  useStoreValue,
  useWithdrawFlowStore,
} from "../context.js";

export interface UsePayResult {
  client: PayClient;
  mode: PayMode;
  status: ClientStatus;
  error: PayError | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  restart: () => void;
}

export function usePay(): UsePayResult {
  const root = usePayRoot("usePay()");
  const state = useStoreValue(root.client.state);
  return {
    client: root.client,
    mode: root.mode,
    status: state.status,
    error: state.error,
    open: root.open,
    setOpen: root.setOpen,
    restart: root.restart,
  };
}

interface FlowShared {
  step: string;
  context: PayContext | null;
  methods: PayMethods | null;
  error: PayError | null;
}

const useFlowShared = (owner: string): FlowShared & { refresh: () => Promise<void> } => {
  const root = usePayRoot(owner);
  const state = useStoreValue<FlowShared>(root.flow);
  const refresh = useCallback(
    () => (root.flow.actions as { refreshContext: () => Promise<void> }).refreshContext(),
    [root.flow],
  );
  return { ...state, refresh };
};

export interface UsePayContextResult {
  data: PayContext | null;
  error: PayError | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function usePayContext(): UsePayContextResult {
  const shared = useFlowShared("usePayContext()");
  return {
    data: shared.context,
    error: shared.error,
    loading: shared.step === "loading",
    refresh: shared.refresh,
  };
}

export interface UseBalanceResult {
  balance: Balance | null;
  available: string | null;
  withdrawable: string | null;
  currency: string;
  loading: boolean;
}

export function useBalance(): UseBalanceResult {
  const shared = useFlowShared("useBalance()");
  const balance = shared.context?.balance ?? null;
  return {
    balance,
    available: balance?.available ?? null,
    withdrawable: balance ? (balance.withdrawable ?? balance.available) : null,
    currency: balance?.currency ?? "USD",
    loading: shared.step === "loading",
  };
}

export interface UsePaymentMethodsResult {
  methods: PayMethods["methods"];
  ordering: PayMethods["ordering"];
  unavailableRails: string[];
  suggestedCountry: string | null;
  maxWithdrawUsd: string | null;
  loading: boolean;
  error: PayError | null;
}

export function usePaymentMethods(): UsePaymentMethodsResult {
  const shared = useFlowShared("usePaymentMethods()");
  const methods = shared.methods;
  return {
    methods: methods?.methods ?? [],
    ordering: methods?.ordering ?? { currencies: [], chains: [] },
    unavailableRails: methods?.unavailableRails ?? [],
    suggestedCountry: methods?.suggestedCountry ?? null,
    maxWithdrawUsd: methods?.maxWithdrawUsd ?? null,
    loading: shared.step === "loading",
    error: shared.error,
  };
}

export function useDepositFlow(): { state: DepositFlowState; actions: DepositFlowActions } {
  const { flow, state } = useDepositFlowStore("useDepositFlow()");
  if (!flow || !state) throw new Error("useDepositFlow() needs <Pay.Root mode=\"deposit\">");
  return { state, actions: flow.actions };
}

export function useWithdrawFlow(): { state: WithdrawFlowState; actions: WithdrawFlowActions } {
  const { flow, state } = useWithdrawFlowStore("useWithdrawFlow()");
  if (!flow || !state) throw new Error("useWithdrawFlow() needs <Pay.Root mode=\"withdraw\">");
  return { state, actions: flow.actions };
}

export function usePayEvents(handler: (event: PayEvent) => void): void {
  const root = usePayRoot("usePayEvents()");
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => root.client.onEvent((event) => latest.current(event)), [root.client]);
}

export interface UsePayMessagesResult {
  t: Translate;
  locale: PayLocale;
  intl: string;
  dir: "ltr" | "rtl";
  money: (value: string | number | null | undefined, currency: string) => string;
  usd: (value: string | number | null | undefined) => string;
  eta: (seconds: number | null) => string | null;
  error: (error: Pick<PayError, "code" | "details">) => string;
}

export function usePayMessages(): UsePayMessagesResult {
  const root = usePayRoot("usePayMessages()");
  return useMemo(
    () => ({
      t: root.t,
      locale: root.locale,
      intl: root.intl,
      dir: root.dir,
      money: (value, currency) => formatMoney(value, currency, root.intl),
      usd: (value) => formatUsd(value),
      eta: (seconds) => formatEta(root.t, seconds),
      error: (error) => errorMessage(root.t, error, root.locale),
    }),
    [root.t, root.locale, root.intl, root.dir],
  );
}

export interface UseCountdownResult {
  remainingMs: number | null;
  expired: boolean;
  text: string | null;
}

export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

export function useCountdown(expiresAt: number | null | undefined): UseCountdownResult {
  const root = usePayRoot("useCountdown()");
  const clock = root.client.clock;
  const compute = useCallback(
    () => (typeof expiresAt === "number" ? Math.max(0, expiresAt - clock.now()) : null),
    [expiresAt, clock],
  );
  const [remainingMs, setRemaining] = useState<number | null>(compute);
  useEffect(() => {
    setRemaining(compute());
    if (typeof expiresAt !== "number") return;
    const handle = setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next === 0) clearInterval(handle);
    }, 1000);
    return () => clearInterval(handle);
  }, [compute, expiresAt]);
  return {
    remainingMs,
    expired: remainingMs === 0,
    text: remainingMs === null ? null : formatClock(remainingMs),
  };
}

export function usePayError(): PayError | null {
  return useFlowError("usePayError()");
}

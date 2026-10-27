"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createIntentKeys } from "../../core/intent.js";
import { toCreateDepositBody, toCryptoDepositBody } from "../../core/wire.js";
import { isAbortError, toPayError, type PayError } from "../../core/errors.js";
import { isTerminalDepositStatus, getPayView, shownPayStatus, type PayView, type RequisitesView } from "../../core/rules/requisites.js";
import { createPoller } from "../../core/poll.js";
import type {
  CreateDepositInput,
  CryptoDeposit,
  Deposit,
  DepositQuote,
  FiatDeposit,
  FiatDepositStatus,
} from "../../core/types.js";
import { useDepositFlowStore, usePayRoot } from "../context.js";

export const QUOTE_DEBOUNCE_MS = 400;

export interface UseDepositQuoteResult {
  quote: DepositQuote | null;
  loading: boolean;
  error: PayError | null;
}

export function useDepositQuote(
  methodId: string | null | undefined,
  amount: string | null | undefined,
): UseDepositQuoteResult {
  const { client } = usePayRoot("useDepositQuote()");
  const [result, setResult] = useState<UseDepositQuoteResult>({
    quote: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!methodId || !amount || !(Number(amount) > 0)) {
      setResult({ quote: null, loading: false, error: null });
      return;
    }
    setResult((previous) => ({ ...previous, loading: true, error: null }));
    const controller = new AbortController();
    const handle = setTimeout(() => {
      client
        .quoteDeposit({ methodId, amount }, controller.signal)
        .then((quote) => {
          if (!controller.signal.aborted) setResult({ quote, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setResult({ quote: null, loading: false, error: toPayError(error) });
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [client, methodId, amount]);
  return result;
}

export interface UseCryptoDepositResult {
  deposit: CryptoDeposit | null;
  loading: boolean;
  error: PayError | null;
  request: () => Promise<CryptoDeposit | null>;
}

export function useCryptoDeposit(input: {
  chainId: string | null | undefined;
  currency: string | null | undefined;
  methodId?: string;
}): UseCryptoDepositResult {
  const { client, cryptoCache } = usePayRoot("useCryptoDeposit()");
  const { chainId, currency, methodId } = input;
  const key = chainId && currency ? `${chainId}/${currency}` : null;
  const reusableFor = useCallback(
    (routeKey: string | null): CryptoDeposit | null => {
      const deposit = routeKey ? cryptoCache.get(routeKey) : undefined;
      return deposit &&
        deposit.status === "active" &&
        (deposit.expiresAt === null || deposit.expiresAt > client.clock.now())
        ? deposit
        : null;
    },
    [client, cryptoCache],
  );
  const [state, setState] = useState<{
    key: string | null;
    deposit: CryptoDeposit | null;
    loading: boolean;
    error: PayError | null;
  }>(() => ({ key, deposit: reusableFor(key), loading: false, error: null }));
  const inflight = useRef<{ key: string; promise: Promise<CryptoDeposit | null> } | null>(null);
  const intents = useRef(createIntentKeys());

  if (state.key !== key) {
    setState({ key, deposit: reusableFor(key), loading: false, error: null });
  }

  const request = useCallback(() => {
    if (!chainId || !currency || !key) return Promise.resolve(null);
    const current = reusableFor(key);
    if (current) {
      setState({ key, deposit: current, loading: false, error: null });
      return Promise.resolve(current);
    }
    if (inflight.current?.key === key) return inflight.current.promise;
    setState({ key, deposit: null, loading: true, error: null });
    const input = { chainId, currency };
    const promise = client
      .createCryptoDeposit(input, { idempotencyKey: intents.current.keyFor(toCryptoDepositBody(input)) })
      .then((deposit) => {
        intents.current.settle({ ok: true });
        cryptoCache.set(key, deposit);
        client.emit({
          type: "deposit.created",
          depositId: deposit.id,
          kind: "crypto",
          methodId: methodId ?? `crypto:${chainId}:${currency.toLowerCase()}`,
        });
        setState((previous) =>
          previous.key === key ? { key, deposit, loading: false, error: null } : previous,
        );
        return deposit;
      })
      .catch((error: unknown) => {
        intents.current.settle({ ok: false, error });
        setState((previous) =>
          previous.key === key
            ? { key, deposit: null, loading: false, error: toPayError(error) }
            : previous,
        );
        return null;
      })
      .finally(() => {
        if (inflight.current?.key === key) inflight.current = null;
      });
    inflight.current = { key, promise };
    return promise;
  }, [client, cryptoCache, chainId, currency, key, methodId, reusableFor]);

  return { deposit: state.deposit, loading: state.loading, error: state.error, request };
}

export interface UseCreateDepositResult {
  create: (input: CreateDepositInput) => Promise<FiatDeposit | null>;
  pending: boolean;
  error: PayError | null;
  deposit: FiatDeposit | null;
}

export function useCreateDeposit(): UseCreateDepositResult {
  const { client } = usePayRoot("useCreateDeposit()");
  const [state, setState] = useState<Omit<UseCreateDepositResult, "create">>({
    pending: false,
    error: null,
    deposit: null,
  });
  const intents = useRef(createIntentKeys());
  const busy = useRef(false);
  const create = useCallback(
    async (input: CreateDepositInput) => {
      if (busy.current) return null;
      busy.current = true;
      const idempotencyKey = intents.current.keyFor(toCreateDepositBody(input));
      setState((previous) => ({ ...previous, pending: true, error: null }));
      try {
        const deposit = await client.createDeposit(input, { idempotencyKey });
        intents.current.settle({ ok: true });
        client.emit({ type: "deposit.created", depositId: deposit.id, kind: "fiat", methodId: input.methodId });
        setState({ pending: false, error: null, deposit });
        return deposit;
      } catch (error) {
        intents.current.settle({ ok: false, error });
        setState((previous) => ({ ...previous, pending: false, error: toPayError(error) }));
        return null;
      } finally {
        busy.current = false;
      }
    },
    [client],
  );
  return { ...state, create };
}

export interface UseDepositResult {
  deposit: Deposit | null;
  view: PayView | null;
  shownStatus: FiatDepositStatus | null;
  error: PayError | null;
  loading: boolean;
  refresh: () => void;
}

export function useDeposit(id: string | null | undefined): UseDepositResult {
  const { client } = usePayRoot("useDeposit()");
  const [state, setState] = useState<Omit<UseDepositResult, "refresh">>({
    deposit: null,
    view: null,
    shownStatus: null,
    error: null,
    loading: !!id,
  });
  const known = useRef<RequisitesView | null>(null);
  const pollerRef = useRef<ReturnType<typeof createPoller> | null>(null);

  useEffect(() => {
    known.current = null;
    if (!id) {
      setState({ deposit: null, view: null, shownStatus: null, error: null, loading: false });
      return;
    }
    setState((previous) => ({ ...previous, loading: true }));
    const poller = createPoller(
      async (signal) => {
        try {
          const deposit = await client.getDeposit(id, signal);
          if (deposit.kind === "fiat") {
            const view = getPayView(deposit, known.current, client.clock.now());
            if (view.kind === "requisites") known.current = view.requisites;
            setState({ deposit, view, shownStatus: shownPayStatus(deposit, view), error: null, loading: false });
            return isTerminalDepositStatus(deposit.status) ? "stop" : "continue";
          }
          setState({ deposit, view: null, shownStatus: null, error: null, loading: false });
          return deposit.status === "active" ? "continue" : "stop";
        } catch (error) {
          if (!isAbortError(error)) {
            setState((previous) => ({ ...previous, error: toPayError(error), loading: false }));
          }
          throw error;
        }
      },
      { intervalMs: 5000, maxIntervalMs: 30_000 },
    );
    pollerRef.current = poller;
    poller.start();
    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, [client, id]);

  const refresh = useCallback(() => pollerRef.current?.now(), []);
  return { ...state, refresh };
}

export interface UseAttachReceiptResult {
  attach: (file: Blob) => Promise<boolean>;
  pending: boolean;
  error: PayError | null;
  attached: boolean;
}

export function useAttachReceipt(id: string | null | undefined): UseAttachReceiptResult {
  const { client } = usePayRoot("useAttachReceipt()");
  const [state, setState] = useState({ pending: false, error: null as PayError | null, attached: false });
  const attach = useCallback(
    async (file: Blob) => {
      if (!id) return false;
      setState({ pending: true, error: null, attached: false });
      try {
        await client.attachReceipt(id, file);
        setState({ pending: false, error: null, attached: true });
        return true;
      } catch (error) {
        setState({ pending: false, error: toPayError(error), attached: false });
        return false;
      }
    },
    [client, id],
  );
  return { ...state, attach };
}

export interface UseOnrampResult {
  url: string | null;
  loading: boolean;
  error: PayError | null;
  load: () => Promise<string | null>;
  retry: () => Promise<string | null>;
}

export function useOnramp(): UseOnrampResult {
  const { flow, state } = useDepositFlowStore("useOnramp()");
  if (!flow || !state) throw new Error("useOnramp() needs <Pay.Root mode=\"deposit\">");
  return {
    url: state.onrampUrl,
    loading: state.onrampLoading,
    error: state.onrampError,
    load: flow.actions.loadOnramp,
    retry: flow.actions.retryOnramp,
  };
}

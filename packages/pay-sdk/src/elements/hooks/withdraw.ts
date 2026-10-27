"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createIntentKeys } from "../../core/intent.js";
import { toCreateWithdrawalBody } from "../../core/wire.js";
import { isAbortError, toPayError, type PayError } from "../../core/errors.js";
import { isTerminalWithdrawal } from "../../core/flows/withdraw.js";
import { createPoller } from "../../core/poll.js";
import { acceptSlippagePct } from "../../core/rules/slippage.js";
import type {
  CreateWithdrawalInput,
  SlippageWarning,
  Withdrawal,
  WithdrawalQuote,
} from "../../core/types.js";
import { usePayRoot } from "../context.js";
import { QUOTE_DEBOUNCE_MS } from "./deposit.js";

export interface UseWithdrawQuoteResult {
  quote: WithdrawalQuote | null;
  slippageWarning: SlippageWarning | null;
  acceptedSlippagePct: number | null;
  loading: boolean;
  error: PayError | null;
  accept: () => void;
}

export function useWithdrawQuote(input: {
  methodId: string | null | undefined;
  address: string | null | undefined;
  amount: string | null | undefined;
}): UseWithdrawQuoteResult {
  const { client } = usePayRoot("useWithdrawQuote()");
  const { methodId, amount } = input;
  const address = input.address?.trim() ?? "";
  const [accepted, setAccepted] = useState<{ fingerprint: string; pct: number } | null>(null);
  const fingerprint = `${methodId ?? ""}|${address}|${amount ?? ""}`;
  const acceptedPct = accepted?.fingerprint === fingerprint ? accepted.pct : null;
  const [state, setState] = useState<{
    quote: WithdrawalQuote | null;
    slippageWarning: SlippageWarning | null;
    loading: boolean;
    error: PayError | null;
  }>({ quote: null, slippageWarning: null, loading: false, error: null });

  useEffect(() => {
    if (!methodId || !address || !amount || !(Number(amount) > 0)) {
      setState({ quote: null, slippageWarning: null, loading: false, error: null });
      return;
    }
    setState({ quote: null, slippageWarning: null, loading: true, error: null });
    const controller = new AbortController();
    const handle = setTimeout(
      () => {
        client
          .quoteWithdrawal(
            {
              methodId,
              address,
              amount,
              ...(acceptedPct !== null ? { acceptSlippagePct: acceptedPct } : {}),
            },
            controller.signal,
          )
          .then((result) => {
            if (controller.signal.aborted) return;
            setState({
              quote: result.quote,
              slippageWarning: result.slippageWarning,
              loading: false,
              error: null,
            });
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || isAbortError(error)) return;
            setState({ quote: null, slippageWarning: null, loading: false, error: toPayError(error) });
          });
      },
      acceptedPct !== null ? 0 : QUOTE_DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [client, methodId, address, amount, acceptedPct]);

  const warning = state.slippageWarning;
  const accept = useCallback(() => {
    if (!warning?.slippagePct) return;
    const pct = acceptSlippagePct(warning.slippagePct);
    if (pct !== null) setAccepted({ fingerprint, pct });
  }, [warning, fingerprint]);

  return { ...state, acceptedSlippagePct: acceptedPct, accept };
}

export interface UseCreateWithdrawalResult {
  create: (input: CreateWithdrawalInput) => Promise<Withdrawal | null>;
  pending: boolean;
  error: PayError | null;
  withdrawal: Withdrawal | null;
  twoFactorRequired: boolean;
  inProgressId: string | null;
}

export function useCreateWithdrawal(): UseCreateWithdrawalResult {
  const { client } = usePayRoot("useCreateWithdrawal()");
  const [state, setState] = useState<Omit<UseCreateWithdrawalResult, "create">>({
    pending: false,
    error: null,
    withdrawal: null,
    twoFactorRequired: false,
    inProgressId: null,
  });
  const intents = useRef(createIntentKeys());
  const busy = useRef(false);
  const create = useCallback(
    async (input: CreateWithdrawalInput) => {
      if (busy.current) return null;
      busy.current = true;
      const idempotencyKey = intents.current.keyFor(toCreateWithdrawalBody(input));
      setState((previous) => ({ ...previous, pending: true, error: null }));
      try {
        const withdrawal = await client.createWithdrawal(input, { idempotencyKey });
        intents.current.settle({ ok: true });
        client.emit({ type: "withdrawal.created", withdrawalId: withdrawal.id });
        setState({
          pending: false,
          error: null,
          withdrawal,
          twoFactorRequired: false,
          inProgressId: null,
        });
        return withdrawal;
      } catch (error) {
        intents.current.settle({ ok: false, error });
        const payError = toPayError(error);
        setState((previous) => ({
          ...previous,
          pending: false,
          error: payError,
          twoFactorRequired:
            previous.twoFactorRequired || payError.code.startsWith("TWO_FA_"),
          inProgressId:
            payError.code === "WITHDRAWAL_IN_PROGRESS"
              ? (payError.details.withdrawalId ?? null)
              : previous.inProgressId,
        }));
        return null;
      } finally {
        busy.current = false;
      }
    },
    [client],
  );
  return { ...state, create };
}

export interface UseWithdrawalResult {
  withdrawal: Withdrawal | null;
  error: PayError | null;
  loading: boolean;
}

export function useWithdrawal(id: string | null | undefined): UseWithdrawalResult {
  const { client } = usePayRoot("useWithdrawal()");
  const [state, setState] = useState<UseWithdrawalResult>({
    withdrawal: null,
    error: null,
    loading: !!id,
  });
  useEffect(() => {
    if (!id) {
      setState({ withdrawal: null, error: null, loading: false });
      return;
    }
    setState((previous) => ({ ...previous, loading: true }));
    const poller = createPoller(
      async (signal) => {
        try {
          const withdrawal = await client.getWithdrawal(id, signal);
          setState({ withdrawal, error: null, loading: false });
          return isTerminalWithdrawal(withdrawal) ? "stop" : "continue";
        } catch (error) {
          if (!isAbortError(error)) {
            setState((previous) => ({ ...previous, error: toPayError(error), loading: false }));
          }
          throw error;
        }
      },
      { intervalMs: 4000, maxIntervalMs: 30_000 },
    );
    poller.start();
    return () => poller.stop();
  }, [client, id]);
  return state;
}

"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { AppearanceSkin } from "../core/appearance.js";
import type { PayClient } from "../core/client.js";
import type { PayError } from "../core/errors.js";
import type { DepositFlow } from "../core/flows/deposit.js";
import type { WithdrawFlow } from "../core/flows/withdraw.js";
import type { PayLocale, Translate } from "../core/i18n/index.js";
import type { ReadableStore, Store } from "../core/store.js";
import type { CryptoDeposit, PayMode, PayTheme } from "../core/types.js";

export type EntryTab = "crypto" | "card";

export interface PickerState {
  cryptoOpen: boolean;
  cryptoCurrency: string | null;
  tab: EntryTab | null;
  country: string | null;
  fiatMethodId: string | null;
}

export interface PayRootValue {
  client: PayClient;
  mode: PayMode;
  flow: DepositFlow | WithdrawFlow;
  open: boolean;
  setOpen: (open: boolean) => void;
  restart: () => void;
  t: Translate;
  locale: PayLocale;
  intl: string;
  dir: "ltr" | "rtl";
  theme: PayTheme | undefined;
  skin: AppearanceSkin;
  unstyled: boolean;
  picker: Store<PickerState>;
  cryptoCache: Map<string, CryptoDeposit>;
}

export const PayRootContext = createContext<PayRootValue | null>(null);

export const usePayRoot = (owner: string): PayRootValue => {
  const value = useContext(PayRootContext);
  if (!value) {
    throw new Error(`${owner} must be used inside <Pay.Root> from @binopartner/pay-sdk/elements`);
  }
  return value;
};

export const useStoreValue = <T,>(store: ReadableStore<T>): T =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

const IDLE_STORE: ReadableStore<null> = {
  getSnapshot: () => null,
  subscribe: () => () => undefined,
};

export const useDepositFlowStore = (owner: string) => {
  const root = usePayRoot(owner);
  const flow = root.mode === "deposit" ? (root.flow as DepositFlow) : null;
  const state = useStoreValue<ReturnType<DepositFlow["getSnapshot"]> | null>(flow ?? IDLE_STORE);
  return { root, flow, state };
};

export const useWithdrawFlowStore = (owner: string) => {
  const root = usePayRoot(owner);
  const flow = root.mode === "withdraw" ? (root.flow as WithdrawFlow) : null;
  const state = useStoreValue<ReturnType<WithdrawFlow["getSnapshot"]> | null>(flow ?? IDLE_STORE);
  return { root, flow, state };
};

export const useFlowError = (owner: string): PayError | null => {
  const root = usePayRoot(owner);
  const client = useStoreValue(root.client.state);
  const flow = useStoreValue<{ error: PayError | null }>(root.flow);
  return client.error ?? flow.error;
};

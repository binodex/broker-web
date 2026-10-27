"use client";

import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { isRetryable, type PayError } from "../../core/errors.js";
import type { DepositFlowState } from "../../core/flows/deposit.js";
import type { WithdrawFlowState } from "../../core/flows/withdraw.js";
import { errorMessage, type MessageKey } from "../../core/i18n/index.js";
import { formatMoney } from "../../core/money.js";
import type { FiatRail } from "../../core/types.js";
import * as ui from "../../ui/index.js";
import { balanceText } from "../../ui/context.js";
import { usePayRoot, useStoreValue } from "../context.js";
import { partProps, type PartStyleProps } from "../part.js";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> &
  PartStyleProps;
type DivProps<C = ReactNode> = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> &
  PartStyleProps & { children?: C };

export const useFlowState = (owner: string) => {
  const root = usePayRoot(owner);
  const state = useStoreValue<DepositFlowState | WithdrawFlowState>(root.flow);
  return { root, state };
};

export const railKey = (rail: FiatRail, key: string): MessageKey => `fiat.${rail}.${key}` as MessageKey;

export const Trigger = forwardRef<HTMLButtonElement, ButtonProps>(function Trigger(
  { onClick, type = "button", children, className, style, unstyled, ...rest },
  ref,
) {
  const root = usePayRoot("<Pay.Trigger>");
  return (
    <button
      type={type}
      aria-expanded={root.open}
      {...rest}
      ref={ref}
      {...partProps("trigger", { className, style, unstyled }, root.unstyled)}
      data-state={root.open ? "open" : "closed"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) root.setOpen(true);
      }}
    >
      {children ?? root.t(root.mode === "withdraw" ? "trigger.withdraw" : "trigger.deposit")}
    </button>
  );
});

export const Close = forwardRef<HTMLButtonElement, ButtonProps>(function Close(
  { onClick, children, ...rest },
  ref,
) {
  const root = usePayRoot("<Pay.Close>");
  if (!root.open) return null;
  return (
    <ui.CloseButton
      {...rest}
      ref={ref}
      label={children ? undefined : root.t("common.close")}
      data-state="open"
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        root.client.emit({ type: "close.requested" });
        root.setOpen(false);
      }}
    >
      {children}
    </ui.CloseButton>
  );
});

const LOADING_STEPS = new Set(["loading", "creating"]);

export const Loader = forwardRef<HTMLDivElement, DivProps>(function Loader(
  { children, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.Loader>");
  const client = useStoreValue(root.client.state);
  const busy =
    root.open &&
    client.status !== "error" &&
    (client.status === "idle" || client.status === "session" || LOADING_STEPS.has(state.step));
  if (!busy) return null;
  if (children !== undefined) {
    return (
      <div
        role="status"
        aria-live="polite"
        {...rest}
        ref={ref}
        {...partProps("loader", { className, style, unstyled }, root.unstyled)}
        data-status={client.status}
        data-step={state.step}
      >
        {children}
      </div>
    );
  }
  return (
    <ui.Loader
      {...rest}
      ref={ref}
      className={className}
      style={style}
      unstyled={unstyled}
      data-status={client.status}
      data-step={state.step}
    />
  );
});

export type ErrorMessageProps = DivProps<ReactNode | ((error: PayError) => ReactNode)> & {
  retry?: boolean;
};

export const ErrorMessage = forwardRef<HTMLDivElement, ErrorMessageProps>(function ErrorMessage(
  { children, retry = true, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.ErrorMessage>");
  const client = useStoreValue(root.client.state);
  const submitError =
    state.submitError && !state.submitError.code.startsWith("TWO_FA_") ? state.submitError : null;
  const error = client.error ?? state.error ?? submitError;
  if (!root.open || !error) return null;
  const sessionLevel = client.error !== null;
  const canRetry = retry && (sessionLevel || state.error !== null) && isRetryable(error);
  return (
    <ui.ErrorBox
      {...rest}
      ref={ref}
      part="error"
      variant={root.mode === "withdraw" ? "withdraw" : "deposit"}
      className={className}
      style={style}
      unstyled={unstyled}
      data-error={error.code}
    >
      {typeof children === "function"
        ? children(error)
        : (children ?? <div>{errorMessage(root.t, error, root.locale)}</div>)}
      {canRetry && typeof children !== "function" && (
        <button
          type="button"
          className={(unstyled ?? root.unstyled) ? undefined : "bp-max-button"}
          data-binodex-pay="retry"
          onClick={() => (sessionLevel ? root.restart() : root.flow.actions.retry())}
        >
          {root.t("withdraw.retry")}
        </button>
      )}
    </ui.ErrorBox>
  );
});

export type BalanceProps = Omit<HTMLAttributes<HTMLSpanElement>, "className" | "style" | "children"> &
  PartStyleProps & {
    children?: ReactNode | ((formatted: string, value: string | null) => ReactNode);
    variant?: "available" | "withdrawable";
    label?: ReactNode;
  };

export const Balance = forwardRef<HTMLSpanElement, BalanceProps>(function Balance(
  { variant, label, children, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.Balance>");
  const balance = state.context?.balance;
  if (!balance) return null;
  const kind = variant ?? (root.mode === "withdraw" ? "withdrawable" : "available");
  const value = kind === "withdrawable" ? (balance.withdrawable ?? balance.available) : balance.available;
  const formatted =
    balance.currency.toUpperCase() === "USD" ? balanceText(value) : formatMoney(value, balance.currency, root.intl);
  return (
    <span
      {...rest}
      ref={ref}
      {...partProps("balance", { className, style, unstyled }, root.unstyled)}
      data-variant={kind}
    >
      {typeof children === "function" ? (
        children(formatted, value)
      ) : (
        <>
          <span data-binodex-pay="balance-label">{label ?? root.t("header.balance")}</span>
          {": "}
          <span data-binodex-pay="balance-value">{formatted}</span>
        </>
      )}
    </span>
  );
});

export const BackButton = forwardRef<HTMLButtonElement, ButtonProps>(function BackButton(
  { onClick, children, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.BackButton>");
  const picker = useStoreValue(root.picker);
  if (root.mode !== "deposit") return null;
  const step = state.step;
  const cryptoScreen = step === "pick-method" && picker.cryptoOpen;
  if (!cryptoScreen && (step === "loading" || step === "pick-method" || step === "error" || step === "creating")) {
    return null;
  }
  return (
    <ui.BackButton
      {...rest}
      ref={ref}
      label={children ? undefined : root.t("common.back")}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (cryptoScreen) {
          root.picker.set({ cryptoOpen: false });
          return;
        }
        (root.flow.actions as { back: () => void }).back();
        if ((state as DepositFlowState).method?.kind === "crypto") root.picker.set({ cryptoOpen: false });
      }}
    >
      {children}
    </ui.BackButton>
  );
});

export const SubmitButton = forwardRef<HTMLButtonElement, ButtonProps>(function SubmitButton(
  { onClick, type = "button", children, disabled, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.SubmitButton>");
  let pending = false;
  let ready = false;
  let label: string;
  if (root.mode === "deposit") {
    const deposit = state as DepositFlowState;
    if (deposit.step !== "enter-amount" && deposit.step !== "creating") return null;
    if (deposit.method?.kind !== "fiat") return null;
    pending = deposit.step === "creating";
    ready = !!deposit.amount && !deposit.amountError;
    label = root.t(railKey(deposit.method.rail, pending ? "submitting" : "submit"));
  } else {
    const withdraw = state as WithdrawFlowState;
    if (withdraw.step === "status" || withdraw.step === "loading" || withdraw.step === "error") return null;
    pending = withdraw.step === "submitting" || withdraw.step === "quoting";
    ready =
      !!withdraw.quote &&
      !withdraw.addressError &&
      !withdraw.amountError &&
      (withdraw.step !== "two-factor" || withdraw.twoFactorCode.length === 6);
    label = root.t(withdraw.step === "submitting" ? "withdraw.submitting" : "withdraw.submit");
  }
  return (
    <ui.SubmitButton
      type={type}
      {...rest}
      ref={ref}
      variant={root.mode === "withdraw" ? "withdraw" : "pay"}
      disabled={disabled || pending || !ready}
      pending={pending}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) void (root.flow.actions as { submit: () => Promise<void> }).submit();
      }}
    >
      {children ?? label}
    </ui.SubmitButton>
  );
});

"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import type { DepositFlowActions, DepositFlowState } from "../../core/flows/deposit.js";
import type { WithdrawFlowActions, WithdrawFlowState } from "../../core/flows/withdraw.js";
import { errorMessage } from "../../core/i18n/index.js";
import { formatAmountMax2, formatMoney } from "../../core/money.js";
import { addressFamily } from "../../core/rules/address.js";
import type { PayError } from "../../core/errors.js";
import * as ui from "../../ui/index.js";
import { SENSITIVE_PROPS, type PartStyleProps } from "../part.js";
import { railKey, useFlowState } from "./basic.js";

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "style" | "value" | "onChange" | "children" | "size"
> &
  PartStyleProps & { label?: ReactNode; hint?: ReactNode };

const ADDRESS_PLACEHOLDER: Record<string, string> = {
  solana: "Sol...",
  bitcoin: "bc1...",
  tron: "T...",
};

export const AmountInput = forwardRef<HTMLInputElement, InputProps & { showMax?: boolean }>(
  function AmountInput({ label, hint, showMax = true, className, style, unstyled, id, placeholder, ...rest }, ref) {
    const { root, state } = useFlowState("<Pay.AmountInput>");
    if (root.mode === "deposit") {
      const s = state as DepositFlowState;
      if (s.step !== "enter-amount" && s.step !== "creating") return null;
      if (s.method?.kind !== "fiat") return null;
      const method = s.method;
      let defaultHint: string | null = null;
      if (method.minAmount && method.maxAmount) {
        defaultHint = root.t("amount.range", {
          min: formatMoney(method.minAmount, method.currency, root.intl),
          max: formatMoney(method.maxAmount, method.currency, root.intl),
        });
      } else if (method.minAmount) {
        defaultHint = root.t("amount.min", { amount: formatMoney(method.minAmount, method.currency, root.intl) });
      }
      const error: PayError | null = s.amountError;
      return (
        <ui.AmountField
          ref={ref}
          id={id}
          part="amount"
          variant="pay"
          className={className}
          style={style}
          unstyled={unstyled}
          label={label ?? root.t(railKey(method.rail, "amountLabel"))}
          suffix={method.currency}
          value={s.amount}
          placeholder={placeholder}
          disabled={s.step === "creating" || rest.disabled}
          hint={hint ?? defaultHint}
          error={error ? errorMessage(root.t, error, root.locale) : null}
          sanitize={false}
          inputProps={rest}
          onChange={(value) => (root.flow.actions as DepositFlowActions).setAmount(value)}
        />
      );
    }
    const s = state as WithdrawFlowState;
    if (s.step === "loading" || s.step === "status" || s.step === "error") return null;
    const actions = root.flow.actions as WithdrawFlowActions;
    const balance = s.context?.balance;
    const available = balance ? (balance.withdrawable ?? balance.available) : null;
    const error = s.amountError ? errorMessage(root.t, s.amountError, root.locale) : null;
    return (
      <ui.AmountField
        ref={ref}
        id={id}
        part="amount"
        variant="withdraw"
        className={className}
        style={style}
        unstyled={unstyled}
        label={label ?? root.t("withdraw.amount")}
        suffix={root.t("withdraw.usd")}
        value={s.amount}
        placeholder={placeholder}
        disabled={s.step === "submitting" || rest.disabled}
        hint={hint}
        error={error}
        sanitize={false}
        inputProps={rest}
        onMax={showMax ? actions.setMax : undefined}
        maxLabel={root.t("withdraw.max")}
        footer={[
          `$${formatAmountMax2(s.amount || 0)}`,
          `${root.t("header.balance")}: $${formatAmountMax2(available ?? 0)}`,
        ]}
        onChange={actions.setAmount}
      />
    );
  },
);

export const PhoneInput = forwardRef<HTMLInputElement, InputProps & { always?: boolean }>(
  function PhoneInput({ label, hint, always = false, className, style, unstyled, id, ...rest }, ref) {
    const { root, state } = useFlowState("<Pay.PhoneInput>");
    if (root.mode !== "deposit") return null;
    const s = state as DepositFlowState;
    if (s.step !== "enter-amount" && s.step !== "creating") return null;
    if (s.method?.kind !== "fiat" || !always) return null;
    return (
      <ui.TextField
        ref={ref}
        id={id}
        part="phone"
        variant="pay"
        type="tel"
        className={className}
        style={style}
        unstyled={unstyled}
        label={label ?? root.t("phone.label")}
        hint={hint}
        value={s.customerPhone}
        inputProps={{ inputMode: "tel", autoComplete: "tel", ...rest }}
        onChange={(value) => (root.flow.actions as DepositFlowActions).setCustomerPhone(value)}
      />
    );
  },
);

export const AddressInput = forwardRef<HTMLInputElement, InputProps>(function AddressInput(
  { label, hint, className, style, unstyled, id, placeholder, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.AddressInput>");
  if (root.mode !== "withdraw") return null;
  const s = state as WithdrawFlowState;
  if (s.step === "loading" || s.step === "status" || s.step === "error") return null;
  const chainId = s.method?.chainId ?? "";
  const family = s.method ? addressFamily(chainId) : "evm";
  const errorText = s.addressError ? root.t(`address.invalid.${family}`) : null;
  return (
    <ui.TextField
      ref={ref}
      id={id}
      part="address"
      variant="withdraw"
      className={className}
      style={style}
      unstyled={unstyled}
      label={label ?? root.t("withdraw.address")}
      hint={hint}
      error={errorText}
      value={s.address}
      placeholder={placeholder ?? ADDRESS_PLACEHOLDER[chainId] ?? "0x..."}
      disabled={s.step === "submitting" || rest.disabled}
      inputProps={{
        autoComplete: "off",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
        ...SENSITIVE_PROPS,
        ...rest,
      }}
      onChange={(value) => (root.flow.actions as WithdrawFlowActions).setAddress(value)}
    />
  );
});

export const TwoFactorInput = forwardRef<HTMLInputElement, InputProps & { always?: boolean }>(
  function TwoFactorInput({ label, hint, always = false, className, style, unstyled, id, ...rest }, ref) {
    const { root, state } = useFlowState("<Pay.TwoFactorInput>");
    if (root.mode !== "withdraw") return null;
    const s = state as WithdrawFlowState;
    if (s.step === "loading" || s.step === "status" || s.step === "error") return null;
    if (!always && s.step !== "two-factor" && !s.twoFactorRequired) return null;
    const error =
      s.submitError && s.submitError.code.startsWith("TWO_FA_")
        ? errorMessage(root.t, s.submitError, root.locale)
        : null;
    return (
      <ui.TwoFactorField
        ref={ref}
        id={id}
        part="two-factor"
        className={className}
        style={style}
        unstyled={unstyled}
        label={label ?? root.t("withdraw.twoFactor")}
        hint={hint ?? root.t("withdraw.twoFactorHint")}
        error={error}
        value={s.twoFactorCode}
        disabled={s.step === "submitting" || rest.disabled}
        inputProps={rest}
        onChange={(value) => (root.flow.actions as WithdrawFlowActions).setTwoFactorCode(value)}
      />
    );
  },
);

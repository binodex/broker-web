"use client";

import { forwardRef, type ComponentType, type HTMLAttributes } from "react";
import { safeImageUrl } from "../../core/appearance.js";
import * as ui from "../../ui/index.js";
import { useWithdrawFlowStore } from "../context.js";
import { useStepFocus } from "./focus.js";
import { partProps, type PartStyleProps } from "../part.js";
import { Balance, Close, ErrorMessage, Loader, SubmitButton } from "../components/basic.js";
import { RestartButton } from "../components/deposit.js";
import { AddressInput, AmountInput, TwoFactorInput } from "../components/inputs.js";
import { CurrencyPicker, NetworkPicker } from "../components/pickers.js";
import { Quote, SlippageWarning, Status } from "../components/status.js";

export interface WithdrawFormComponents {
  Loader: ComponentType;
  ErrorMessage: ComponentType;
  Balance: ComponentType;
  Close: ComponentType;
  CurrencyPicker: ComponentType;
  NetworkPicker: ComponentType;
  AddressInput: ComponentType;
  AmountInput: ComponentType;
  Quote: ComponentType;
  SlippageWarning: ComponentType;
  TwoFactorInput: ComponentType;
  SubmitButton: ComponentType;
  Status: ComponentType;
  RestartButton: ComponentType;
}

const DEFAULTS: WithdrawFormComponents = {
  Loader,
  ErrorMessage,
  Balance,
  Close,
  CurrencyPicker,
  NetworkPicker,
  AddressInput,
  AmountInput,
  Quote,
  SlippageWarning,
  TwoFactorInput,
  SubmitButton,
  Status,
  RestartButton,
};

export type WithdrawFormProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> &
  PartStyleProps & {
    components?: Partial<WithdrawFormComponents>;
  };

export const WithdrawForm = forwardRef<HTMLDivElement, WithdrawFormProps>(function WithdrawForm(
  { components, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useWithdrawFlowStore("<Pay.WithdrawForm>");
  const setRef = useStepFocus(state?.step ?? "loading", ref);
  if (root.mode !== "withdraw") {
    throw new Error("<Pay.WithdrawForm> needs <Pay.Root mode=\"withdraw\">");
  }
  if (!root.open) return null;
  const c = { ...DEFAULTS, ...components };
  const step = state?.step ?? "loading";
  const isUnstyled = unstyled ?? root.unstyled;
  const logoUrl = safeImageUrl(state?.context?.branding.logoUrl);
  const logo = logoUrl ? (
    <img src={logoUrl} alt="" className={isUnstyled ? undefined : "bp-brand"} referrerPolicy="no-referrer" />
  ) : undefined;
  return (
    <div
      tabIndex={-1}
      {...rest}
      ref={setRef}
      {...partProps("withdraw-form", { className, style, unstyled }, root.unstyled)}
      data-step={step}
    >
      {step === "status" ? (
        <ui.PayCard embedded variant="withdraw" unstyled={isUnstyled} header={<c.Close />}>
          <ui.PayBody variant="withdraw" unstyled={isUnstyled}>
            <c.Status />
            <c.RestartButton />
            <c.ErrorMessage />
          </ui.PayBody>
        </ui.PayCard>
      ) : (
        <ui.PayCard
          embedded
          variant="withdraw"
          unstyled={isUnstyled}
          title={root.t("header.withdraw")}
          subtitle={<c.Balance />}
          close={<c.Close />}
          logo={logo}
        >
          <ui.PayBody variant="withdraw" unstyled={isUnstyled}>
            <c.Loader />
            {step !== "loading" && step !== "error" && (
              <>
                <ui.RouteGrid unstyled={isUnstyled}>
                  <c.CurrencyPicker />
                  <c.NetworkPicker />
                </ui.RouteGrid>
                <c.AddressInput />
                <c.AmountInput />
                <c.Quote />
                <c.SlippageWarning />
                <c.TwoFactorInput />
              </>
            )}
            <c.ErrorMessage />
            {step !== "loading" && step !== "error" && <c.SubmitButton />}
          </ui.PayBody>
        </ui.PayCard>
      )}
    </div>
  );
});

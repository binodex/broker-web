"use client";

import { forwardRef, type ComponentType, type HTMLAttributes, type ReactNode } from "react";
import { safeImageUrl } from "../../core/appearance.js";
import type { DepositFlowState } from "../../core/flows/deposit.js";
import * as ui from "../../ui/index.js";
import { useDepositFlowStore, useStoreValue } from "../context.js";
import { useStepFocus } from "./focus.js";
import { partProps, type PartStyleProps } from "../part.js";
import {
  BackButton,
  Balance,
  Close,
  ErrorMessage,
  Loader,
  SubmitButton,
} from "../components/basic.js";
import {
  Countdown,
  CryptoAddress,
  MethodNotice,
  Onramp,
  ReceiptUpload,
  RedirectButton,
  Requisites,
  RestartButton,
} from "../components/deposit.js";
import { AmountInput, PhoneInput } from "../components/inputs.js";
import { CurrencyPicker, MethodPicker, NetworkPicker } from "../components/pickers.js";
import { Quote, Status } from "../components/status.js";

export interface DepositFormComponents {
  Loader: ComponentType;
  ErrorMessage: ComponentType;
  Balance: ComponentType;
  BackButton: ComponentType;
  Close: ComponentType;
  MethodPicker: ComponentType;
  CurrencyPicker: ComponentType;
  NetworkPicker: ComponentType;
  AmountInput: ComponentType;
  PhoneInput: ComponentType;
  MethodNotice: ComponentType;
  Quote: ComponentType;
  SubmitButton: ComponentType;
  CryptoAddress: ComponentType;
  Requisites: ComponentType;
  Countdown: ComponentType;
  ReceiptUpload: ComponentType;
  RedirectButton: ComponentType;
  RestartButton: ComponentType;
  Onramp: ComponentType;
  Status: ComponentType;
}

const DEFAULTS: DepositFormComponents = {
  Loader,
  ErrorMessage,
  Balance,
  BackButton,
  Close,
  MethodPicker,
  CurrencyPicker,
  NetworkPicker,
  AmountInput,
  PhoneInput,
  MethodNotice,
  Quote,
  SubmitButton,
  CryptoAddress,
  Requisites,
  Countdown,
  ReceiptUpload,
  RedirectButton,
  RestartButton,
  Onramp,
  Status,
};

export type DepositFormProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> &
  PartStyleProps & {
    components?: Partial<DepositFormComponents>;
  };

type Screen = "loading" | "error" | "entry" | "crypto" | "paying" | "credited";

const screenOf = (state: DepositFlowState | null, cryptoOpen: boolean): Screen => {
  const step = state?.step ?? "loading";
  const method = state?.method ?? null;
  if (step === "loading") return "loading";
  if (step === "error") return "error";
  if (step === "pick-method") return cryptoOpen ? "crypto" : "entry";
  if (step === "enter-amount") return "entry";
  if (step === "creating") return method?.kind === "crypto" ? "crypto" : "entry";
  if (step === "crypto-address") return "crypto";
  if (step === "onramp") return "entry";
  if (step === "done" && state?.deposit?.kind !== "fiat") return "credited";
  return "paying";
};

export const DepositForm = forwardRef<HTMLDivElement, DepositFormProps>(function DepositForm(
  { components, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useDepositFlowStore("<Pay.DepositForm>");
  const picker = useStoreValue(root.picker);
  const screen = screenOf(state, picker.cryptoOpen);
  const setRef = useStepFocus(`${state?.step ?? "loading"}:${screen}`, ref);
  if (root.mode !== "deposit") {
    throw new Error("<Pay.DepositForm> needs <Pay.Root mode=\"deposit\">");
  }
  if (!root.open) return null;
  const c = { ...DEFAULTS, ...components };
  const step = state?.step ?? "loading";
  const isUnstyled = unstyled ?? root.unstyled;
  const fiatSelected = state?.method?.kind === "fiat";
  const onrampSelected = state?.method?.kind === "onramp";
  const logoUrl = safeImageUrl(state?.context?.branding.logoUrl);
  const withBack = screen === "crypto" || screen === "credited";
  let body: ReactNode = null;
  switch (screen) {
    case "loading":
      body = (
        <ui.PayBody unstyled={isUnstyled}>
          <c.Loader />
        </ui.PayBody>
      );
      break;
    case "error":
      body = (
        <ui.PayBody unstyled={isUnstyled}>
          <c.ErrorMessage />
        </ui.PayBody>
      );
      break;
    case "entry":
      body = (
        <ui.PayBody unstyled={isUnstyled}>
          <c.MethodPicker />
          {fiatSelected ? (
            <div className={isUnstyled ? undefined : "bp-rail-form"}>
              <c.AmountInput />
              <c.PhoneInput />
              <c.MethodNotice />
              <c.Quote />
              <c.ErrorMessage />
              <c.SubmitButton />
            </div>
          ) : onrampSelected ? (
            <div className={isUnstyled ? undefined : "bp-onramp-tab"}>
              <c.Onramp />
              <p className={isUnstyled ? undefined : "bp-onramp-note"} data-binodex-pay="onramp-note">
                {root.t("onramp.disclosure")}
              </p>
            </div>
          ) : (
            <c.ErrorMessage />
          )}
        </ui.PayBody>
      );
      break;
    case "crypto":
      body = (
        <ui.PayBody variant="address" unstyled={isUnstyled}>
          <ui.Divider unstyled={isUnstyled} />
          <ui.RouteGrid unstyled={isUnstyled}>
            <c.CurrencyPicker />
            <c.NetworkPicker />
          </ui.RouteGrid>
          <c.ErrorMessage />
          <c.CryptoAddress />
        </ui.PayBody>
      );
      break;
    case "credited":
      body = (
        <ui.PayBody variant="address" unstyled={isUnstyled}>
          <ui.Divider unstyled={isUnstyled} />
          <c.Status />
        </ui.PayBody>
      );
      break;
    case "paying":
      body = (
        <ui.PayBody unstyled={isUnstyled}>
          <ui.PayingPanel unstyled={isUnstyled}>
            <c.Status />
            <c.Requisites />
            <c.ReceiptUpload />
            <c.Countdown />
            <ui.PayActions unstyled={isUnstyled}>
              <c.RedirectButton />
              <c.RestartButton />
            </ui.PayActions>
          </ui.PayingPanel>
          <c.ErrorMessage />
        </ui.PayBody>
      );
      break;
  }
  return (
    <div
      tabIndex={-1}
      {...rest}
      ref={setRef}
      {...partProps("deposit-form", { className, style, unstyled }, root.unstyled)}
      data-step={step}
      data-screen={screen}
    >
      <ui.PayCard
        embedded
        unstyled={isUnstyled}
        title={root.t(screen === "crypto" || screen === "credited" ? "header.depositAddress" : "header.deposit")}
        subtitle={<c.Balance />}
        back={withBack ? <c.BackButton /> : undefined}
        close={<c.Close />}
        logo={logoUrl ? <img src={logoUrl} alt="" className={isUnstyled ? undefined : "bp-brand"} referrerPolicy="no-referrer" /> : undefined}
      >
        {body}
      </ui.PayCard>
    </div>
  );
});

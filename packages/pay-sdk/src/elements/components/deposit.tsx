"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type IframeHTMLAttributes,
  type ReactNode,
} from "react";
import type { PayError } from "../../core/errors.js";
import type { DepositFlowActions, DepositFlowState } from "../../core/flows/deposit.js";
import type { WithdrawFlowActions, WithdrawFlowState } from "../../core/flows/withdraw.js";
import { errorMessage } from "../../core/i18n/index.js";
import { formatPayingAmount } from "../../core/money.js";
import {
  runRequisitesFrame,
  type RequisitesFrameHandle,
  type RequisitesFrameStatus,
} from "../../core/requisites-frame.js";
import { payToLabelKey } from "../../core/rules/paying.js";
import { getRuReceiptRule } from "../../core/rules/receipt.js";
import { getPayView, isTerminalDepositStatus, type PayView } from "../../core/rules/requisites.js";
import type { CryptoMethod, FiatDeposit } from "../../core/types.js";
import * as ui from "../../ui/index.js";
import { getMethodLogo } from "../../ui/logos.js";
import { chainName } from "../chains.js";
import { useDepositFlowStore, usePayRoot, useStoreValue } from "../context.js";
import { useCountdown } from "../hooks/root.js";
import { assignRef, partProps, type PartStyleProps } from "../part.js";
import { railKey } from "./basic.js";
import { Qr } from "./Qr.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> &
  PartStyleProps & { children?: ReactNode };

const useDeposit = (owner: string) => {
  const { root, flow, state } = useDepositFlowStore(owner);
  return { root, actions: flow?.actions ?? null, state };
};

const HIGH_FEE_USD = 1;

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

export const CryptoAddress = forwardRef<HTMLDivElement, DivProps & { showQr?: boolean }>(
  function CryptoAddress({ showQr = true, children, className, style, unstyled, ...rest }, ref) {
    const { root, state } = useDeposit("<Pay.CryptoAddress>");
    if (!state) return null;
    const method = state.method?.kind === "crypto" ? (state.method as CryptoMethod) : null;
    const creating = state.step === "creating" && method !== null;
    if (!creating && (state.step !== "crypto-address" || state.deposit?.kind !== "crypto")) return null;
    const deposit = state.deposit?.kind === "crypto" ? state.deposit : null;
    const chainId = deposit?.chainId ?? method?.chainId ?? "";
    const currency = deposit?.currency ?? method?.currency ?? "";
    const fee = method?.feeUsd ? Number(method.feeUsd) : 0;
    const network = chainName(chainId);
    const active = deposit?.status === "active";
    const slippage = method?.withdrawal?.maxSlippagePct ?? null;
    const detailRows: ui.DetailRow[] = [];
    if (slippage) {
      detailRows.push({ key: "slippage", label: `${root.t("address.maxSlippage")}:`, value: `${root.t("address.auto")} • ${slippage}%` });
    }
    if (method?.feeUsd) {
      detailRows.push({ key: "fee", label: `${root.t("address.feeEstimate")}:`, value: `~$${fee.toFixed(2)}` });
    }
    if (method?.etaSeconds) {
      detailRows.push({ key: "eta", label: `${root.t("address.eta")}:`, value: `< ${minutes(method.etaSeconds)} min` });
    }
    const details =
      detailRows.length > 0 ? (
        <ui.DetailsAccordion
          variant="deposit"
          unstyled={unstyled ?? root.unstyled}
          label={`${slippage ? root.t("address.priceImpact") : root.t("address.feeEstimate")}:`}
          value={slippage ? `< ${slippage}%` : method?.feeUsd ? `~$${fee.toFixed(2)}` : null}
          rows={slippage ? detailRows : detailRows.filter((row) => row.key !== "fee")}
        />
      ) : null;
    return (
      <ui.CryptoAddressCard
        {...rest}
        ref={ref}
        part="crypto-address"
        className={className}
        style={style}
        unstyled={unstyled}
        data-status={deposit?.status ?? "creating"}
        data-chain={chainId}
        address={deposit?.address ?? null}
        loading={creating}
        showQr={showQr && (creating || active)}
        overlay={currency ? <ui.TokenIcon symbol={currency} size={48} /> : null}
        badge={chainId && currency && ui.needsChainBadge(chainId, currency) ? <ui.ChainIcon chainId={chainId} size={24} /> : null}
        warning={currency ? root.t("address.warning", { currency: currency.toUpperCase(), network }) : null}
        highFee={fee > HIGH_FEE_USD ? root.t("address.highFee", { network, fee: fee.toFixed(2) }) : null}
        details={details}
      >
        {deposit?.status === "expired" && (
          <ui.Notice variant="hint" part="warning" data-variant="expired" unstyled={unstyled}>
            {root.t("crypto.expired")}
          </ui.Notice>
        )}
        {children}
      </ui.CryptoAddressCard>
    );
  },
);

const useLiveView = (state: DepositFlowState | null, deposit: FiatDeposit | null) => {
  const root = usePayRoot("<Pay.Requisites>");
  const countdown = useCountdown(deposit?.expiresAt ?? null);
  if (!state || !deposit) return null;
  const view: PayView =
    countdown.expired && state.view?.kind === "requisites"
      ? getPayView(deposit, state.knownRequisites, root.client.clock.now())
      : (state.view ?? getPayView(deposit, state.knownRequisites, root.client.clock.now()));
  return view;
};

export type RequisitesProps = DivProps & {
  frameTitle?: string;
  readyTimeoutMs?: number;
};

export const Requisites = forwardRef<HTMLDivElement, RequisitesProps>(function Requisites(
  { frameTitle, readyTimeoutMs, children, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useDeposit("<Pay.Requisites>");
  const deposit = state?.deposit?.kind === "fiat" ? state.deposit : null;
  const view = useLiveView(state, deposit);
  if (!state || !deposit || !view || (state.step !== "requisites" && state.step !== "done")) return null;
  if (state.step === "done" && view.kind !== "closed") return null;
  const isUnstyled = unstyled ?? root.unstyled;
  const delivery = view.kind === "frame" ? "frame" : "raw";
  let body: ReactNode = null;
  if (view.kind === "requisites") {
    const r = view.requisites;
    const amountLabel = formatPayingAmount(r.amount, deposit.currency);
    const rows: ui.RequisiteRow[] = [];
    if (r.bank) rows.push({ key: "bank", label: root.t("fiat.recipientBank"), value: r.bank });
    if (r.recipient) rows.push({ key: "recipient", label: root.t("fiat.recipientName"), value: r.recipient });
    if (r.country) rows.push({ key: "country", label: root.t("fiat.recipientCountry"), value: r.country });
    rows.push({ key: r.kind, label: root.t(payToLabelKey(r.kind)), value: r.display, copy: r.copyValue, mono: true });
    rows.push({ key: "amount", label: root.t("fiat.payAmount"), value: amountLabel, copy: r.amountCopy, accent: true });
    body = (
      <ui.Requisites
        unstyled={isUnstyled}
        sensitive={false}
        rows={rows}
        note={root.t("fiat.payExactAmount", { amount: amountLabel })}
      />
    );
  } else if (view.kind === "frame") {
    body = (
      <RequisitesFrame
        depositId={deposit.id}
        origins={view.frame?.origins}
        path={view.frame?.path}
        title={frameTitle}
        readyTimeoutMs={readyTimeoutMs}
        unstyled={unstyled}
      />
    );
  } else if (view.kind === "qr") {
    body = (
      <ui.QrImageCard unstyled={isUnstyled}>
        <Qr value={view.payload ?? ""} fallbackUrl={view.imageUrl} size={208} unstyled />
      </ui.QrImageCard>
    );
  } else if (view.kind === "closed") {
    body = (
      <ui.Notice variant="hint" part="warning" data-variant="closed" unstyled={isUnstyled}>
        {root.t("requisites.closed")}
      </ui.Notice>
    );
  }
  return (
    <div
      {...rest}
      ref={ref}
      {...partProps("requisites", { className, style, unstyled }, root.unstyled, {
        sensitive: view.kind === "requisites",
      })}
      {...(view.kind === "requisites" ? ui.SENSITIVE_PROPS : {})}
      data-delivery={delivery}
      data-view={view.kind}
    >
      {body}
      {children}
    </div>
  );
});

const systemTheme = (): "light" | "dark" | undefined => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export type RequisitesFrameProps = DivProps & {
  depositId: string;
  origins?: readonly string[];
  path?: string;
  title?: string;
  readyTimeoutMs?: number;
};

export const RequisitesFrame = forwardRef<HTMLDivElement, RequisitesFrameProps>(
  function RequisitesFrame(
    { depositId, origins, path, title, readyTimeoutMs, className, style, unstyled, children, ...rest },
    ref,
  ) {
    const root = usePayRoot("<Pay.RequisitesFrame>");
    const container = useRef<HTMLDivElement | null>(null);
    const handle = useRef<RequisitesFrameHandle | null>(null);
    const [status, setStatus] = useState<{ status: RequisitesFrameStatus; error: PayError | null }>({
      status: "loading",
      error: null,
    });
    const flow = root.mode === "deposit" ? (root.flow.actions as DepositFlowActions) : null;
    const originsKey = origins?.join(" ") ?? "";
    const latest = useRef({ root, flow, title, readyTimeoutMs });
    useEffect(() => {
      latest.current = { root, flow, title, readyTimeoutMs };
    });
    const client = root.client;

    useEffect(() => {
      const element = container.current;
      if (!element) return;
      const initial = latest.current;
      const run = runRequisitesFrame(element, {
        depositId,
        origins: client.frameOrigins(originsKey ? originsKey.split(" ") : []),
        path,
        getTicket: (signal) => client.getRequisitesFrameTicket(depositId, signal),
        lang: initial.root.intl,
        theme: initial.root.theme ?? systemTheme(),
        skin: initial.root.skin,
        title: initial.title ?? initial.root.t("requisites.title"),
        readyTimeoutMs: initial.readyTimeoutMs,
        onStatus: (next, error) => {
          setStatus({ status: next, error });
          if (next === "unavailable" && error) {
            client.emit({ type: "error", code: error.code, scope: "requisites.frame" });
          }
        },
        onReceiptAttached: () => void latest.current.flow?.refreshContext(),
        isActive: () => {
          const current = latest.current.root;
          if (current.mode !== "deposit") return true;
          const deposit = (current.flow.getSnapshot() as DepositFlowState).deposit;
          return !(deposit?.kind === "fiat" && deposit.id === depositId && isTerminalDepositStatus(deposit.status));
        },
      });
      handle.current = run;
      return () => {
        run.destroy();
        handle.current = null;
      };
    }, [depositId, originsKey, path, client]);

    const setRef = useCallback(
      (element: HTMLDivElement | null) => {
        assignRef(ref, element);
      },
      [ref],
    );

    return (
      <div
        {...rest}
        ref={setRef}
        {...partProps("requisites-frame", { className, style, unstyled }, root.unstyled)}
        data-status={status.status}
      >
        {status.status === "loading" && <ui.Loader label={root.t("requisites.loading")} unstyled={unstyled} />}
        {status.status === "unavailable" && (
          <ui.ErrorBox part="error" variant="rail" unstyled={unstyled} data-error={status.error?.code ?? "REQUISITES_FRAME_UNAVAILABLE"}>
            <div>
              {errorMessage(
                root.t,
                status.error?.code === "REQUISITES_FRAME_UNAVAILABLE" || !status.error
                  ? { code: "REQUISITES_FRAME_UNAVAILABLE", details: {} }
                  : status.error,
                root.locale,
              )}
            </div>
            <button
              type="button"
              data-binodex-pay="retry"
              className={(unstyled ?? root.unstyled) ? undefined : "bp-max-button"}
              onClick={() => handle.current?.retry()}
            >
              {root.t("common.retry")}
            </button>
          </ui.ErrorBox>
        )}
        <div
          ref={container}
          data-binodex-pay="frame-slot"
          hidden={status.status === "unavailable"}
        />
        {children}
      </div>
    );
  },
);

export const ReceiptUpload = forwardRef<HTMLInputElement, DivProps & { accept?: string }>(
  function ReceiptUpload({ accept, className, style, unstyled, children, ...rest }, ref) {
    const { root, actions, state } = useDeposit("<Pay.ReceiptUpload>");
    if (!state || !actions || state.step !== "requisites") return null;
    const deposit = state.deposit?.kind === "fiat" ? state.deposit : null;
    if (
      !deposit ||
      deposit.rail !== "ru" ||
      !deposit.receipt.required ||
      state.view?.kind !== "requisites"
    ) {
      return null;
    }
    const isUnstyled = unstyled ?? root.unstyled;
    const attached = deposit.receipt.attachedAt !== null;
    const pdfOnly = getRuReceiptRule("paylee", deposit.methodId.split(":").pop())?.pdfOnly ?? false;
    return (
      <div
        {...rest}
        {...partProps("receipt", { className: [isUnstyled ? null : "bp-receipt-block", className].filter(Boolean).join(" ") || undefined, style, unstyled }, root.unstyled)}
        data-attached={attached ? "" : undefined}
        data-pending={state.receiptPending ? "" : undefined}
      >
        {attached ? (
          <ui.ReceiptAttached unstyled={isUnstyled} />
        ) : (
          <>
            {pdfOnly ? (
              <ui.PdfReceiptWarning unstyled={isUnstyled} />
            ) : (
              <ui.Notice variant="receipt" unstyled={isUnstyled}>
                {root.t("receipt.hintPaayzen")}
              </ui.Notice>
            )}
            <ui.ReceiptForm
              unstyled={isUnstyled}
              inputRef={ref}
              accept={accept}
              pdfOnly={pdfOnly}
              sending={state.receiptPending}
              error={state.receiptError ? errorMessage(root.t, state.receiptError, root.locale) : null}
              onSubmit={(file) => actions.attachReceipt(file)}
            />
          </>
        )}
        {children}
      </div>
    );
  },
);

export const Countdown = forwardRef<HTMLDivElement, DivProps & { expiresAt?: number | null }>(
  function Countdown({ expiresAt, className, style, unstyled, children, ...rest }, ref) {
    const { root, state } = useDeposit("<Pay.Countdown>");
    const fiat = state?.deposit?.kind === "fiat" && state.step === "requisites" ? state.deposit : null;
    const target =
      expiresAt !== undefined
        ? expiresAt
        : fiat
          ? fiat.expiresAt
          : state?.deposit?.kind === "crypto" && state.step === "crypto-address"
            ? state.deposit.expiresAt
            : null;
    const framed = expiresAt === undefined && state?.step === "requisites" && state.view?.kind === "frame";
    const attached = fiat !== null && fiat.receipt.required && fiat.receipt.attachedAt !== null;
    const countdown = useCountdown(framed ? null : (target ?? null));
    if (framed || attached || target === null || target === undefined || countdown.text === null) return null;
    const text =
      expiresAt === undefined && fiat
        ? `${root.t(railKey(fiat.rail, "expiresIn"))}: ${countdown.expired ? "00:00" : countdown.text}`
        : countdown.expired
          ? root.t("countdown.expired")
          : root.t("countdown.left", { time: countdown.text });
    return (
      <ui.ExpiresLine
        role="timer"
        aria-live="off"
        {...rest}
        ref={ref}
        part="countdown"
        className={className}
        style={style}
        unstyled={unstyled}
        data-expired={countdown.expired ? "" : undefined}
      >
        {children ?? text}
      </ui.ExpiresLine>
    );
  },
);

export const RedirectButton = forwardRef<
  HTMLAnchorElement,
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "style" | "href" | "target" | "rel"> &
    PartStyleProps
>(function RedirectButton({ children, ...rest }, ref) {
  const { root, state } = useDeposit("<Pay.RedirectButton>");
  if (!state || state.step !== "redirect" || state.view?.kind !== "redirect") return null;
  const url = state.view.url;
  if (!/^https:\/\//i.test(url)) return null;
  const rail = state.deposit?.kind === "fiat" ? state.deposit.rail : "ru";
  return (
    <ui.SubmitLink {...rest} ref={ref} part="redirect" href={url}>
      {children ?? root.t(railKey(rail, "openPaywall"))}
    </ui.SubmitLink>
  );
});

export const RestartButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & PartStyleProps
>(function RestartButton({ onClick, children, ...rest }, ref) {
  const root = usePayRoot("<Pay.RestartButton>");
  const state = useStoreValue<DepositFlowState | WithdrawFlowState>(root.flow);
  let label: string | null = null;
  let restart: (() => void) | null = null;
  if (root.mode === "deposit") {
    const s = state as DepositFlowState;
    const fiat = s.deposit?.kind === "fiat" ? s.deposit : null;
    if (!fiat || (s.step !== "requisites" && s.step !== "redirect" && s.step !== "done")) return null;
    const attached = fiat.receipt.required && fiat.receipt.attachedAt !== null;
    const terminal = s.step === "done" || isTerminalDepositStatus(fiat.status) || attached;
    label = root.t(railKey(fiat.rail, terminal ? "newPayment" : "cancel"));
    restart = () => (root.flow.actions as DepositFlowActions).back();
  } else {
    const s = state as WithdrawFlowState;
    const terminal =
      s.step === "status" &&
      s.withdrawal &&
      (s.withdrawal.displayStatus === "failed" ||
        ["completed", "failed", "cancelled", "refunded"].includes(s.withdrawal.status));
    if (!terminal) return null;
    label = root.t("trigger.withdraw");
    restart = () => (root.flow.actions as WithdrawFlowActions).reset();
  }
  return (
    <ui.LinkButton
      {...rest}
      ref={ref}
      part="restart"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) restart?.();
      }}
    >
      {children ?? label}
    </ui.LinkButton>
  );
});

export const MethodNotice = forwardRef<HTMLDivElement, DivProps>(function MethodNotice(
  { className, style, unstyled, children, ...rest },
  ref,
) {
  const { root, state } = useDeposit("<Pay.MethodNotice>");
  if (!state || (state.step !== "enter-amount" && state.step !== "creating")) return null;
  const method = state.method?.kind === "fiat" ? state.method : null;
  if (!method || getMethodLogo(method.methodId).badge !== "pdf") return null;
  return (
    <ui.Notice {...rest} ref={ref} part="method-notice" variant="receipt" className={className} style={style} unstyled={unstyled}>
      {children ?? root.t("fiat.receiptMayBeNeeded")}
    </ui.Notice>
  );
});

export type OnrampProps = Omit<IframeHTMLAttributes<HTMLIFrameElement>, "className" | "style" | "src"> &
  PartStyleProps & { display?: "embed" | "tab"; height?: number };

export const Onramp = forwardRef<HTMLIFrameElement, OnrampProps>(function Onramp(
  { display = "embed", height = 560, className, style, unstyled, title, ...rest },
  ref,
) {
  const { root, actions, state } = useDeposit("<Pay.Onramp>");
  const active = state?.step === "onramp";
  useEffect(() => {
    if (active && actions) void actions.loadOnramp();
  }, [active, actions]);
  if (!state || !actions || !active) return null;
  if (state.onrampError) {
    return (
      <ui.ErrorBox part="error" variant="rail" unstyled={unstyled} data-error={state.onrampError.code}>
        <div>{errorMessage(root.t, state.onrampError, root.locale)}</div>
        <button
          type="button"
          data-binodex-pay="retry"
          className={(unstyled ?? root.unstyled) ? undefined : "bp-max-button"}
          onClick={() => void actions.retryOnramp()}
        >
          {root.t("common.retry")}
        </button>
      </ui.ErrorBox>
    );
  }
  const url = state.onrampUrl;
  if (!url || !/^https:\/\//i.test(url)) {
    return state.onrampLoading ? <ui.Loader unstyled={unstyled} /> : null;
  }
  if (display === "tab") {
    return (
      <ui.SubmitLink part="onramp" href={url} className={className} style={style} unstyled={unstyled} data-display="tab">
        {root.t("onramp.open")}
      </ui.SubmitLink>
    );
  }
  return (
    <iframe
      title={title ?? root.t("onramp.title")}
      allow="accelerometer; autoplay; camera; gyroscope; payment; clipboard-write"
      referrerPolicy="no-referrer"
      height={height}
      {...rest}
      ref={ref}
      src={url}
      {...partProps("onramp", { className, style: { width: "100%", border: 0, ...style }, unstyled }, root.unstyled)}
      data-display="embed"
    />
  );
});

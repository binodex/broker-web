"use client";

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import type { DepositFlowState } from "../../core/flows/deposit.js";
import type { WithdrawFlowActions, WithdrawFlowState } from "../../core/flows/withdraw.js";
import { errorMessage, type MessageKey, type Translate } from "../../core/i18n/index.js";
import { formatPayingAmount, formatPercentValue, formatTokenAmount, formatUsd } from "../../core/money.js";
import type { FiatDeposit, FiatDepositStatus, FiatRail, Withdrawal } from "../../core/types.js";
import * as ui from "../../ui/index.js";
import { balanceText } from "../../ui/context.js";
import { explorerUrl } from "../chains.js";
import type { PartStyleProps } from "../part.js";
import { railKey, useFlowState } from "./basic.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> &
  PartStyleProps & { children?: ReactNode };

export const Quote = forwardRef<HTMLDivElement, DivProps>(function Quote(
  { className, style, unstyled, children, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.Quote>");
  if (root.mode === "deposit") {
    const s = state as DepositFlowState;
    if (s.step !== "enter-amount" || s.method?.kind !== "fiat") return null;
    const rail = s.method.rail;
    if (s.quoteError) {
      return (
        <ui.ErrorBox
          {...rest}
          ref={ref}
          part="quote"
          variant="rail"
          className={className}
          style={style}
          unstyled={unstyled}
          data-error={s.quoteError.code}
        >
          {errorMessage(root.t, s.quoteError, root.locale)}
        </ui.ErrorBox>
      );
    }
    const quote = s.quote;
    if (!quote && !s.quoteLoading) return null;
    const loading = s.quoteLoading;
    const commission = quote?.displayedCommissionPct ?? s.method.displayedCommissionPct;
    const rows = [
      ...(commission
        ? [
            {
              key: "commission",
              label: root.t(railKey(rail, "commissionLabel")),
              value: loading ? "…" : root.t("common.percent", { value: formatPercentValue(commission, root.intl) }),
            },
          ]
        : []),
      {
        key: "estimated",
        label: root.t(railKey(rail, "estimatedLabel")),
        value: loading || !quote?.estimatedUsd ? "≈ …" : `≈ ${formatUsd(quote.estimatedUsd)}`,
      },
    ];
    return (
      <ui.Summary
        {...rest}
        ref={ref}
        part="quote"
        className={className}
        style={style}
        unstyled={unstyled}
        data-loading={loading ? "" : undefined}
        rows={rows}
      >
        {children}
      </ui.Summary>
    );
  }
  const s = state as WithdrawFlowState;
  if (s.step === "loading" || s.step === "status" || s.step === "error") return null;
  if (s.step === "quoting") {
    return (
      <ui.QuoteRows
        {...rest}
        ref={ref}
        part="quote"
        className={className}
        style={style}
        unstyled={unstyled}
        rows={[]}
        loading
        loadingRows={s.method?.etaSeconds || s.method?.withdrawal?.etaSeconds ? 3 : 2}
        loadingLabel={root.t("withdraw.quoteLoading")}
      />
    );
  }
  if (s.quoteError) {
    return (
      <ui.ErrorBox
        {...rest}
        ref={ref}
        part="quote"
        variant="withdraw"
        className={className}
        style={style}
        unstyled={unstyled}
        data-error={s.quoteError.code}
      >
        <div>{errorMessage(root.t, s.quoteError, root.locale)}</div>
        <button
          type="button"
          className={(unstyled ?? root.unstyled) ? undefined : "bp-max-button"}
          data-binodex-pay="retry"
          onClick={() => (root.flow.actions as WithdrawFlowActions).requote()}
        >
          {root.t("withdraw.retry")}
        </button>
      </ui.ErrorBox>
    );
  }
  if (!s.quote || !s.method) return null;
  const currency = s.method.currency;
  const eta = s.quote.etaSeconds ?? s.method.withdrawal?.etaSeconds ?? null;
  const rows: ui.QuoteRow[] = [
    {
      key: "receive",
      label: root.t("withdraw.receive"),
      icon: <ui.TokenIcon symbol={currency} size={18} />,
      value: `~${formatTokenAmount(s.quote.receiveAmount, currency)} ${currency}`,
    },
    {
      key: "fee",
      label: root.t("withdraw.networkFee"),
      value: `~${balanceText(s.quote.feeUsd)}`,
    },
  ];
  if (s.acceptedSlippagePct !== null && s.quote.slippagePct) {
    rows.push({ key: "slippage", label: root.t("withdraw.slippage"), value: `~${s.quote.slippagePct}%`, tone: "warning" });
  }
  if (eta) {
    rows.push({ key: "eta", label: root.t("withdraw.time"), value: `~${Math.ceil(eta / 60)} ${root.t("withdraw.minutes")}` });
  }
  return (
    <ui.QuoteRows {...rest} ref={ref} part="quote" className={className} style={style} unstyled={unstyled} rows={rows}>
      {children}
    </ui.QuoteRows>
  );
});

export const SlippageWarning = forwardRef<HTMLDivElement, DivProps>(function SlippageWarning(
  { className, style, unstyled, children, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.SlippageWarning>");
  if (root.mode !== "withdraw") return null;
  const s = state as WithdrawFlowState;
  if (s.step !== "slippage-confirm" || !s.slippageWarning || !s.method) return null;
  const warning = s.slippageWarning;
  const currency = s.method.currency;
  const pct = warning.slippagePct ? formatPercentValue(warning.slippagePct, root.intl) : "?";
  const amount = [
    warning.receiveAmount ? `${formatTokenAmount(warning.receiveAmount, currency)} ${currency}` : null,
    warning.receiveAmountUsd ? `(~${balanceText(warning.receiveAmountUsd)})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <ui.SlippageWarning
      {...rest}
      ref={ref}
      part="slippage"
      className={className}
      style={style}
      unstyled={unstyled}
      title={`${root.t("withdraw.slippageTitle")}: ~${pct}%`}
      body={`${root.t("withdraw.slippageBody", { amount, pct })} ${root.t("withdraw.slippageHint")}`}
      actionLabel={root.t("withdraw.slippageAccept")}
      onAccept={() => (root.flow.actions as WithdrawFlowActions).acceptSlippage()}
    >
      {children}
    </ui.SlippageWarning>
  );
});

export type StatusProps = Omit<DivProps, "children"> & {
  children?: ReactNode | ((status: { status: string; label: string }) => ReactNode);
};

const fiatStatusKey = (rail: FiatRail, status: FiatDepositStatus): MessageKey => {
  switch (status) {
    case "completed":
      return railKey(rail, "statusCompleted");
    case "failed":
      return railKey(rail, "statusFailed");
    case "expired":
      return railKey(rail, "statusExpired");
    case "disputed":
      return "fiat.statusInCheck";
    default:
      return railKey(rail, "statusPending");
  }
};

const toneOf = (status: FiatDepositStatus): { tone: ui.StatusTone; status: string } =>
  status === "completed"
    ? { tone: "completed", status: "success" }
    : status === "pending" || status === "disputed"
      ? { tone: "pending", status: "pending" }
      : { tone: "failed", status: "failed" };

const formatDateTime = (at: number, intl: string): string => {
  try {
    return new Date(at).toLocaleString(intl, {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return new Date(at).toISOString();
  }
};

function WithdrawDetails({ withdrawal, t, intl, unstyled }: { withdrawal: Withdrawal; t: Translate; intl: string; unstyled?: boolean }) {
  const [open, setOpen] = useState(false);
  const hash = withdrawal.destinationTxHash;
  const link = withdrawal.chainId ? explorerUrl(withdrawal.chainId, hash) : null;
  const cls = unstyled ? () => undefined : (name: string) => `bp-${name}`;
  return (
    <ui.DetailsAccordion
      variant="withdraw"
      unstyled={unstyled}
      open={open}
      onOpenChange={setOpen}
      label={t("withdraw.details")}
      rows={[
        {
          key: "tx",
          label: t("withdraw.txHash"),
          value: hash ? (
            <span className={cls("hash")}>
              <span className={cls("short-hash")} data-binodex-pay="tx-hash">
                {`${hash.slice(0, 6)}…${hash.slice(-4)}`}
              </span>
              <ui.CopyButton value={hash} unstyled className={cls("hash-button")} />
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cls("hash-button")}
                  data-binodex-pay="tx-link"
                  title={t("status.tx")}
                  aria-label={t("status.tx")}
                >
                  <ui.icons.ExplorerIcon />
                </a>
              )}
            </span>
          ) : (
            <span>{t("withdraw.txPending")}</span>
          ),
        },
        { key: "created", label: t("withdraw.orderSent"), value: formatDateTime(withdrawal.createdAt, intl) },
      ]}
    />
  );
}

export const Status = forwardRef<HTMLDivElement, StatusProps>(function Status(
  { className, style, unstyled, children, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.Status>");
  const isUnstyled = unstyled ?? root.unstyled;
  if (root.mode === "deposit") {
    const s = state as DepositFlowState;
    const fiat = s.deposit?.kind === "fiat" ? (s.deposit as FiatDeposit) : null;
    if (s.step === "done" && !fiat) {
      if (s.outcome !== "credited") return null;
      const total = s.credited.reduce((sum, entry) => sum + Number(entry.amountUsd ?? 0), 0);
      const label = root.t("credit.title");
      if (typeof children === "function") return <>{children({ status: "success", label })}</>;
      return (
        <ui.CreditBanner
          {...rest}
          ref={ref}
          part="status"
          className={className}
          style={style}
          unstyled={unstyled}
          data-status="success"
          title={label}
          subtitle={total > 0 ? root.t("credit.subtitle", { amount: `+${balanceText(total)}` }) : undefined}
        >
          {children}
        </ui.CreditBanner>
      );
    }
    const paying = (s.step === "requisites" || s.step === "redirect") && fiat;
    if (!fiat || (!paying && s.step !== "done")) return null;
    // The requisites frame draws its own status and timer; a second pill here would contradict it.
    if (s.view?.kind === "frame" && s.step !== "done") return null;
    const shown = s.step === "done" ? fiat.status : (s.shownStatus ?? fiat.status);
    const attachedPending = shown === "pending" && fiat.receipt.attachedAt !== null && fiat.receipt.required;
    const tone = toneOf(shown);
    const label = root.t(attachedPending ? "fiat.statusInCheck" : fiatStatusKey(fiat.rail, shown));
    if (typeof children === "function") return <>{children({ status: tone.status, label })}</>;
    const requisitesAmount = s.view?.kind === "requisites" ? s.view.requisites.amount : null;
    const amount = requisitesAmount ?? fiat.amount;
    const hint =
      shown !== "pending" || attachedPending
        ? null
        : s.view?.kind === "requisites"
          ? root.t("fiat.requisitesHint")
          : s.view?.kind === "redirect"
            ? root.t(railKey(fiat.rail, "openedInNewTab"))
            : s.view?.kind === "qr"
              ? root.t(railKey(fiat.rail, "scanQr"))
              : null;
    return (
      <>
        <ui.StatusPill
          {...rest}
          ref={ref}
          part="status"
          role="status"
          aria-live="polite"
          className={className}
          style={style}
          unstyled={unstyled}
          tone={tone.tone}
          data-status={tone.status}
          label={label}
        />
        {amount && <ui.PanelAmount unstyled={isUnstyled}>{formatPayingAmount(amount, fiat.currency)}</ui.PanelAmount>}
        {hint && <ui.PanelHint unstyled={isUnstyled}>{hint}</ui.PanelHint>}
        {children}
      </>
    );
  }
  const s = state as WithdrawFlowState;
  if (s.step !== "status") return null;
  const withdrawal = s.withdrawal;
  const status = withdrawal?.displayStatus ?? "pending";
  const label = root.t(
    status === "success" ? "withdraw.successTitle" : status === "failed" ? "withdraw.failedTitle" : "withdraw.pendingTitle",
  );
  if (typeof children === "function") return <>{children({ status, label })}</>;
  const currency = withdrawal?.currency?.toUpperCase() ?? null;
  const receiveAmount = withdrawal?.receiveAmount ?? null;
  const rows: ui.DetailRow[] = [
    {
      key: "status",
      label: root.t("withdraw.statusLabel"),
      value: (
        <ui.StatusText tone={status} unstyled={isUnstyled}>
          {root.t(
            status === "success" ? "withdraw.statusSuccess" : status === "failed" ? "withdraw.statusFailed" : "withdraw.statusPending",
          )}
        </ui.StatusText>
      ),
    },
  ];
  if (currency) {
    rows.push({
      key: "receive",
      label: root.t("withdraw.receive"),
      value: (
        <span className={isUnstyled ? undefined : "bp-receive-value"}>
          <ui.TokenIcon symbol={currency} size={18} />
          <span className={isUnstyled ? undefined : "bp-mono"}>
            {receiveAmount !== null ? (
              <>
                {`~${formatTokenAmount(receiveAmount, currency)} ${currency}`}
                {withdrawal?.receiveAmountUsd && (
                  <span className={isUnstyled ? undefined : "bp-muted"} style={{ marginLeft: 6 }}>
                    {`(~${balanceText(withdrawal.receiveAmountUsd)})`}
                  </span>
                )}
              </>
            ) : (
              "—"
            )}
          </span>
        </span>
      ),
    });
  }
  if (status === "success" && withdrawal) {
    const seconds = Math.max(1, Math.round((withdrawal.updatedAt - withdrawal.createdAt) / 1000));
    rows.push({
      key: "time",
      label: root.t("withdraw.time"),
      value:
        seconds < 60
          ? `${seconds} ${root.t("withdraw.seconds")}`
          : `${Math.round(seconds / 60)} ${root.t("withdraw.minutes")}`,
    });
  }
  return (
    <ui.WithdrawResult
      {...rest}
      ref={ref}
      part="status"
      role="status"
      aria-live="polite"
      className={className}
      style={style}
      unstyled={unstyled}
      data-status={status}
      state={status}
      title={label}
      subtitle={root.t(
        status === "success"
          ? "withdraw.successSubtitle"
          : status === "failed"
            ? "withdraw.failedSubtitle"
            : "withdraw.pendingSubtitle",
      )}
      rows={rows}
      details={withdrawal ? <WithdrawDetails withdrawal={withdrawal} t={root.t} intl={root.intl} unstyled={isUnstyled} /> : null}
    >
      {children}
    </ui.WithdrawResult>
  );
});

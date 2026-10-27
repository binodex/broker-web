"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { useClasses } from "./context.js";
import { FailIcon, SuccessIcon } from "./icons.js";
import { viewProps, partProps, type PartStyleProps } from "./part.js";
import type { DetailRow, ResultState } from "./types.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children" | "title"> & PartStyleProps;

export interface SlippageWarningProps extends DivProps {
  title: ReactNode;
  body: ReactNode;
  actionLabel?: ReactNode;
  onAccept?: () => void;
  part?: string;
  children?: ReactNode;
}

export const SlippageWarning = forwardRef<HTMLDivElement, SlippageWarningProps>(function SlippageWarning(
  { title, body, actionLabel, onAccept, part = "slippage-warning", children, className, style, unstyled, ...rest },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  return (
    <div role="alert" {...rest} ref={ref} {...viewProps(part, "slippage-warning", { className, style, unstyled }, off)}>
      <div className={c("warn-title")} data-binodex-pay="slippage-title">
        {title}
      </div>
      <div>{body}</div>
      {children}
      {onAccept && (
        <button type="button" className={c("warn-button")} data-binodex-pay="accept-slippage" onClick={onAccept}>
          {actionLabel ?? ui.t("withdraw.slippageAccept")}
        </button>
      )}
    </div>
  );
});

export const StatusSteps = forwardRef<HTMLDivElement, DivProps>(function StatusSteps({ className, style, unstyled, ...rest }, ref) {
  const { c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("steps", { className, style, unstyled }, off)}>
      <div className={c("step", "step-active")}>1</div>
      <span className={c("step-loader")} aria-hidden="true">
        <span className={c("step-dot")} />
        <span className={c("step-dot")} />
        <span className={c("step-dot")} />
      </span>
      <div className={c("step")}>2</div>
    </div>
  );
});

export const ResultIcon = ({ state, unstyled }: { state: Exclude<ResultState, "pending">; unstyled?: boolean }) => {
  const { c } = useClasses(unstyled);
  return (
    <div className={c("result-icon-wrap")} data-binodex-pay="result-icon" data-state={state}>
      {state === "success" ? (
        <div className={c("result-icon-success")}>
          <SuccessIcon />
        </div>
      ) : (
        <div className={c("result-icon-failed")}>
          <FailIcon />
        </div>
      )}
    </div>
  );
};

export const StatusText = ({ tone, children, unstyled }: { tone: ResultState; children?: ReactNode; unstyled?: boolean }) => {
  const { c } = useClasses(unstyled);
  return (
    <span className={c(tone === "success" ? "status-success" : tone === "failed" ? "status-failed" : "status-pending")}>
      {children}
    </span>
  );
};

export interface StatusCardProps extends DivProps {
  rows: DetailRow[];
}

export const StatusCard = forwardRef<HTMLDivElement, StatusCardProps>(function StatusCard(
  { rows, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("status-card", { className, style, unstyled }, off)}>
      {rows.map((row, index) => (
        <div
          key={row.key ?? index}
          className={c("status-row")}
          data-binodex-pay="quote-row"
          data-row={row.key}
          {...row.attrs}
        >
          <span className={c("status-row-label")}>{row.label}</span>
          <span className={c("status-row-value")}>{row.value}</span>
        </div>
      ))}
    </div>
  );
});

export interface WithdrawResultProps extends DivProps {
  state: ResultState;
  title: ReactNode;
  subtitle?: ReactNode;
  rows: DetailRow[];
  details?: ReactNode;
  part?: string;
  children?: ReactNode;
}

export const WithdrawResult = forwardRef<HTMLDivElement, WithdrawResultProps>(function WithdrawResult(
  { state, title, subtitle, rows, details, part = "withdraw-result", children, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...viewProps(part, "withdraw-result", { className, style, unstyled }, off)} data-state={state}>
      {state === "pending" ? <StatusSteps unstyled={unstyled} /> : <ResultIcon state={state} unstyled={unstyled} />}
      <div className={c("title-block")}>
        <h2 className={c("status-title")} data-binodex-pay="status-label">
          {title}
        </h2>
        {subtitle && <p className={c("status-subtitle")}>{subtitle}</p>}
      </div>
      <StatusCard rows={rows} unstyled={unstyled} />
      {details}
      {children}
    </div>
  );
});

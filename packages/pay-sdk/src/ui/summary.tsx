"use client";

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { useClasses } from "./context.js";
import { Skeleton } from "./fields.js";
import { ChevronIcon } from "./icons.js";
import { viewProps, type PartStyleProps } from "./part.js";
import type { DetailRow, QuoteRow, SummaryRow } from "./types.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> & PartStyleProps;

const rowKey = (row: { key?: string; label: ReactNode }, index: number) =>
  row.key ?? (typeof row.label === "string" ? row.label : String(index));

export interface SummaryProps extends DivProps {
  rows: SummaryRow[];
  part?: string;
  children?: ReactNode;
}

export const Summary = forwardRef<HTMLDivElement, SummaryProps>(function Summary(
  { rows, part = "summary", children, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  if (!rows.length && !children) return null;
  return (
    <div {...rest} ref={ref} {...viewProps(part, "summary", { className, style, unstyled }, off)}>
      {rows.map((row, index) => (
        <div className={c("summary-row")} key={rowKey(row, index)} data-binodex-pay="summary-row" data-row={row.key}>
          <span className={c("summary-label")}>{row.label}</span>
          <span className={c("summary-value")}>{row.value}</span>
        </div>
      ))}
      {children}
    </div>
  );
});

export interface QuoteRowsProps extends DivProps {
  rows: QuoteRow[];
  loading?: boolean;
  loadingRows?: number;
  loadingLabel?: string;
  part?: string;
  children?: ReactNode;
}

export const QuoteRows = forwardRef<HTMLDivElement, QuoteRowsProps>(function QuoteRows(
  { rows, loading = false, loadingRows = 3, loadingLabel, part = "quote-rows", children, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  if (loading) {
    return (
      <div
        role="status"
        aria-label={loadingLabel}
        {...rest}
        ref={ref}
        {...viewProps(part, "quote-rows", { className, style, unstyled }, off)}
        data-loading=""
      >
        <div className={c("quote-row")}>
          <Skeleton width={96} height={8} radius={3} unstyled={unstyled} />
          <span className={c("quote-value")}>
            <Skeleton width={18} height={18} radius="circle" unstyled={unstyled} />
            <Skeleton width={72} height={12} radius={3} unstyled={unstyled} />
          </span>
        </div>
        <div className={c("quote-row")}>
          <Skeleton width={96} height={8} radius={3} unstyled={unstyled} />
          <Skeleton width={48} height={12} radius={3} unstyled={unstyled} />
        </div>
        {loadingRows > 2 && (
          <div className={c("quote-row")}>
            <Skeleton width={40} height={8} radius={3} unstyled={unstyled} />
            <Skeleton width={40} height={12} radius={3} unstyled={unstyled} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div {...rest} ref={ref} {...viewProps(part, "quote-rows", { className, style, unstyled }, off)}>
      {rows.map((row, index) => (
        <div
          className={c("quote-row")}
          key={rowKey(row, index)}
          data-binodex-pay="quote-row"
          data-row={row.key}
          {...row.attrs}
        >
          <span>{row.label}</span>
          <span
            className={c(
              row.tone === "warning" ? "quote-value-warning" : row.icon !== undefined ? "quote-value" : null,
            )}
          >
            {row.icon}
            {row.value}
          </span>
        </div>
      ))}
      {children}
    </div>
  );
});

export interface DetailsAccordionProps extends DivProps {
  label: ReactNode;
  value?: ReactNode;
  rows: DetailRow[];
  variant?: "deposit" | "withdraw";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  part?: string;
}

export const DetailsAccordion = forwardRef<HTMLDivElement, DetailsAccordionProps>(function DetailsAccordion(
  {
    label,
    value,
    rows,
    variant = "deposit",
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    part = "details",
    className,
    style,
    unstyled,
    ...rest
  },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const toggle = () => {
    if (openProp === undefined) setOwnOpen(!open);
    onOpenChange?.(!open);
  };
  const chevron = <ChevronIcon className={c("details-chevron", open && "details-chevron-open")} />;
  if (variant === "withdraw") {
    return (
      <div {...rest} ref={ref} {...viewProps(part, "details", { className, style, unstyled }, off)} data-variant={variant} data-open={open ? "" : undefined}>
        <button type="button" className={c("details-toggle")} data-binodex-pay="details-toggle" aria-expanded={open} onClick={toggle}>
          <span className={c("details-label")}>{label}</span>
          {chevron}
        </button>
        {open && (
          <div className={c("details-content")}>
            {rows.map((row, index) => (
              <div className={c("status-row")} key={rowKey(row, index)} data-binodex-pay="details-row" {...row.attrs}>
                <span className={c("status-row-label")}>{row.label}</span>
                <span className={c("status-row-value")}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div {...rest} ref={ref} {...viewProps(part, "details", { className, style, unstyled }, off)} data-variant={variant} data-open={open ? "" : undefined}>
      <button type="button" className={c("details-toggle")} data-binodex-pay="details-toggle" aria-expanded={open} onClick={toggle}>
        <span>{label}</span>
        <span className={c("details-toggle-right")}>
          {value}
          {chevron}
        </span>
      </button>
      <div className={c("details-collapse", open && "details-collapse-open")}>
        <div className={c("details-inner")}>
          <div className={c("details-divider")} />
          <dl className={c("details-list")}>
            {rows.map((row, index) => (
              <div className={c("detail-row")} key={rowKey(row, index)} data-binodex-pay="details-row" {...row.attrs}>
                <dt className={c("detail-label")}>{row.label}</dt>
                <dd className={c("detail-value")}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
});

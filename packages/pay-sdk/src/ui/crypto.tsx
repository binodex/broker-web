"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type SVGAttributes,
} from "react";
import { useClasses } from "./context.js";
import { ErrorBox, Skeleton } from "./fields.js";
import { CopiedIcon, CopyIcon, CreditCheckIcon, WarningIcon } from "./icons.js";
import { SENSITIVE_CLASS, SENSITIVE_PROPS, cx, partProps, viewProps, type PartStyleProps } from "./part.js";
import { encodeQr, qrPath, type QrEcc } from "./qr-encode.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children" | "title"> & PartStyleProps;

export const useCopy = (resetMs = 1200) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), resetMs);
      } catch {
        setCopied(false);
      }
    },
    [resetMs],
  );
  return { copied, copy };
};

export const LTR_ISOLATE = { unicodeBidi: "isolate" } as const;

export type QrSvgProps = Omit<SVGAttributes<SVGSVGElement>, "className" | "style" | "children"> &
  PartStyleProps & {
    value: string;
    size?: number;
    ecc?: QrEcc;
    margin?: number;
    label?: string;
    part?: string;
  };

export const qrMatrixOf = (value: string, ecc: QrEcc, margin: number) => {
  if (!value) return null;
  try {
    const matrix = encodeQr(value, ecc);
    return { side: matrix.size + margin * 2, path: qrPath(matrix, margin) };
  } catch {
    return null;
  }
};

export const QrSvg = forwardRef<SVGSVGElement, QrSvgProps>(function QrSvg(
  { value, size = 176, ecc = "M", margin = 4, label, part = "qr", className, style, unstyled, ...rest },
  ref,
) {
  const { ui, off } = useClasses(unstyled);
  const encoded = useMemo(() => qrMatrixOf(value, ecc, margin), [value, ecc, margin]);
  if (!encoded) return null;
  return (
    <svg
      role="img"
      aria-label={label ?? ui.t("qr.label")}
      viewBox={`0 0 ${encoded.side} ${encoded.side}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      {...rest}
      ref={ref}
      {...partProps(part, { className, style, unstyled }, off, { sensitive: true })}
      {...SENSITIVE_PROPS}
    >
      <rect width={encoded.side} height={encoded.side} fill="#ffffff" />
      <path d={encoded.path} fill="#000000" />
    </svg>
  );
});

export interface QrCodeProps extends DivProps {
  value: string;
  overlay?: ReactNode;
  badge?: ReactNode;
  label?: string;
}

export const QrCode = forwardRef<HTMLDivElement, QrCodeProps>(function QrCode(
  { value, overlay, badge, label, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("qr-code", { className, style, unstyled }, off)}>
      <QrSvg value={value} size={193} ecc="H" margin={0} label={label} unstyled />
      {overlay && (
        <div className={c("qr-overlay")}>
          <span className={c("qr-token")}>{overlay}</span>
          {badge && <span className={c("qr-chain")}>{badge}</span>}
        </div>
      )}
    </div>
  );
});

export interface CopyButtonProps extends PartStyleProps {
  value: string;
  label?: string;
  variant?: "address" | "requisite";
}

export function CopyButton({ value, label, variant = "address", className, style, unstyled }: CopyButtonProps) {
  const { ui, off } = useClasses(unstyled);
  const { copied, copy } = useCopy();
  const copyText = ui.t("common.copy");
  return (
    <button
      type="button"
      {...viewProps("copy", "copy", { className, style, unstyled }, off)}
      data-variant={variant}
      data-copied={copied ? "" : undefined}
      title={copyText}
      aria-label={label ? `${copyText}: ${label}` : copyText}
      onClick={() => void copy(value)}
    >
      {variant === "requisite" ? (
        copied ? (
          <svg width={14} height={14} viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6.2 4.8 9 10 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <CopyIcon size={16} />
        )
      ) : copied ? (
        <CopiedIcon />
      ) : (
        <CopyIcon />
      )}
    </button>
  );
}

export interface CreditBannerProps extends DivProps {
  title: ReactNode;
  subtitle?: ReactNode;
  part?: string;
  children?: ReactNode;
}

export const CreditBanner = forwardRef<HTMLDivElement, CreditBannerProps>(function CreditBanner(
  { title, subtitle, part = "credit-banner", children, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div role="status" {...rest} ref={ref} {...viewProps(part, "credit-banner", { className, style, unstyled }, off)}>
      <span className={c("credit-icon")}>
        <CreditCheckIcon />
      </span>
      <div className={c("credit-body")}>
        <div className={c("credit-title")}>{title}</div>
        {subtitle && <div className={c("credit-subtitle")}>{subtitle}</div>}
        {children}
      </div>
    </div>
  );
});

export interface CryptoAddressCardProps extends DivProps {
  address: string | null;
  loading?: boolean;
  label?: ReactNode;
  overlay?: ReactNode;
  badge?: ReactNode;
  warning?: ReactNode;
  highFee?: ReactNode;
  error?: ReactNode;
  details?: ReactNode;
  showQr?: boolean;
  part?: string;
  children?: ReactNode;
}

export const CryptoAddressCard = forwardRef<HTMLDivElement, CryptoAddressCardProps>(function CryptoAddressCard(
  {
    address,
    loading = false,
    label,
    overlay,
    badge,
    warning,
    highFee,
    error,
    details,
    showQr = true,
    part = "crypto-address-card",
    children,
    className,
    style,
    unstyled,
    ...rest
  },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  const ready = !loading && !!address;
  const addressLabel = label ?? ui.t("address.yours");
  return (
    <div {...rest} ref={ref} {...viewProps(part, "crypto-address-card", { className, style, unstyled }, off)}>
      {error && <ErrorBox unstyled={unstyled}>{error}</ErrorBox>}
      {showQr && (
        <div className={c("qr-wrapper")}>
          {ready ? (
            <QrCode key={address} value={address} overlay={overlay} badge={badge} unstyled={unstyled} />
          ) : (
            <div className={c("qr-skeleton")}>
              <div className={c("qr-skeleton-box")}>
                <Skeleton height="100%" radius={5} unstyled={unstyled} />
              </div>
            </div>
          )}
        </div>
      )}
      <div>
        <div className={c("address-label")} data-binodex-pay="label">
          {addressLabel}
        </div>
        <div className={c("address-field")}>
          {ready ? (
            <div key={address} className={c("address-row")} data-binodex-pay="address-row">
              <span
                className={cx(c("address-text"), SENSITIVE_CLASS)}
                data-binodex-pay="address"
                dir="ltr"
                style={LTR_ISOLATE}
                {...SENSITIVE_PROPS}
              >
                {address}
              </span>
              <CopyButton value={address} label={typeof addressLabel === "string" ? addressLabel : undefined} unstyled={unstyled} />
            </div>
          ) : (
            <Skeleton height={48} radius={5} unstyled={unstyled} />
          )}
        </div>
      </div>
      {warning && (
        <div className={c("address-warning")} data-binodex-pay="warning">
          <span className={c("address-warning-icon")}>
            <WarningIcon />
          </span>
          <span>{warning}</span>
        </div>
      )}
      {highFee && (
        <div className={c("high-fee")} data-binodex-pay="warning" data-variant="fee">
          {"\u203c\ufe0f "}
          {highFee}
        </div>
      )}
      {details}
      {children}
    </div>
  );
});

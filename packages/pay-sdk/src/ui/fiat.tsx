"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { useClasses } from "./context.js";
import { CopyButton, LTR_ISOLATE } from "./crypto.js";
import { SubmitButton } from "./fields.js";
import { CheckIcon, GeoIcon, PaperclipIcon } from "./icons.js";
import { SENSITIVE_PROPS, partProps, viewProps, type PartStyleProps } from "./part.js";
import type { RequisiteRow, StatusTone } from "./types.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children" | "title" | "onSubmit"> &
  PartStyleProps;

export interface RequisitesProps extends DivProps {
  rows: RequisiteRow[];
  note?: ReactNode;
  testId?: string;
  part?: string;
  sensitive?: boolean;
  children?: ReactNode;
}

export const Requisites = forwardRef<HTMLDivElement, RequisitesProps>(function Requisites(
  { rows, note, testId, part = "requisites-block", sensitive = true, children, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div
      data-testid={testId}
      {...rest}
      ref={ref}
      {...viewProps(part, "requisites-block", { className, style, unstyled }, off, { sensitive })}
      {...(sensitive ? SENSITIVE_PROPS : {})}
    >
      {rows.map((row) => {
        const ltr = row.mono || row.accent;
        return (
          <div key={row.key ?? row.label} className={c("requisite-row")} data-binodex-pay="requisites-row" data-kind={row.key} {...row.attrs}>
            <span className={c("requisite-text")}>
              <span className={c("requisite-label")}>{row.label}</span>
              <span
                className={c("requisite-value", row.mono && "requisite-mono", row.accent && "requisite-accent")}
                data-binodex-pay="requisite-value"
                dir={ltr ? "ltr" : undefined}
                style={ltr ? LTR_ISOLATE : undefined}
              >
                {row.value}
              </span>
            </span>
            {row.copy !== undefined && <CopyButton value={row.copy} label={row.label} variant="requisite" unstyled={unstyled} />}
          </div>
        );
      })}
      {note && (
        <div className={c("requisites-note")} role="note" data-binodex-pay="hint">
          {note}
        </div>
      )}
      {children}
    </div>
  );
});

export const PayingPanel = forwardRef<HTMLDivElement, DivProps & { part?: string; children?: ReactNode }>(function PayingPanel(
  { part = "paying-panel", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...viewProps(part, "paying-panel", { className, style, unstyled }, off)}>
      {children}
    </div>
  );
});

export const StatusPill = forwardRef<HTMLDivElement, DivProps & { tone: StatusTone; label: ReactNode; part?: string }>(
  function StatusPill({ tone, label, part = "status-pill", className, style, unstyled, ...rest }, ref) {
    const { c, off } = useClasses(unstyled);
    return (
      <div {...rest} ref={ref} {...viewProps(part, "status-pill", { className, style, unstyled }, off)} data-tone={tone}>
        <span className={c("status-dot")} />
        <span data-binodex-pay="status-label">{label}</span>
      </div>
    );
  },
);

export const PanelAmount = ({ children, unstyled }: { children?: ReactNode; unstyled?: boolean }) => {
  const { c } = useClasses(unstyled);
  return (
    <div className={c("amount-big")} data-binodex-pay="status-amount" dir="ltr" style={LTR_ISOLATE}>
      {children}
    </div>
  );
};

export const PanelHint = ({ children, unstyled }: { children?: ReactNode; unstyled?: boolean }) => {
  const { c } = useClasses(unstyled);
  return (
    <div className={c("pay-hint")} data-binodex-pay="status-hint">
      {children}
    </div>
  );
};

export const ExpiresLine = forwardRef<HTMLDivElement, DivProps & { part?: string; children?: ReactNode }>(function ExpiresLine(
  { part = "expires", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...viewProps(part, "expires", { className, style, unstyled }, off)}>
      {children}
    </div>
  );
});

export const PayActions = ({ children, unstyled }: { children?: ReactNode; unstyled?: boolean }) => {
  const { c } = useClasses(unstyled);
  return (
    <div className={c("pay-actions")} data-binodex-pay="actions">
      {children}
    </div>
  );
};

export interface StatusPanelProps extends DivProps {
  tone: StatusTone;
  statusLabel: ReactNode;
  amountLabel: ReactNode;
  hint?: ReactNode;
  expiresLabel?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export const StatusPanel = forwardRef<HTMLDivElement, StatusPanelProps>(function StatusPanel(
  { tone, statusLabel, amountLabel, hint, expiresLabel, actions, children, unstyled, ...rest },
  ref,
) {
  return (
    <PayingPanel {...rest} ref={ref} unstyled={unstyled}>
      <StatusPill tone={tone} label={statusLabel} unstyled={unstyled} />
      <PanelAmount unstyled={unstyled}>{amountLabel}</PanelAmount>
      {hint && <PanelHint unstyled={unstyled}>{hint}</PanelHint>}
      {children}
      {expiresLabel && <ExpiresLine unstyled={unstyled}>{expiresLabel}</ExpiresLine>}
      {actions && <PayActions unstyled={unstyled}>{actions}</PayActions>}
    </PayingPanel>
  );
});

export const ReceiptBlock = forwardRef<HTMLDivElement, DivProps & { part?: string; children?: ReactNode }>(function ReceiptBlock(
  { part = "receipt", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...viewProps(part, "receipt-block", { className, style, unstyled }, off)}>
      {children}
    </div>
  );
});

export const QrImageCard = ({
  children,
  variant = "card",
  unstyled,
}: {
  children?: ReactNode;
  variant?: "card" | "box";
  unstyled?: boolean;
}) => {
  const { c } = useClasses(unstyled);
  return (
    <div className={c("qr-card")} data-binodex-pay="qr-card" data-variant={variant}>
      {children}
    </div>
  );
};

type FormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "className" | "style" | "children"> & PartStyleProps;

export const RailForm = forwardRef<
  HTMLFormElement,
  FormProps & { as?: "form" | "div"; variant?: "default" | "stack"; part?: string; children?: ReactNode }
>(function RailForm({ as = "form", variant = "default", part = "rail-form", className, style, unstyled, children, ...rest }, ref) {
  const { off } = useClasses(unstyled);
  const props = {
    ...viewProps(part, "rail-form", { className, style, unstyled }, off),
    "data-variant": variant,
  };
  if (as === "div") {
    return (
      <div ref={ref as unknown as Ref<HTMLDivElement>} {...props}>
        {children}
      </div>
    );
  }
  return (
    <form {...rest} ref={ref} {...props}>
      {children}
    </form>
  );
});

export const PdfReceiptWarning = forwardRef<HTMLDivElement, DivProps>(function PdfReceiptWarning(
  { className, style, unstyled, ...rest },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  return (
    <div role="note" {...rest} ref={ref} {...partProps("receipt-warning", { className, style, unstyled }, off)}>
      <span className={c("receipt-warning-title")}>{ui.t("receipt.pdfTitle")}</span>
      <ul className={c("receipt-warning-list")}>
        <li>{ui.t("receipt.pdfCredit")}</li>
        <li>{ui.t("receipt.pdfFormat")}</li>
        <li>{ui.t("receipt.pdfOnce")}</li>
      </ul>
    </div>
  );
});

export const ReceiptAttached = forwardRef<HTMLDivElement, DivProps & { title?: ReactNode; body?: ReactNode }>(
  function ReceiptAttached({ title, body, className, style, unstyled, ...rest }, ref) {
    const { ui, c, off } = useClasses(unstyled);
    return (
      <div role="status" {...rest} ref={ref} {...partProps("receipt-attached", { className, style, unstyled }, off)}>
        <span className={c("receipt-attached-mark")} aria-hidden="true">
          <CheckIcon size={13} />
        </span>
        <span>
          <span className={c("receipt-attached-title")}>{title ?? ui.t("receipt.successTitle")}</span>
          {body ?? ui.t("receipt.successBody")}
        </span>
      </div>
    );
  },
);

const RECEIPT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic";
const RECEIPT_ACCEPT_PDF = "application/pdf";
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

export const isPdfFile = (file: { type: string; name: string }): boolean =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

export interface ReceiptFormProps extends DivProps {
  onSubmit: (file: File) => void | Promise<void>;
  file?: File | null;
  onFileChange?: (file: File | null | undefined) => void;
  onPreview?: () => void;
  pdfOnly?: boolean;
  sending?: boolean;
  error?: ReactNode;
  maxBytes?: number;
  accept?: string;
  inputRef?: Ref<HTMLInputElement>;
}

export const ReceiptForm = forwardRef<HTMLDivElement, ReceiptFormProps>(function ReceiptForm(
  {
    onSubmit,
    file: fileProp,
    onFileChange,
    onPreview,
    pdfOnly = false,
    sending = false,
    error,
    maxBytes = RECEIPT_MAX_BYTES,
    accept,
    inputRef,
    className,
    style,
    unstyled,
    ...rest
  },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  const [ownFile, setFile] = useState<File | null>(null);
  const file = onFileChange ? (fileProp ?? null) : ownFile;
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const isImage = !!file && file.type.startsWith("image/");

  useEffect(() => {
    if (!file || !file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (next: File | undefined | null) => {
    if (onFileChange) {
      onFileChange(next);
      return;
    }
    setLocalError(null);
    if (!next) return;
    if (next.size > maxBytes) {
      setLocalError(ui.t("receipt.tooLarge"));
      return;
    }
    if (pdfOnly && !isPdfFile(next)) {
      setLocalError(ui.t("receipt.pdfOnlyError"));
      return;
    }
    setFile(next);
  };

  const shownError = localError ?? error;
  return (
    <div {...rest} ref={ref} {...partProps("receipt-form", { className, style, unstyled }, off)}>
      <div
        className={c("drop", dragOver && "drop-active", file && "drop-filled")}
        data-binodex-pay="receipt-drop"
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          acceptFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={(element) => {
            input.current = element;
            if (typeof inputRef === "function") inputRef(element);
            else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = element;
          }}
          type="file"
          accept={pdfOnly ? RECEIPT_ACCEPT_PDF : (accept ?? RECEIPT_ACCEPT)}
          className={c("file-input")}
          hidden={off ? true : undefined}
          aria-label={ui.t("receipt.label")}
          disabled={sending}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {file && isImage && previewUrl && onPreview ? (
          <button
            type="button"
            className={c("preview-chip")}
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
          >
            <img className={c("preview-thumb")} src={previewUrl} alt="" />
            <span className={c("preview-meta")}>
              <span className={c("file-name")}>{file.name}</span>
              <span className={c("preview-hint")}>{ui.t("receipt.viewHint")}</span>
            </span>
          </button>
        ) : file && isImage && previewUrl ? (
          <span className={c("preview-chip")} onClick={(event) => event.stopPropagation()}>
            <img className={c("preview-thumb")} src={previewUrl} alt="" />
            <span className={c("preview-meta")}>
              <span className={c("file-name")}>{file.name}</span>
            </span>
          </span>
        ) : file ? (
          <span className={c("file-chip")}>
            <span className={c("file-icon")} aria-hidden="true">
              <PaperclipIcon />
            </span>
            <span className={c("file-name")}>{file.name}</span>
            <span className={c("file-size")}>{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
          </span>
        ) : (
          <>
            <span className={c("drop-icon")} aria-hidden="true">
              {"⇪"}
            </span>
            <span className={c("drop-text")}>{ui.t("receipt.drop")}</span>
            <span className={c("drop-hint")}>{ui.t(pdfOnly ? "receipt.formatsPdf" : "receipt.formats")}</span>
          </>
        )}
      </div>
      {shownError && (
        <div className={c("receipt-error")} role="alert" data-binodex-pay="field-error">
          {shownError}
        </div>
      )}
      <SubmitButton
        variant="receipt"
        part="receipt-submit"
        disabled={!file || sending}
        pending={sending}
        onClick={() => {
          if (file && !sending) void onSubmit(file);
        }}
        unstyled={unstyled}
      >
        {ui.t(sending ? "receipt.sending" : "receipt.submit")}
      </SubmitButton>
    </div>
  );
});

export type PollHealth = "ok" | "retrying" | "unreachable";

export const PollNotice = forwardRef<HTMLParagraphElement, PartStyleProps & { health: PollHealth }>(function PollNotice(
  { health, className, style, unstyled },
  ref,
) {
  const { ui, off } = useClasses(unstyled);
  if (health === "ok") return null;
  return (
    <p ref={ref} role="status" {...partProps("poll-notice", { className, style, unstyled }, off)} data-health={health}>
      {ui.t(health === "retrying" ? "poll.reconnecting" : "poll.unavailable")}
    </p>
  );
});

export const GeoBlock = forwardRef<HTMLDivElement, DivProps & { onClose?: () => void }>(function GeoBlock(
  { onClose, className, style, unstyled, ...rest },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("geo-block", { className, style, unstyled }, off)}>
      <div className={c("geo-icon")} aria-hidden="true">
        <GeoIcon />
      </div>
      <h3 className={c("geo-title")}>{ui.t("geo.title")}</h3>
      <p className={c("geo-text")}>{ui.t("geo.text")}</p>
      <p className={c("geo-note")}>{ui.t("geo.note")}</p>
      {onClose && (
        <button type="button" className={c("geo-button")} onClick={onClose}>
          {ui.t("geo.ok")}
        </button>
      )}
    </div>
  );
});

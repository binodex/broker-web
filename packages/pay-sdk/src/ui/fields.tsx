"use client";

import {
  forwardRef,
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useClasses } from "./context.js";
import { partProps, viewProps, type PartStyleProps } from "./part.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> & PartStyleProps;

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "style" | "value" | "onChange" | "children" | "size"
>;

export type FieldVariant = "pay" | "withdraw";

const describedBy = (id: string, error: unknown, hint: unknown) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

interface BaseFieldProps extends PartStyleProps {
  id?: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
  part?: string;
  variant?: FieldVariant;
  inputProps?: InputProps;
}

function FieldMessages({
  inputId,
  hint,
  error,
  variant,
  unstyled,
}: {
  inputId: string;
  hint?: ReactNode;
  error?: ReactNode;
  variant: FieldVariant;
  unstyled?: boolean;
}) {
  const { c } = useClasses(unstyled);
  if (error) {
    return (
      <div className={c("field-error")} data-binodex-pay="field-error" id={`${inputId}-error`} role="alert">
        {error}
      </div>
    );
  }
  if (hint) {
    return (
      <div className={c(variant === "withdraw" ? "code-hint" : "hint")} data-binodex-pay="hint" id={`${inputId}-hint`}>
        {hint}
      </div>
    );
  }
  return null;
}

export interface AmountFieldProps extends BaseFieldProps {
  suffix?: ReactNode;
  onMax?: () => void;
  maxLabel?: ReactNode;
  footer?: [ReactNode, ReactNode];
  sanitize?: boolean;
}

export const AmountField = forwardRef<HTMLInputElement, AmountFieldProps>(function AmountField(
  {
    id,
    label,
    value,
    onChange,
    hint,
    error,
    disabled = false,
    placeholder,
    part = "amount-field",
    variant = "pay",
    suffix,
    onMax,
    maxLabel,
    footer,
    sanitize = true,
    inputProps,
    className,
    style,
    unstyled,
  },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  const generated = useId();
  const inputId = id ?? `bp-amount-${generated}`;
  const withdraw = variant === "withdraw";
  const inputStyle: CSSProperties | undefined = !withdraw && !off ? { paddingRight: 56 } : undefined;
  return (
    <div
      {...viewProps(part, "amount-field", { className, style, unstyled }, off)}
      data-variant={variant}
      data-invalid={error ? "" : undefined}
    >
      <label className={c("field-label")} htmlFor={inputId} data-binodex-pay="label">
        {label}
      </label>
      <div className={c("amount-row")} data-binodex-pay="control">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder ?? (withdraw ? "$0.00" : "0")}
          maxLength={withdraw ? 12 : undefined}
          {...inputProps}
          ref={ref}
          id={inputId}
          className={c("input", withdraw && "input-raised", error ? "input-error" : null)}
          style={inputStyle}
          value={value}
          disabled={disabled || inputProps?.disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, hint)}
          onChange={(event) => onChange(sanitize ? event.target.value.replace(/[^\d.,]/g, "") : event.target.value)}
        />
        {withdraw ? (
          <div className={c("amount-right")}>
            {suffix !== undefined && (
              <span className={c("amount-unit")} data-binodex-pay="amount-currency">
                {suffix}
              </span>
            )}
            {onMax && (
              <button
                type="button"
                className={c("max-button")}
                data-binodex-pay="max"
                onClick={onMax}
                disabled={disabled}
              >
                {maxLabel ?? ui.t("withdraw.max")}
              </button>
            )}
          </div>
        ) : (
          suffix !== undefined && (
            <span className={c("amount-suffix")} data-binodex-pay="amount-currency">
              {suffix}
            </span>
          )
        )}
      </div>
      {footer && (
        <div className={c("amount-footer")} data-binodex-pay="amount-footer">
          <span>{footer[0]}</span>
          <span>{footer[1]}</span>
        </div>
      )}
      <FieldMessages inputId={inputId} hint={hint} error={error} variant={variant} unstyled={unstyled} />
    </div>
  );
});

export interface TextFieldProps extends BaseFieldProps {
  type?: string;
  code?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    id,
    label,
    value,
    onChange,
    hint,
    error,
    disabled = false,
    placeholder,
    part = "text-field",
    variant = "withdraw",
    type = "text",
    code = false,
    inputProps,
    className,
    style,
    unstyled,
  },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  const generated = useId();
  const inputId = id ?? `bp-field-${generated}`;
  return (
    <div
      {...viewProps(part, "text-field", { className, style, unstyled }, off)}
      data-variant={variant}
      data-invalid={error ? "" : undefined}
    >
      <label className={c("field-label")} htmlFor={inputId} data-binodex-pay="label">
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        {...inputProps}
        ref={ref}
        id={inputId}
        className={c("input", variant === "withdraw" && "input-raised", code && "input-code", error ? "input-error" : null)}
        value={value}
        disabled={disabled || inputProps?.disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldMessages inputId={inputId} hint={hint} error={error} variant={variant} unstyled={unstyled} />
    </div>
  );
});

export interface TwoFactorFieldProps extends Omit<TextFieldProps, "code" | "type"> {}

export const TwoFactorField = forwardRef<HTMLInputElement, TwoFactorFieldProps>(function TwoFactorField(
  { label, hint, placeholder = "000000", part = "two-factor-field", inputProps, onChange, ...rest },
  ref,
) {
  const { ui } = useClasses(rest.unstyled);
  return (
    <TextField
      {...rest}
      ref={ref}
      part={part}
      code
      label={label ?? ui.t("withdraw.twoFactor")}
      hint={hint ?? ui.t("withdraw.twoFactorHint")}
      placeholder={placeholder}
      onChange={(value) => onChange(value.replace(/\D/g, "").slice(0, 6))}
      inputProps={{ inputMode: "numeric", autoComplete: "one-time-code", pattern: "[0-9]*", maxLength: 6, ...inputProps }}
    />
  );
});

export type ButtonVariant = "pay" | "withdraw" | "receipt" | "trade";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> &
  PartStyleProps & { variant?: ButtonVariant; part?: string; pending?: boolean };

export const SubmitButton = forwardRef<HTMLButtonElement, ButtonProps>(function SubmitButton(
  { variant = "pay", part = "submit", pending = false, type = "button", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <button
      type={type}
      aria-busy={pending || undefined}
      {...rest}
      ref={ref}
      {...viewProps(part, "submit", { className, style, unstyled }, off)}
      data-variant={variant}
      data-pending={pending ? "" : undefined}
    >
      {children}
    </button>
  );
});

type AnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "style"> &
  PartStyleProps & { variant?: ButtonVariant; part?: string };

export const SubmitLink = forwardRef<HTMLAnchorElement, AnchorProps>(function SubmitLink(
  { variant = "pay", part = "submit-link", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      {...rest}
      ref={ref}
      {...viewProps(part, "submit", { className, style, unstyled }, off)}
      data-variant={variant}
    >
      {children}
    </a>
  );
});

export const RetryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "variant" | "pending">>(function RetryButton(
  { part = "retry", type = "button", className, style, unstyled, children, ...rest },
  ref,
) {
  const { ui, off } = useClasses(unstyled);
  return (
    <button type={type} {...rest} ref={ref} {...viewProps(part, "max-button", { className, style, unstyled }, off)}>
      {children ?? ui.t("withdraw.retry")}
    </button>
  );
});

export const LinkButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "variant" | "pending">>(function LinkButton(
  { part = "link-button", type = "button", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <button type={type} {...rest} ref={ref} {...viewProps(part, "link-button", { className, style, unstyled }, off)}>
      {children}
    </button>
  );
});

export type ErrorBoxVariant = "deposit" | "rail" | "withdraw";

export const ErrorBox = forwardRef<HTMLDivElement, DivProps & { variant?: ErrorBoxVariant; part?: string; children?: ReactNode }>(
  function ErrorBox({ variant = "deposit", part = "error-box", className, style, unstyled, children, ...rest }, ref) {
    const { off } = useClasses(unstyled);
    return (
      <div role="alert" {...rest} ref={ref} {...viewProps(part, "error-box", { className, style, unstyled }, off)} data-variant={variant}>
        {children}
      </div>
    );
  },
);

export interface SkeletonProps extends PartStyleProps {
  width?: number | string;
  height: number | string;
  radius?: number | string;
}

const length = (value: number | string) => (typeof value === "number" ? `${value}px` : value);

export const Skeleton = ({ width = "100%", height, radius = 5, className, style, unstyled }: SkeletonProps) => {
  const { off } = useClasses(unstyled);
  return (
    <span
      aria-hidden="true"
      {...partProps("skeleton", { className, style: { width: length(width), height: length(height), borderRadius: radius === "circle" ? "50%" : length(radius), ...style }, unstyled }, off)}
    />
  );
};

export const Loader = forwardRef<HTMLDivElement, DivProps & { label?: ReactNode; part?: string }>(function Loader(
  { label, part = "loader", className, style, unstyled, ...rest },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  return (
    <div role="status" aria-live="polite" {...rest} ref={ref} {...viewProps(part, "loader", { className, style, unstyled }, off)}>
      {!off && <span className={c("spinner")} aria-hidden="true" />}
      <span>{label ?? ui.t("common.loading")}</span>
    </div>
  );
});

export const Hint = forwardRef<HTMLDivElement, DivProps & { part?: string; children?: ReactNode }>(function Hint(
  { part = "hint", className, style, unstyled, children, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...viewProps(part, "hint", { className, style, unstyled }, off)}>
      {children}
    </div>
  );
});

export const Notice = forwardRef<HTMLDivElement, DivProps & { variant?: "hint" | "receipt" | "warning" | "info"; part?: string; children?: ReactNode }>(
  function Notice({ variant = "hint", part = "notice", className, style, unstyled, children, ...rest }, ref) {
    const { off } = useClasses(unstyled);
    return (
      <div role="note" {...rest} ref={ref} {...viewProps(part, "notice", { className, style, unstyled }, off)} data-variant={variant}>
        {children}
      </div>
    );
  },
);

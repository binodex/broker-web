"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { useClasses } from "./context.js";
import { BackIcon, CloseIcon } from "./icons.js";
import { partProps, type PartStyleProps } from "./part.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children" | "title"> &
  PartStyleProps;

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & PartStyleProps;

export const CloseButton = forwardRef<HTMLButtonElement, ButtonProps & { label?: string }>(function CloseButton(
  { label, type = "button", className, style, unstyled, children, ...rest },
  ref,
) {
  const { ui, off } = useClasses(unstyled);
  return (
    <button
      type={type}
      aria-label={label ?? ui.t("common.close")}
      {...rest}
      ref={ref}
      {...partProps("close", { className, style, unstyled }, off)}
    >
      {children ?? <CloseIcon />}
    </button>
  );
});

export const BackButton = forwardRef<HTMLButtonElement, ButtonProps & { label?: string }>(function BackButton(
  { label, type = "button", className, style, unstyled, children, ...rest },
  ref,
) {
  const { ui, off } = useClasses(unstyled);
  return (
    <button
      type={type}
      aria-label={label ?? ui.t("common.back")}
      {...rest}
      ref={ref}
      {...partProps("back", { className, style, unstyled }, off)}
    >
      {children ?? <BackIcon />}
    </button>
  );
});

export interface PayHeaderProps extends DivProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: ReactNode;
  close?: ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  logo?: ReactNode;
  variant?: "deposit" | "withdraw";
}

export const PayHeader = forwardRef<HTMLDivElement, PayHeaderProps>(function PayHeader(
  { title, subtitle, back, close, onBack, onClose, logo, variant = "deposit", className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  const backNode = back ?? (onBack ? <BackButton onClick={onBack} unstyled={unstyled} /> : null);
  const closeNode = close ?? (onClose ? <CloseButton onClick={onClose} unstyled={unstyled} /> : null);
  return (
    <div {...rest} ref={ref} {...partProps("header", { className, style, unstyled }, off)} data-variant={variant}>
      {closeNode}
      <div className={c("header-left")}>
        {backNode}
        <div className={c("header-text")}>
          {title !== undefined && title !== null && title !== "" && (
            <h2 className={c("header-title")} data-binodex-pay="title">
              {title}
            </h2>
          )}
          {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
            <p className={c("header-subtitle")} data-binodex-pay="subtitle">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {logo && <div className={c("header-right")}>{logo}</div>}
    </div>
  );
});

export interface PayCardProps extends PayHeaderProps {
  embedded?: boolean;
  header?: ReactNode;
  children?: ReactNode;
}

export const PayCard = forwardRef<HTMLDivElement, PayCardProps>(function PayCard(
  {
    title,
    subtitle,
    back,
    close,
    onBack,
    onClose,
    logo,
    variant = "deposit",
    embedded = false,
    header,
    children,
    className,
    style,
    unstyled,
    ...rest
  },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  const showHeader =
    header !== undefined ||
    title !== undefined ||
    subtitle !== undefined ||
    back !== undefined ||
    close !== undefined ||
    !!onBack ||
    !!onClose;
  return (
    <div
      {...rest}
      ref={ref}
      {...partProps("card", { className, style, unstyled }, off)}
      data-embedded={embedded ? "" : undefined}
      data-variant={variant}
    >
      <div className={c("card-scroll")}>
        {header ??
          (showHeader && (
            <PayHeader
              title={title}
              subtitle={subtitle}
              back={back}
              close={close}
              onBack={onBack}
              onClose={onClose}
              logo={logo}
              variant={variant}
              unstyled={unstyled}
            />
          ))}
        {children}
      </div>
    </div>
  );
});

export const BrandLogo = forwardRef<HTMLImageElement, PartStyleProps & { src: string; alt?: string }>(function BrandLogo(
  { src, alt = "", className, style, unstyled },
  ref,
) {
  const { off } = useClasses(unstyled);
  return <img ref={ref} src={src} alt={alt} referrerPolicy="no-referrer" {...partProps("brand", { className, style, unstyled }, off)} />;
});

export const PayBody = forwardRef<HTMLDivElement, DivProps & { children?: ReactNode; variant?: "deposit" | "withdraw" | "address" | "paying" }>(
  function PayBody({ variant = "deposit", className, style, unstyled, children, ...rest }, ref) {
    const { off } = useClasses(unstyled);
    return (
      <div {...rest} ref={ref} {...partProps("body", { className, style, unstyled }, off)} data-variant={variant}>
        {children}
      </div>
    );
  },
);

export const Divider = ({ className, style, unstyled }: PartStyleProps) => {
  const { off } = useClasses(unstyled);
  return <div aria-hidden="true" {...partProps("divider", { className, style, unstyled }, off)} />;
};

import type { CSSProperties, Ref } from "react";

export interface PartStyleProps {
  className?: string;
  style?: CSSProperties;
  unstyled?: boolean;
}

export type DataAttributes = { [key: `data-${string}`]: string | undefined };

export const SENSITIVE_PROPS = {
  "data-hj-suppress": "",
  "data-sentry-mask": "",
  "data-private": "",
} as const;

export const SENSITIVE_CLASS = "ym-hide-content";

export const cx = (...names: (string | false | null | undefined)[]): string | undefined => {
  const value = names.filter(Boolean).join(" ");
  return value || undefined;
};

export const partProps = (
  part: string,
  props: PartStyleProps,
  rootUnstyled: boolean,
  options: { sensitive?: boolean } = {},
): { "data-binodex-pay": string; className: string | undefined; style: CSSProperties | undefined } => {
  const unstyled = props.unstyled ?? rootUnstyled;
  return {
    "data-binodex-pay": part,
    className: cx(!unstyled && `bp-${part}`, options.sensitive && SENSITIVE_CLASS, props.className),
    style: props.style,
  };
};

export const viewProps = (
  part: string,
  base: string,
  props: PartStyleProps,
  rootUnstyled: boolean,
  options: { sensitive?: boolean } = {},
): { "data-binodex-pay": string; className: string | undefined; style: CSSProperties | undefined } => {
  const unstyled = props.unstyled ?? rootUnstyled;
  return {
    "data-binodex-pay": part,
    className: cx(
      !unstyled && `bp-${base}`,
      !unstyled && part !== base && `bp-${part}`,
      options.sensitive && SENSITIVE_CLASS,
      props.className,
    ),
    style: props.style,
  };
};

export const classes =
  (unstyled: boolean) =>
  (...names: (string | false | null | undefined)[]): string | undefined =>
    unstyled ? undefined : cx(...names.map((name) => (name ? `bp-${name}` : name)));

export const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
};

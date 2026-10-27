"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  intlLocale,
  isRtlLocale,
  resolveLocale,
  translatorFrom,
  type MessageKey,
  type PayLocale,
  type Translate,
} from "../core/i18n/base.js";
import { formatDecimal, formatMoney, formatPercentValue, formatUsd } from "../core/money.js";
import { classes, cx } from "./part.js";
import { resolveBaseUrl } from "./urls.js";

export const DEFAULT_ASSET_BASE_URL = "https://binodex.app";

export interface PayUiFormatters {
  money: (value: number | string | null | undefined, currency: string) => string;
  usd: (value: number | string | null | undefined) => string;
  percent: (value: number | string | null | undefined) => string;
  decimal: (value: number | string | null | undefined, maximumFractionDigits?: number) => string;
  balance: (value: number | string | null | undefined) => string;
}

export interface PayUiValue {
  t: Translate;
  locale: PayLocale;
  intl: string;
  dir: "ltr" | "rtl";
  formatters: PayUiFormatters;
  assetBaseUrl: string;
  unstyled: boolean;
}

const toNumber = (value: number | string | null | undefined): number =>
  value === null || value === undefined ? Number.NaN : Number(value);

export const balanceText = (value: number | string | null | undefined): string => {
  const num = toNumber(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "—";
};

export const createFormatters = (t: Translate, intl: string): PayUiFormatters => ({
  money: (value, currency) => formatMoney(value, currency, intl),
  usd: (value) => formatUsd(value),
  percent: (value) => t("common.percent", { value: formatPercentValue(value, intl) }),
  decimal: (value, maximumFractionDigits = 2) => formatDecimal(value, intl, { maximumFractionDigits }),
  balance: balanceText,
});

const defaultT = translatorFrom({});

const DEFAULT_VALUE: PayUiValue = {
  t: defaultT,
  locale: "en",
  intl: "en-US",
  dir: "ltr",
  formatters: createFormatters(defaultT, "en-US"),
  assetBaseUrl: DEFAULT_ASSET_BASE_URL,
  unstyled: false,
};

const PayUiContext = createContext<PayUiValue>(DEFAULT_VALUE);

export const usePayUi = (): PayUiValue => useContext(PayUiContext);

export const useClasses = (unstyled?: boolean) => {
  const ui = usePayUi();
  const off = unstyled ?? ui.unstyled;
  return { ui, off, c: classes(off) };
};

export interface PayUiProviderProps {
  locale?: string;
  messages?: Partial<Record<MessageKey, string>>;
  t?: Translate;
  intl?: string;
  dir?: "ltr" | "rtl";
  formatters?: Partial<PayUiFormatters>;
  assetBaseUrl?: string;
  unstyled?: boolean;
  children?: ReactNode;
}

export const usePayUiValue = ({
  locale: localeProp,
  messages,
  t: tProp,
  intl: intlProp,
  dir: dirProp,
  formatters,
  assetBaseUrl,
  unstyled = false,
}: Omit<PayUiProviderProps, "children">): PayUiValue => {
  const locale = useMemo(() => resolveLocale(localeProp ?? "en"), [localeProp]);
  const messagesKey = JSON.stringify(messages ?? {});
  const t = useMemo<Translate>(
    () => tProp ?? translatorFrom({}, JSON.parse(messagesKey) as Partial<Record<MessageKey, string>>),
    [tProp, messagesKey],
  );
  const intl = intlProp ?? intlLocale(locale);
  return useMemo(
    () => ({
      t,
      locale,
      intl,
      dir: dirProp ?? (isRtlLocale(locale) ? "rtl" : "ltr"),
      formatters: { ...createFormatters(t, intl), ...formatters },
      assetBaseUrl: resolveBaseUrl("assetBaseUrl", assetBaseUrl, DEFAULT_ASSET_BASE_URL),
      unstyled,
    }),
    [t, locale, intl, dirProp, formatters, assetBaseUrl, unstyled],
  );
};

export function PayUiProvider({ children, ...options }: PayUiProviderProps) {
  const value = usePayUiValue(options);
  return <PayUiContext.Provider value={value}>{children}</PayUiContext.Provider>;
}

export function PayUiValueProvider({ value, children }: { value: PayUiValue; children?: ReactNode }) {
  return <PayUiContext.Provider value={value}>{children}</PayUiContext.Provider>;
}

export type PayUiTheme = "light" | "dark" | "auto";
export type PayUiSkin = "classic" | "black";

export interface PayUiRootProps
  extends Omit<PayUiProviderProps, "children">,
    Omit<HTMLAttributes<HTMLDivElement>, "dir" | "lang"> {
  theme?: PayUiTheme;
  skin?: PayUiSkin;
}

export const PayUiRoot = forwardRef<HTMLDivElement, PayUiRootProps>(function PayUiRoot(
  {
    locale,
    messages,
    t,
    intl,
    dir,
    formatters,
    assetBaseUrl,
    unstyled = false,
    theme = "auto",
    skin = "classic",
    className,
    children,
    ...rest
  },
  ref,
) {
  const value = usePayUiValue({ locale, messages, t, intl, dir, formatters, assetBaseUrl, unstyled });
  return (
    <div
      {...rest}
      ref={ref}
      className={cx(!unstyled && "bp-root", className)}
      data-binodex-pay="root"
      data-theme={theme}
      data-skin={skin}
      dir={value.dir}
      lang={value.intl}
    >
      <PayUiContext.Provider value={value}>{children}</PayUiContext.Provider>
    </div>
  );
});

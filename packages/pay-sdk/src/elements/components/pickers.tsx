"use client";

import { forwardRef, useEffect, type HTMLAttributes, type ReactNode } from "react";
import type { DepositFlowActions, DepositFlowState } from "../../core/flows/deposit.js";
import { methodCopy, type PayLocale } from "../../core/i18n/index.js";
import { formatAmount, formatPercentValue } from "../../core/money.js";
import { formatMinLimit } from "../../core/rules/limits.js";
import type { CryptoMethod, FiatMethod, FiatRail, OnrampMethod, PayMethod, PayMethods } from "../../core/types.js";
import * as ui from "../../ui/index.js";
import { chainName, orderBy } from "../chains.js";
import { useStoreValue, type EntryTab, type PickerState } from "../context.js";
import { partProps, type PartStyleProps } from "../part.js";
import { railKey, useFlowState } from "./basic.js";

type ListProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> &
  PartStyleProps;

export type MethodOption =
  | { kind: "crypto"; id: "crypto"; methods: CryptoMethod[] }
  | FiatMethod
  | OnrampMethod;

export interface MethodPickerProps extends ListProps {
  filter?: (method: PayMethod) => boolean;
  renderItem?: (option: MethodOption, state: { selected: boolean; select: () => void }) => ReactNode;
}

const RAIL_COUNTRY: Record<FiatRail, string> = { ru: "RU", kz: "KZ", ua: "UA", in: "IN" };

const LOCALE_COUNTRY: Partial<Record<PayLocale, string>> = {
  ru: "RU",
  ua: "UA",
  tr: "TR",
  hi: "IN",
  ar: "AE",
  es: "ES",
  fr: "FR",
  de: "DE",
  cs: "CZ",
  it: "IT",
  en: "US",
};

const defaultRailMethod = (methods: FiatMethod[], previousId?: string | null): FiatMethod | null =>
  methods.find((method) => method.id === previousId) ??
  methods.find((method) => method.isDefault) ??
  methods[0] ??
  null;

const cardTabDefault = (
  root: ReturnType<typeof useFlowState>["root"],
  state: DepositFlowState,
  picker: PickerState,
  filter: MethodPickerProps["filter"],
): string | null => {
  if (root.mode !== "deposit" || !state.methods || state.step !== "pick-method" || picker.cryptoOpen) return null;
  if (state.method?.kind === "fiat" || state.method?.kind === "onramp") return null;
  const methods = state.methods.methods.filter((method) => (filter ? filter(method) : true));
  const hasCrypto = methods.some((method) => method.kind === "crypto");
  const fiat = methods.filter((method): method is FiatMethod => method.kind === "fiat");
  const onramp = methods.find((method): method is OnrampMethod => method.kind === "onramp") ?? null;
  if (fiat.length === 0 && !onramp) return null;
  const tab: EntryTab = picker.tab ?? (hasCrypto ? "crypto" : "card");
  if (tab !== "card") return null;
  const country = cardCountry(root.locale, state.methods, fiat, onramp !== null, null, picker.country);
  const railMethods = fiat.filter((method) => RAIL_COUNTRY[method.rail] === country);
  if (railMethods.length === 0) return onramp?.id ?? null;
  return defaultRailMethod(railMethods, picker.fiatMethodId)?.id ?? null;
};

const cardCountries = (fiat: FiatMethod[], onramp: boolean) => {
  const railCountries = Array.from(new Set(fiat.map((method) => RAIL_COUNTRY[method.rail])));
  const countries = onramp ? Array.from(new Set([...railCountries, ...ui.COUNTRY_CODES])) : railCountries;
  return { railCountries, countries };
};

const cardCountry = (
  locale: PayLocale,
  methods: PayMethods,
  fiat: FiatMethod[],
  onramp: boolean,
  selected: FiatMethod | null,
  picked: string | null,
): string => {
  const { railCountries, countries } = cardCountries(fiat, onramp);
  const pick = (code: string | null | undefined) => (code && countries.includes(code) ? code : null);
  return (
    pick(selected ? RAIL_COUNTRY[selected.rail] : null) ??
    pick(picked) ??
    pick(methods.suggestedCountry?.toUpperCase()) ??
    pick(LOCALE_COUNTRY[locale]) ??
    railCountries[0] ??
    countries[0] ??
    "US"
  );
};

export const MethodPicker = forwardRef<HTMLDivElement, MethodPickerProps>(function MethodPicker(
  { filter, renderItem, className, style, unstyled, ...rest },
  ref,
) {
  const { root, state } = useFlowState("<Pay.MethodPicker>");
  const picker = useStoreValue(root.picker);
  const autoMethodId = renderItem ? null : cardTabDefault(root, state as DepositFlowState, picker, filter);
  useEffect(() => {
    if (autoMethodId) (root.flow.actions as DepositFlowActions).selectMethod(autoMethodId);
  }, [autoMethodId, root.flow]);
  if (root.mode !== "deposit" || !state.methods) return null;
  const s = state as DepositFlowState;
  const fiatSelected = s.method?.kind === "fiat";
  const onrampSelected = s.method?.kind === "onramp";
  const visible =
    (s.step === "pick-method" && !picker.cryptoOpen) ||
    ((s.step === "enter-amount" || s.step === "creating") && fiatSelected) ||
    (s.step === "onramp" && onrampSelected);
  if (!visible) return null;
  const isUnstyled = unstyled ?? root.unstyled;
  const methods = s.methods!.methods.filter((method) => (filter ? filter(method) : true));
  const crypto = methods.filter((method): method is CryptoMethod => method.kind === "crypto");
  const fiat = methods.filter((method): method is FiatMethod => method.kind === "fiat");
  const onramp = methods.find((method): method is OnrampMethod => method.kind === "onramp") ?? null;
  const actions = root.flow.actions as DepositFlowActions;
  const openCrypto = () => {
    const available = orderBy(
      crypto.filter((method) => method.available),
      (method) => method.currency,
      s.methods!.ordering.currencies,
    );
    const preferred =
      available.find((method) => method.chainId === "base" && method.currency === "USDC") ?? available[0] ?? crypto[0];
    root.picker.set({ cryptoOpen: true, cryptoCurrency: preferred?.currency ?? null });
  };
  const fiatLabel = (method: FiatMethod) => {
    const copy = methodCopy(root.t, method);
    return {
      label: copy.label ?? root.t("method.card"),
      subtitle:
        copy.subtitle ??
        (method.displayedCommissionPct
          ? root.t("method.commission", { pct: formatPercentValue(method.displayedCommissionPct, root.intl) })
          : null),
    };
  };

  if (crypto.length + fiat.length + (onramp ? 1 : 0) === 0) {
    return (
      <div {...rest} ref={ref} {...partProps("method-picker", { className, style, unstyled }, root.unstyled)} data-empty="">
        <ui.MethodsNotice variant="empty" unstyled={unstyled}>
          {root.t("method.empty")}
        </ui.MethodsNotice>
      </div>
    );
  }

  if (renderItem) {
    const options: MethodOption[] = [];
    if (crypto.length > 0) options.push({ kind: "crypto", id: "crypto", methods: crypto });
    methods.forEach((method) => {
      if (method.kind !== "crypto") options.push(method);
    });
    return (
      <div
        role="group"
        aria-label={root.t("method.title")}
        {...rest}
        ref={ref}
        {...partProps("method-picker", { className, style, unstyled }, root.unstyled)}
      >
        {options.map((option) => {
          const selected = option.kind === "crypto" ? picker.cryptoOpen : s.method?.id === option.id;
          const select = () => {
            if (option.kind === "crypto") {
              openCrypto();
              return;
            }
            root.picker.set({ cryptoOpen: false });
            actions.selectMethod(option.id);
          };
          return <div key={option.id}>{renderItem(option, { selected, select })}</div>;
        })}
      </div>
    );
  }

  const hasCrypto = crypto.length > 0;
  const hasCard = fiat.length > 0 || onramp !== null;
  const tab: EntryTab = picker.tab ?? (fiatSelected || onrampSelected || !hasCrypto ? "card" : "crypto");
  const { countries } = cardCountries(fiat, onramp !== null);
  const country = cardCountry(
    root.locale,
    s.methods!,
    fiat,
    onramp !== null,
    fiatSelected ? (s.method as FiatMethod) : null,
    picker.country,
  );
  const railMethods = fiat.filter((method) => RAIL_COUNTRY[method.rail] === country);
  const leaveAmount = () => {
    if (s.step !== "pick-method") actions.back();
  };
  return (
    <div
      role="group"
      aria-label={root.t("method.title")}
      {...rest}
      ref={ref}
      {...partProps("method-picker", { className, style, unstyled }, root.unstyled)}
      data-tab={tab}
    >
      {hasCrypto && hasCard && (
        <ui.EntryTabs
          unstyled={isUnstyled}
          ariaLabel={root.t("method.title")}
          value={tab}
          onChange={(next) => {
            leaveAmount();
            root.picker.set({ tab: next as EntryTab, cryptoOpen: false });
          }}
          tabs={[
            { id: "crypto", label: root.t("entry.tabCrypto") },
            { id: "card", label: root.t("entry.tabCard") },
          ]}
        />
      )}
      {tab === "crypto" && hasCrypto && (
        <ui.EntryOptions
          unstyled={isUnstyled}
          onSelect={openCrypto}
          options={[
            {
              id: "crypto",
              title: root.t("entry.transferTitle"),
              subtitle: root.t("entry.transferSubtitle"),
              icons: ui.cryptoStackIcons(),
              attrs: {
                "data-binodex-pay": "method-option",
                "data-kind": "crypto",
                "data-method": "crypto",
                "data-selected": picker.cryptoOpen ? "" : undefined,
              },
            },
          ]}
        />
      )}
      {tab === "card" && hasCard && (
        <div className={isUnstyled ? undefined : "bp-card-tab"}>
          {countries.length > 1 && (
            <ui.CountrySelect
              unstyled={isUnstyled}
              value={country}
              countries={countries}
              onChange={(code) => {
                if (code === country) return;
                leaveAmount();
                root.picker.set({ country: code });
              }}
            />
          )}
          {railMethods.length > 0 ? (
            <ui.Field label={root.t("fiat.methodLabel")} unstyled={isUnstyled}>
              <ui.MethodGrid
                unstyled={isUnstyled}
                ariaLabel={root.t("fiat.methodLabel")}
                selectedId={s.method?.id ?? null}
                disabled={s.step === "creating"}
                badgeTitles={{ qr: root.t("fiat.qrHint"), pdf: root.t("fiat.pdfHint") }}
                onSelect={(id) => {
                  root.picker.set({ cryptoOpen: false, tab: "card", country, fiatMethodId: id });
                  if (s.method?.id !== id) actions.selectMethod(id);
                }}
                methods={railMethods.map((method) => {
                  const copy = fiatLabel(method);
                  return {
                    id: method.id,
                    label: copy.label,
                    subtitle: copy.subtitle,
                    minLabel: method.minAmount
                      ? root.t(railKey(method.rail, "methodMin"), { min: formatAmount(method.minAmount, method.currency) })
                      : null,
                    logoKey: method.methodId,
                    attrs: {
                      "data-binodex-pay": "method-option",
                      "data-kind": "fiat",
                      "data-method": method.id,
                      "data-rail": method.rail,
                    },
                  };
                })}
              />
            </ui.Field>
          ) : onramp ? null : (
            <ui.MethodsNotice variant="empty" unstyled={isUnstyled}>
              {root.t("fiat.methodsEmpty")}
            </ui.MethodsNotice>
          )}
        </div>
      )}
    </div>
  );
});

const useCryptoMethods = (owner: string) => {
  const { root, state } = useFlowState(owner);
  const picker = useStoreValue(root.picker);
  const ordering = state.methods?.ordering ?? { currencies: [], chains: [] };
  const crypto = (state.methods?.methods ?? []).filter(
    (method): method is CryptoMethod => method.kind === "crypto",
  );
  const selectedMethod = state.method?.kind === "crypto" ? (state.method as CryptoMethod) : null;
  const currency = picker.cryptoCurrency ?? selectedMethod?.currency ?? null;
  const visible =
    root.mode === "withdraw"
      ? state.step !== "loading" && state.step !== "status" && state.step !== "error"
      : (state.step === "pick-method" && picker.cryptoOpen) ||
        (selectedMethod !== null && (state.step === "creating" || state.step === "crypto-address"));
  return { root, state, crypto, ordering, currency, selectedMethod, visible };
};

export interface CurrencyPickerProps extends ListProps {
  renderItem?: (currency: string, state: { selected: boolean; select: () => void }) => ReactNode;
}

export const CurrencyPicker = forwardRef<HTMLDivElement, CurrencyPickerProps>(function CurrencyPicker(
  { renderItem, className, style, unstyled, ...rest },
  ref,
) {
  const { root, crypto, ordering, currency, selectedMethod, visible } = useCryptoMethods("<Pay.CurrencyPicker>");
  if (!visible || crypto.length === 0) return null;
  const isUnstyled = unstyled ?? root.unstyled;
  const currencies = orderBy(
    Array.from(new Set(crypto.map((method) => method.currency))),
    (value) => value,
    ordering.currencies,
  );
  const select = (value: string) => {
    root.picker.set({ cryptoCurrency: value });
    const routes = orderBy(
      crypto.filter((method) => method.currency === value),
      (method) => method.chainId,
      ordering.chains,
    );
    if (root.mode === "withdraw") {
      const preferred =
        routes.find((method) => method.chainId === selectedMethod?.chainId) ?? routes[0] ?? null;
      if (preferred) root.flow.actions.selectMethod(preferred.id);
      return;
    }
    const sameChain = routes.find((method) => method.chainId === selectedMethod?.chainId && method.available);
    const target = sameChain ?? (routes.length === 1 ? routes[0] : null);
    if (target) root.flow.actions.selectMethod(target.id);
    else if (selectedMethod) (root.flow.actions as DepositFlowActions).back();
  };
  if (renderItem) {
    return (
      <div
        role="group"
        aria-label={root.t("currency.label")}
        {...rest}
        ref={ref}
        {...partProps("currency-picker", { className, style, unstyled }, root.unstyled)}
      >
        {currencies.map((value) => (
          <div key={value}>{renderItem(value, { selected: value === currency, select: () => select(value) })}</div>
        ))}
      </div>
    );
  }
  const options = currencies.map((value) => ({
    value,
    label: value,
    icon: <ui.TokenIcon symbol={value} size={24} />,
    attrs: { "data-currency": value },
  }));
  return (
    <ui.RouteColumn
      {...rest}
      ref={ref}
      className={className}
      style={style}
      unstyled={isUnstyled}
      part="currency-picker"
      optionPart="currency-option"
      label={root.t("route.token")}
      listLabel={root.t("currency.label")}
      value={options.find((option) => option.value === currency) ?? null}
      options={options}
      onSelect={select}
    />
  );
});

export interface NetworkPickerProps extends ListProps {
  renderItem?: (method: CryptoMethod, state: { selected: boolean; select: () => void }) => ReactNode;
}

export const NetworkPicker = forwardRef<HTMLDivElement, NetworkPickerProps>(function NetworkPicker(
  { renderItem, className, style, unstyled, ...rest },
  ref,
) {
  const { root, crypto, ordering, currency, selectedMethod, visible } =
    useCryptoMethods("<Pay.NetworkPicker>");
  if (!visible || crypto.length === 0) return null;
  const isUnstyled = unstyled ?? root.unstyled;
  const routes = currency
    ? orderBy(
        crypto.filter((method) => method.currency === currency),
        (method) => method.chainId,
        ordering.chains,
      )
    : [];
  const select = (id: string) => root.flow.actions.selectMethod(id);
  if (renderItem) {
    if (routes.length === 0) return null;
    return (
      <div
        role="group"
        aria-label={root.t("network.label")}
        {...rest}
        ref={ref}
        {...partProps("network-picker", { className, style, unstyled }, root.unstyled)}
      >
        {routes.map((method) => (
          <div key={method.id}>
            {renderItem(method, { selected: selectedMethod?.id === method.id, select: () => select(method.id) })}
          </div>
        ))}
      </div>
    );
  }
  const limits =
    selectedMethod && selectedMethod.currency === currency
      ? root.mode === "withdraw"
        ? selectedMethod.withdrawal
        : selectedMethod.minUsd
          ? { minUsd: selectedMethod.minUsd, minNative: selectedMethod.minNative, maxNative: selectedMethod.maxNative }
          : null
      : null;
  const options = routes.map((method) => {
    const unavailable = root.mode === "deposit" && !method.available;
    return {
      value: method.id,
      label: chainName(method.chainId),
      icon: <ui.ChainIcon chainId={method.chainId} size={24} />,
      disabled: unavailable,
      hint: unavailable ? root.t("method.unavailable") : null,
      attrs: { "data-chain": method.chainId },
    };
  });
  return (
    <ui.RouteColumn
      {...rest}
      ref={ref}
      className={className}
      style={style}
      unstyled={isUnstyled}
      part="network-picker"
      optionPart="network-option"
      label={root.t("route.network")}
      listLabel={root.t("network.label")}
      labelRight={
        limits
          ? `${root.t("route.min")}: ${formatMinLimit(
              { minUsd: limits.minUsd, minNative: limits.minNative, maxNative: limits.maxNative },
              selectedMethod!.currency,
            )}`
          : undefined
      }
      value={options.find((option) => option.value === selectedMethod?.id) ?? null}
      options={options}
      onSelect={select}
    />
  );
});


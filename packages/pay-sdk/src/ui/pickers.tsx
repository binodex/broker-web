"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useClasses } from "./context.js";
import { BadgeIcon, CheckIcon, ChevronIcon, RowCheckIcon } from "./icons.js";
import { COUNTRY_CODES, countryFlagPath, getMethodLogo } from "./logos.js";
import { partProps, viewProps, type PartStyleProps } from "./part.js";
import type { MethodOption, RouteOption } from "./types.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children" | "onChange" | "onSelect"> &
  PartStyleProps;

const useClickAway = (open: boolean, close: () => void, ...refs: { current: HTMLElement | null }[]) => {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && refs.some((ref) => ref.current?.contains(target))) return;
      latest.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
};

export interface FieldProps extends DivProps {
  label?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, htmlFor, children, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("field", { className, style, unstyled }, off)}>
      {label !== undefined &&
        (htmlFor ? (
          <label className={c("field-label")} htmlFor={htmlFor} data-binodex-pay="label">
            {label}
          </label>
        ) : (
          <span className={c("field-label")} data-binodex-pay="label">
            {label}
          </span>
        ))}
      {children}
    </div>
  );
});

export const MethodsNotice = forwardRef<HTMLDivElement, DivProps & { variant: "loading" | "empty"; children?: ReactNode }>(
  function MethodsNotice({ variant, children, className, style, unstyled, ...rest }, ref) {
    const { off } = useClasses(unstyled);
    return (
      <div
        role={variant === "loading" ? "status" : undefined}
        {...rest}
        ref={ref}
        {...partProps("methods-notice", { className, style, unstyled }, off)}
        data-variant={variant}
      >
        {children}
      </div>
    );
  },
);

export interface MethodGridProps extends DivProps {
  methods: MethodOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  badgeTitles?: { qr?: string; pdf?: string };
  ariaLabel?: string;
}

function MethodLogoView({ option, unstyled }: { option: MethodOption; unstyled?: boolean }) {
  const { ui, c } = useClasses(unstyled);
  const logo = getMethodLogo(option.logoKey ?? option.id);
  const [failed, setFailed] = useState(false);
  const showImage = logo.imgPath !== null && !failed;
  return (
    <span className={c("method-logo")} style={{ background: logo.background, color: logo.color }}>
      {showImage ? (
        <img
          className={c("method-logo-img")}
          src={`${ui.assetBaseUrl}${logo.imgPath}`}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        logo.initial
      )}
    </span>
  );
}

export const MethodGrid = forwardRef<HTMLDivElement, MethodGridProps>(function MethodGrid(
  { methods, selectedId, onSelect, disabled = false, badgeTitles, ariaLabel, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      {...rest}
      ref={ref}
      {...partProps("method-grid", { className, style, unstyled }, off)}
    >
      {methods.map((method) => {
        const selected = method.id === selectedId;
        const logo = getMethodLogo(method.logoKey ?? method.id);
        return (
          <button
            key={method.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || method.disabled}
            className={c("method-card", selected && "method-card-selected")}
            data-binodex-pay="method-card"
            data-selected={selected ? "" : undefined}
            onClick={() => onSelect(method.id)}
            {...method.attrs}
          >
            <span className={c("method-logo-wrap")} aria-hidden="true">
              <MethodLogoView key={method.logoKey ?? method.id} option={method} unstyled={unstyled} />
              {logo.badge && (
                <span className={c("method-badge")} title={badgeTitles?.[logo.badge]} data-badge={logo.badge}>
                  <BadgeIcon badge={logo.badge} className={c("method-badge-icon")} />
                </span>
              )}
            </span>
            <span className={c("method-text")}>
              <span className={c("method-label")} data-binodex-pay="option-label">
                {method.label}
              </span>
              {method.subtitle && (
                <span className={c("method-subtitle")} data-binodex-pay="option-subtitle">
                  {method.subtitle}
                </span>
              )}
              {method.minLabel && (
                <span className={c("method-min")} data-binodex-pay="option-min">
                  {method.minLabel}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});

const RouteGroupContext = createContext<{ open: string | null; setOpen: (id: string | null) => void } | null>(null);

export const RouteGrid = forwardRef<HTMLDivElement, DivProps & { children?: ReactNode }>(function RouteGrid(
  { children, className, style, unstyled, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  const [open, setOpen] = useState<string | null>(null);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <div {...rest} ref={ref} {...partProps("route-grid", { className, style, unstyled }, off)}>
      <RouteGroupContext.Provider value={value}>{children}</RouteGroupContext.Provider>
    </div>
  );
});

export interface RouteColumnProps extends DivProps {
  label: ReactNode;
  labelRight?: ReactNode;
  value: RouteOption | null;
  options: RouteOption[];
  onSelect: (value: string) => void;
  part?: string;
  optionPart?: string;
  listLabel?: string;
}

export const RouteColumn = forwardRef<HTMLDivElement, RouteColumnProps>(function RouteColumn(
  { label, labelRight, value, options, onSelect, part = "route-column", optionPart = "route-option", listLabel, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  const id = useId();
  const group = useContext(RouteGroupContext);
  const [ownOpen, setOwnOpen] = useState(false);
  const open = group ? group.open === id : ownOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (group) group.setOpen(next ? id : null);
      else setOwnOpen(next);
    },
    [group, id],
  );
  const column = useRef<HTMLDivElement | null>(null);
  useClickAway(open, () => setOpen(false), column);
  return (
    <div
      {...rest}
      ref={(element) => {
        column.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      {...viewProps(part, "route-column", { className, style, unstyled }, off)}
      data-open={open ? "" : undefined}
    >
      <div className={c("route-label-row")}>
        <span className={c("route-label")} data-binodex-pay="label">
          {label}
        </span>
        {labelRight && (
          <span className={c("route-label-right")} data-binodex-pay="label-right">
            {labelRight}
          </span>
        )}
      </div>
      <button
        type="button"
        className={c("route-trigger-button")}
        data-binodex-pay="route-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={c("route-trigger", !value && "route-trigger-disabled")}>
          <span className={c("route-trigger-left")}>
            {value?.icon ?? <span className={c("route-icon-placeholder")} />}
            <span className={c("route-trigger-label")}>{value?.label ?? "—"}</span>
          </span>
          <ChevronIcon className={c("route-chevron")} />
        </span>
      </button>
      {open && (
        <div role="listbox" aria-label={listLabel} className={c("route-dropdown")} data-binodex-pay="route-list">
          {options.map((option) => {
            const selected = option.value === value?.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className={c("route-row", selected && "route-row-selected")}
                data-binodex-pay={optionPart}
                data-value={option.value}
                data-selected={selected ? "" : undefined}
                onClick={() => {
                  setOpen(false);
                  onSelect(option.value);
                }}
                {...option.attrs}
              >
                {option.icon ?? <span className={c("route-icon-placeholder")} />}
                <span className={c("route-row-label")}>{option.label}</span>
                {option.hint && <span className={c("route-row-hint")}>{option.hint}</span>}
                {selected && <RowCheckIcon className={c("route-row-check")} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export interface RoutePickerProps extends DivProps {
  coins: RouteOption[];
  networks: RouteOption[];
  value: { currency: string | null; network: string | null };
  onChange: (next: { currency: string | null; network: string | null }, changed: "currency" | "network") => void;
  minLabel?: ReactNode;
  labels?: { token?: ReactNode; network?: ReactNode };
}

export const RoutePicker = forwardRef<HTMLDivElement, RoutePickerProps>(function RoutePicker(
  { coins, networks, value, onChange, minLabel, labels, className, style, unstyled, ...rest },
  ref,
) {
  const { ui } = useClasses(unstyled);
  const coin = coins.find((entry) => entry.value === value.currency) ?? null;
  const network = networks.find((entry) => entry.value === value.network) ?? null;
  return (
    <RouteGrid {...rest} ref={ref} className={className} style={style} unstyled={unstyled}>
      <RouteColumn
        label={labels?.token ?? ui.t("route.token")}
        value={coin}
        options={coins}
        part="currency-picker"
        optionPart="currency-option"
        onSelect={(currency) => onChange({ currency, network: value.network }, "currency")}
        unstyled={unstyled}
      />
      <RouteColumn
        label={labels?.network ?? ui.t("route.network")}
        labelRight={minLabel}
        value={network}
        options={networks}
        part="network-picker"
        optionPart="network-option"
        onSelect={(next) => onChange({ currency: value.currency, network: next }, "network")}
        unstyled={unstyled}
      />
    </RouteGrid>
  );
});

const displayNames = (locale: string): ((code: string) => string) => {
  try {
    const names = new Intl.DisplayNames([locale, "en"], { type: "region" });
    return (code) => names.of(code) ?? code;
  } catch {
    return (code) => code;
  }
};

function Flag({ code, lazy = false, unstyled }: { code: string; lazy?: boolean; unstyled?: boolean }) {
  const { ui, c } = useClasses(unstyled);
  const [failed, setFailed] = useState(false);
  return (
    <span className={c("flag")} aria-hidden="true">
      {!failed && (
        <img
          className={c("flag-img")}
          src={`${ui.assetBaseUrl}${countryFlagPath(code)}`}
          alt=""
          loading={lazy ? "lazy" : undefined}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export interface CountrySelectProps extends DivProps {
  value: string;
  onChange: (code: string) => void;
  countries?: readonly string[];
  pinned?: readonly string[];
  labels?: { label?: ReactNode; search?: string; empty?: ReactNode };
}

export const CountrySelect = forwardRef<HTMLDivElement, CountrySelectProps>(function CountrySelect(
  { value, onChange, countries = COUNTRY_CODES, pinned = ["RU"], labels, className, style, unstyled, ...rest },
  ref,
) {
  const { ui, c, off } = useClasses(unstyled);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrap = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const nameOf = useMemo(() => displayNames(ui.intl), [ui.intl]);
  const list = useMemo(() => {
    const entries = countries.map((code) => ({ code, name: nameOf(code) }));
    const rank = (code: string) => {
      const index = pinned.indexOf(code);
      return index === -1 ? pinned.length : index;
    };
    entries.sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, ui.intl));
    return entries;
  }, [countries, pinned, nameOf, ui.intl]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((entry) => entry.name.toLowerCase().includes(q) || entry.code.toLowerCase().includes(q));
  }, [list, query]);
  const selected = list.find((entry) => entry.code === value) ?? null;
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);
  useClickAway(open, close, wrap);
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(handle);
  }, [open]);
  const pick = (code: string) => {
    onChange(code);
    close();
  };
  const search = labels?.search ?? ui.t("country.search");
  return (
    <div
      {...rest}
      ref={(element) => {
        wrap.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      {...partProps("country-select", { className, style, unstyled }, off)}
      data-open={open ? "" : undefined}
    >
      {open ? (
        <div className={c("country-trigger", "country-trigger-open")}>
          {selected && <Flag code={selected.code} unstyled={unstyled} />}
          <input
            ref={input}
            className={c("country-search")}
            data-binodex-pay="country-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={selected?.name ?? search}
            aria-label={search}
            aria-controls={listId}
            type="text"
          />
          <span className={c("country-chevron", "country-chevron-up")} aria-hidden="true" />
        </div>
      ) : (
        <button
          type="button"
          className={c("country-trigger")}
          data-binodex-pay="country-trigger"
          onClick={() => setOpen(true)}
          aria-haspopup="listbox"
          aria-expanded={false}
        >
          <span className={c("country-label")}>{labels?.label ?? ui.t("country.label")}:</span>
          {selected && <Flag code={selected.code} unstyled={unstyled} />}
          <span className={c("country-name")} data-binodex-pay="country-name">
            {selected?.name ?? "—"}
          </span>
          <span className={c("country-chevron")} aria-hidden="true" />
        </button>
      )}
      {open && (
        <div className={c("country-panel")} role="listbox" id={listId} data-binodex-pay="country-list">
          <div className={c("country-list")}>
            {filtered.length === 0 && (
              <div className={c("country-empty")}>{labels?.empty ?? ui.t("country.empty")}</div>
            )}
            {filtered.map((entry) => {
              const active = entry.code === value;
              return (
                <button
                  key={entry.code}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={c("country-option", active && "country-option-active")}
                  data-binodex-pay="country-option"
                  data-country={entry.code}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(entry.code);
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) pick(entry.code);
                  }}
                >
                  <Flag code={entry.code} lazy unstyled={unstyled} />
                  <span className={c("country-option-name")}>{entry.name}</span>
                  {active && (
                    <span className={c("country-check")} aria-hidden="true">
                      <CheckIcon size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

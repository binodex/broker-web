"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { useClasses } from "./context.js";
import { CRYPTO_STACK, TokenIcon, TransferCryptoIcon } from "./icons.js";
import { partProps, type PartStyleProps } from "./part.js";
import type { EntryOption, EntryTab } from "./types.js";

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children" | "onChange" | "onSelect"> &
  PartStyleProps;

export interface EntryTabsProps extends DivProps {
  tabs: EntryTab[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export const EntryTabs = forwardRef<HTMLDivElement, EntryTabsProps>(function EntryTabs(
  { tabs, value, onChange, ariaLabel, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      {...rest}
      ref={ref}
      {...partProps("tabs", { className, style, unstyled }, off)}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            className={c("tab", active && "tab-active")}
            data-binodex-pay="tab"
            data-tab={tab.id}
            data-active={active ? "" : undefined}
            onClick={() => onChange(tab.id)}
            {...tab.attrs}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});

export interface EntryOptionsProps extends DivProps {
  options: EntryOption[];
  onSelect?: (id: string) => void;
}

export const IconStack = ({ icons, unstyled }: { icons: ReactNode[]; unstyled?: boolean }) => {
  const { c } = useClasses(unstyled);
  return (
    <div className={c("icon-stack")} data-binodex-pay="icon-stack">
      {icons.map((icon, index) => (
        <div key={index} className={c("icon-badge")}>
          {icon}
        </div>
      ))}
    </div>
  );
};

export const EntryOptions = forwardRef<HTMLDivElement, EntryOptionsProps>(function EntryOptions(
  { options, onSelect, className, style, unstyled, ...rest },
  ref,
) {
  const { c, off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("entry-options", { className, style, unstyled }, off)}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={c("entry-option")}
          data-binodex-pay="entry-option"
          data-option={option.id}
          disabled={option.disabled}
          onClick={onSelect ? () => onSelect(option.id) : undefined}
          {...option.attrs}
        >
          <span className={c("entry-option-icon")} aria-hidden="true">
            {option.icon ?? <TransferCryptoIcon />}
          </span>
          <span className={c("entry-option-body")}>
            <span className={c("entry-option-text")}>
              <span className={c("entry-option-title")} data-binodex-pay="option-label">
                {option.title}
              </span>
              {option.subtitle !== undefined && option.subtitle !== null && (
                <span className={c("entry-option-subtitle")} data-binodex-pay="option-subtitle">
                  {option.subtitle}
                </span>
              )}
            </span>
            {option.icons && option.icons.length > 0 && <IconStack icons={option.icons} unstyled={unstyled} />}
          </span>
        </button>
      ))}
    </div>
  );
});

export const CardTab = forwardRef<HTMLDivElement, DivProps & { children?: ReactNode }>(function CardTab(
  { children, className, style, unstyled, ...rest },
  ref,
) {
  const { off } = useClasses(unstyled);
  return (
    <div {...rest} ref={ref} {...partProps("card-tab", { className, style, unstyled }, off)}>
      {children}
    </div>
  );
});

export const cryptoStackIcons = (symbols: readonly string[] = CRYPTO_STACK): ReactNode[] =>
  symbols.map((symbol) => <TokenIcon key={symbol} symbol={symbol} size={20} />);

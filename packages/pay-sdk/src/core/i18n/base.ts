import type { PayError } from "../errors.js";
import { formatMoney } from "../money.js";
import { enUi } from "./en-ui.js";
import type { MessageKey } from "./en.js";

export type { MessageKey, Messages } from "./en.js";

export const LOCALES = ["en", "ru", "de", "ua", "es", "fr", "hi", "tr", "ar", "it", "cs"] as const;

export type PayLocale = (typeof LOCALES)[number];

const INTL_LOCALE: Record<PayLocale, string> = {
  en: "en-US",
  ru: "ru-RU",
  de: "de-DE",
  ua: "uk-UA",
  es: "es-ES",
  fr: "fr-FR",
  hi: "hi-IN",
  tr: "tr-TR",
  ar: "ar-SA",
  it: "it-IT",
  cs: "cs-CZ",
};

const ALIASES: Record<string, PayLocale> = { uk: "ua" };

const RU_SPEAKING = new Set(["az", "hy", "be", "ka", "mn", "kk", "kg", "ky", "uz", "ru", "tg", "tk"]);

const RTL: ReadonlySet<PayLocale> = new Set<PayLocale>(["ar"]);

const matchLocale = (value: string): PayLocale | null => {
  const code = value.trim().toLowerCase().replace(/_/g, "-");
  if (!code) return null;
  const primary = code.split("-")[0] ?? "";
  if ((LOCALES as readonly string[]).includes(primary)) return primary as PayLocale;
  return ALIASES[primary] ?? null;
};

const navigatorLocale = (): PayLocale | null => {
  try {
    const language = typeof navigator === "undefined" ? "" : navigator.language;
    if (!language) return null;
    const primary = language.toLowerCase().split("-")[0] ?? "";
    if (RU_SPEAKING.has(primary)) return "ru";
    return matchLocale(language);
  } catch {
    return null;
  }
};

// A typo in `locale` must never blank the UI: it falls back to the browser language, then English.
export const resolveLocale = (raw: string | null | undefined): PayLocale =>
  (raw ? matchLocale(raw) : null) ?? navigatorLocale() ?? "en";

export const isRtlLocale = (locale: PayLocale): boolean => RTL.has(locale);

export const intlLocale = (locale: PayLocale): string => INTL_LOCALE[locale];

export const interpolate = (
  template: string,
  values: Record<string, string | number> = {},
): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

const UI_FALLBACK: Partial<Record<MessageKey, string>> = enUi;

export const translatorFrom = (
  catalog: Partial<Record<MessageKey, string>>,
  overrides?: Partial<Record<MessageKey, string>>,
  fallback: Partial<Record<MessageKey, string>> = UI_FALLBACK,
): Translate => (key, values) =>
  interpolate(overrides?.[key] ?? catalog[key] ?? fallback[key] ?? key, values);

export const formatRetryAfter =(t: Translate, retryAfterSeconds: number): string => {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  if (seconds < 60) return t("retry.seconds", { count: seconds });
  return t("retry.minutes", { count: Math.ceil(seconds / 60) });
};

export const formatEta = (t: Translate, seconds: number | null): string | null => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 90) return t("eta.seconds", { count: Math.round(seconds) });
  return t("eta.minutes", { count: Math.ceil(seconds / 60) });
};

export const errorMessage = (
  t: Translate,
  error: Pick<PayError, "code" | "details">,
  locale: PayLocale = "en",
): string => {
  const { code, details } = error;
  const money = (value: string | undefined) =>
    value === undefined
      ? ""
      : details.currency
        ? formatMoney(value, details.currency, intlLocale(locale))
        : value;
  switch (code) {
    case "RATE_LIMITED":
      return typeof details.retryAfterSeconds === "number"
        ? t("error.RATE_LIMITED", { retry: formatRetryAfter(t, details.retryAfterSeconds) })
        : t("error.RATE_LIMITED_GENERIC");
    case "AMOUNT_TOO_SMALL":
      return t("error.AMOUNT_TOO_SMALL", { min: money(details.min) }).replace(/\s+\./, ".");
    case "AMOUNT_TOO_LARGE":
      return t("error.AMOUNT_TOO_LARGE", { max: money(details.max) }).replace(/\s+\./, ".");
    case "VALIDATION_FAILED":
      return (details.field === "file" && details.max) || details.field === "file_base64"
        ? t("error.FILE_TOO_LARGE")
        : t("error.VALIDATION_FAILED");
    default:
      return t(`error.${code}` as MessageKey);
  }
};

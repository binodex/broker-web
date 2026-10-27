const LOCALE_BY_CURRENCY: Record<string, string> = {
  RUB: "ru-RU",
  UAH: "uk-UA",
  KZT: "ru-KZ",
  INR: "en-IN",
};

const SYMBOL_BY_CURRENCY: Record<string, string> = {
  RUB: "₽",
  UAH: "₴",
  KZT: "₸",
  INR: "₹",
  USD: "$",
};

export const FIAT_CURRENCIES: ReadonlySet<string> = new Set(
  Object.keys(LOCALE_BY_CURRENCY),
);

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

export const isDecimal = (value: string): boolean => DECIMAL.test(value.trim());

const toNumber = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) return Number.NaN;
  return typeof value === "string" ? Number.parseFloat(value) : value;
};

export const formatAmount = (
  value: number | string | null | undefined,
  currency: string,
): string => {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString(LOCALE_BY_CURRENCY[currency] ?? "ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const INR_GROUPED = /^(\d{1,2}(,\d{2})*,\d{3}|\d{1,3}(,\d{3})+)(\.\d+)?$/;

export const parseInrAmount = (raw: string): number => {
  const text = raw.trim();
  if (!text.includes(",")) return Number.parseFloat(text);
  return INR_GROUPED.test(text)
    ? Number.parseFloat(text.replace(/,/g, ""))
    : Number.NaN;
};

export const trimNumber = (value: string): string => {
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : value;
};

// Latin digits everywhere: next to "$" and ticker symbols, Arabic-Indic digits read as broken layout.
const numberFormat = (locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat => {
  const latin = { ...options, numberingSystem: "latn" } as Intl.NumberFormatOptions;
  try {
    return new Intl.NumberFormat(locale, latin);
  } catch {
    return new Intl.NumberFormat("en-US", latin);
  }
};

export const formatDecimal = (
  value: number | string | null | undefined,
  locale = "en-US",
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string => {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "";
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  return numberFormat(locale, {
    minimumFractionDigits: Math.min(options.minimumFractionDigits ?? 0, maximumFractionDigits),
    maximumFractionDigits,
  }).format(num);
};

export const formatPercentValue = (
  value: number | string | null | undefined,
  locale = "en-US",
): string => formatDecimal(value, locale, { maximumFractionDigits: 4 });

// The web writes dollars one way in every language: "$1250.00", "≈ $51.20".
export const formatUsd = (value: number | string | null | undefined): string => {
  const num = toNumber(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : "";
};

const FIXED_CENTS: ReadonlySet<string> = new Set(["RUB", "UAH"]);

const withSymbol = (amount: string, currency: string) => `${amount} ${SYMBOL_BY_CURRENCY[currency] ?? currency}`;

export const formatPayingAmount = (value: number | string | null | undefined, currency: string): string => {
  const upper = currency.toUpperCase();
  if (!FIAT_CURRENCIES.has(upper) || !FIXED_CENTS.has(upper)) return formatMoney(value, upper);
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "";
  return withSymbol(
    num.toLocaleString(LOCALE_BY_CURRENCY[upper], { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    upper,
  );
};

export const formatMoney = (
  value: number | string | null | undefined,
  currency: string,
  locale = "en-US",
): string => {
  const upper = currency.toUpperCase();
  if (upper === "USD") return formatUsd(value);
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "";
  if (FIAT_CURRENCIES.has(upper)) return withSymbol(formatAmount(num, upper), upper);
  return `${formatDecimal(num, locale, { maximumFractionDigits: 8 })}\u00a0${upper}`;
};

export const sanitizeAmountInput = (
  raw: string,
  options: { decimals?: number; maxLength?: number } = {},
): string => {
  const decimals = options.decimals ?? 2;
  const maxLength = options.maxLength ?? 12;
  let cleaned = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  const dot = cleaned.indexOf(".");
  if (decimals === 0 && dot !== -1) cleaned = cleaned.slice(0, dot);
  else if (dot !== -1 && cleaned.length - dot - 1 > decimals) {
    cleaned = cleaned.slice(0, dot + decimals + 1);
  }
  cleaned = cleaned.replace(/^0+(?=\d)/, "");
  if (cleaned.length > maxLength) cleaned = cleaned.slice(0, maxLength);
  return cleaned;
};

const split = (value: string): [string, string] | null => {
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const whole = (match[1] ?? "0").replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return [whole, fraction];
};

export const compareDecimal = (a: string, b: string): -1 | 0 | 1 | null => {
  const left = split(a);
  const right = split(b);
  if (!left || !right) return null;
  if (left[0].length !== right[0].length) {
    return left[0].length < right[0].length ? -1 : 1;
  }
  if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
  const width = Math.max(left[1].length, right[1].length);
  const lf = left[1].padEnd(width, "0");
  const rf = right[1].padEnd(width, "0");
  if (lf === rf) return 0;
  return lf < rf ? -1 : 1;
};

export const isPositiveDecimal = (value: string): boolean =>
  compareDecimal(value, "0") === 1;

export const toFixed2 = (value: string): string => {
  const num = Number(value);
  return Number.isFinite(num) ? (Math.floor(num * 100 + 1e-7) / 100).toFixed(2) : value;
};

const TOKEN_DECIMALS: Record<string, { min: number; max: number }> = {
  USDT: { min: 2, max: 2 },
  USDC: { min: 2, max: 2 },
  DAI: { min: 2, max: 2 },
  BUSD: { min: 2, max: 2 },
  TUSD: { min: 2, max: 2 },
  MATIC: { min: 0, max: 2 },
  TRX: { min: 0, max: 2 },
  SOL: { min: 0, max: 4 },
  ETH: { min: 0, max: 6 },
  BNB: { min: 0, max: 6 },
  BTC: { min: 0, max: 8 },
};

const TOKEN_DECIMALS_FALLBACK = { min: 0, max: 6 };

const truncate = (num: number, digits: number): number => {
  const [whole, fraction = ""] = num.toFixed(Math.min(20, digits + 2)).split(".");
  return Number(`${whole}.${fraction.slice(0, digits) || "0"}`);
};

export const formatTokenAmount = (value: number | string | null | undefined, symbol?: string | null): string => {
  const num = toNumber(value);
  const { min, max } = TOKEN_DECIMALS[symbol?.trim().toUpperCase() ?? ""] ?? TOKEN_DECIMALS_FALLBACK;
  if (!Number.isFinite(num) || num === 0) return min === 2 ? "0.00" : "0";
  const truncated = truncate(num, max);
  // Truncation can eat a sub-cent BTC amount down to zero; real dust must never read as "0".
  if (truncated === 0) {
    return numberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(num);
  }
  return numberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max }).format(truncated);
};

export const formatAmountMax2 = (value: number | string | null | undefined): string => {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "0";
  return (Math.floor(num * 100) / 100).toString();
};

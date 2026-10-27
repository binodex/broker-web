import type { AppearanceSkin } from "./appearance.js";
import { PayError, codeForStatus, isServerErrorCode } from "./errors.js";
import type {
  Balance,
  CreateDepositInput,
  CreateWithdrawalInput,
  CreditedDeposit,
  CryptoDeposit,
  CryptoDepositStatus,
  CryptoMethod,
  CryptoWithdrawalLimits,
  Deposit,
  DepositQuote,
  DepositSource,
  DisplayStatus,
  FiatDeposit,
  FiatDepositStatus,
  FiatMethod,
  FiatRail,
  FrameTicket,
  NextAction,
  PayActivity,
  PayContext,
  PayMethod,
  PayMethods,
  PayMode,
  PayRegion,
  PayTheme,
  QuoteWithdrawalInput,
  Requisites,
  WithdrawalActivity,
  Withdrawal,
  WithdrawalQuoteResult,
  WithdrawalStatus,
} from "./types.js";

export const PATHS = {
  redeem: "/broker/widget-sessions/redeem",
  ping: "/broker/pay/ping",
  context: "/broker/pay/context",
  methods: "/broker/pay/methods",
  depositQuote: "/broker/pay/deposits/quote",
  cryptoDeposit: "/broker/pay/deposits/crypto",
  deposits: "/broker/pay/deposits",
  deposit: (id: string) => `/broker/pay/deposits/${encodeURIComponent(id)}`,
  receipt: (id: string) =>
    `/broker/pay/deposits/${encodeURIComponent(id)}/receipt`,
  frameTicket: (id: string) =>
    `/broker/pay/deposits/${encodeURIComponent(id)}/frame-ticket`,
  onramp: "/broker/pay/onramp/session",
  withdrawalQuote: "/broker/pay/withdrawals/quote",
  withdrawals: "/broker/pay/withdrawals",
  withdrawal: (id: string) =>
    `/broker/pay/withdrawals/${encodeURIComponent(id)}`,
  activity: "/broker/pay/activity",
} as const;

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const REQUISITES_FRAME_PATH = "/embed/pay/requisites";

const FRAME_PATH = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export const safeFramePath = (value: unknown): string =>
  typeof value === "string" && FRAME_PATH.test(value) ? value : REQUISITES_FRAME_PATH;

export interface WireSessionResponse {
  session: string;
  expires_in?: number;
  widget_url?: string | null;
  widget_origin?: string | null;
  widget_origins?: string[];
  region?: string;
  geo?: string;
  api_base?: string | null;
  api_bases?: string[];
  pay_api?: boolean;
  client_id?: string;
}

export interface WireRedeemRequest {
  session: string;
  origin: string;
  client_id: string;
  mode: PayMode;
}

export interface WireRedeemResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  pay_api?: boolean;
  api_base?: string;
  api_bases?: string[];
  widget_origins?: string[];
  region?: string;
}

export interface WirePing {
  ok: true;
  server_time: number;
}

export interface WireErrorEnvelope {
  error: {
    message: string;
    details?: {
      code?: string;
      field?: string;
      min?: string | number;
      max?: string | number;
      currency?: string;
      retry_after_seconds?: number;
      withdrawal_id?: string;
    };
  };
}

export const FRAME_TICKET_PREFIX = "wft_";

export interface WireCreateDepositBody {
  method_id: string;
  amount: string;
  customer_phone?: string;
  return_url?: string;
}

export interface WireQuoteWithdrawalBody {
  method_id: string;
  address: string;
  amount: string;
  accept_slippage_pct?: number;
}

export interface WireCreateWithdrawalBody extends WireQuoteWithdrawalBody {
  quote?: {
    fee_usd: string | null;
    receive_amount: string | null;
    receive_amount_usd: string | null;
    eta_seconds: number | null;
    slippage_pct: string | null;
  };
  two_factor_code?: string;
}

type Json = Record<string, unknown>;

const invalid = (what: string): PayError =>
  new PayError("INVALID_RESPONSE", `Unexpected response: ${what}`);

const asObject = (value: unknown, what: string): Json => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(what);
  }
  return value as Json;
};

const isObject = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const str = (data: Json, key: string): string => {
  const value = data[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw invalid(key);
};

const optStr = (data: Json, key: string): string | null => {
  const value = data[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const num = (data: Json, key: string): number => {
  const value = data[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw invalid(key);
};

const optNum = (data: Json, key: string): number | null => {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

const strictOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  what: string,
): T => {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw invalid(what);
};

const MODES = ["deposit", "withdraw"] as const;
const REGIONS = ["ru", "global", "unknown"] as const;
const RAILS = ["ru", "kz", "ua", "in"] as const;
const THEMES = ["light", "dark"] as const;
const CRYPTO_STATUSES = ["active", "expired", "consumed", "closed"] as const;
const FIAT_STATUSES = [
  "pending",
  "completed",
  "failed",
  "expired",
  "disputed",
] as const;
const WITHDRAWAL_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "refund_pending",
  "refunded",
] as const;
const DISPLAY_STATUSES = ["pending", "success", "failed"] as const;
const DEPOSIT_SOURCES = ["crypto", "card", "onramp"] as const;

export const readSessionExtras = (
  data: WireSessionResponse,
): {
  apiBases: string[];
  widgetOrigins: string[];
  widgetUrl: string | null;
  region: PayRegion | null;
  payApi: boolean | null;
  clientId: string | null;
} => {
  const apiBases = strList(data.api_bases);
  if (apiBases.length === 0 && typeof data.api_base === "string") {
    apiBases.push(data.api_base);
  }
  const widgetOrigins = strList(data.widget_origins);
  if (widgetOrigins.length === 0 && typeof data.widget_origin === "string") {
    widgetOrigins.push(data.widget_origin);
  }
  let clientId = typeof data.client_id === "string" ? data.client_id : null;
  const widgetUrl = typeof data.widget_url === "string" ? data.widget_url : null;
  if (!clientId && widgetUrl) {
    try {
      clientId = new URL(widgetUrl).searchParams.get("client_id");
    } catch {
      clientId = null;
    }
  }
  return {
    apiBases,
    widgetOrigins,
    widgetUrl,
    region:
      typeof data.geo === "string"
        ? oneOf(data.geo, REGIONS, "unknown")
        : typeof data.region === "string"
          ? oneOf(data.region, REGIONS, "unknown")
          : null,
    payApi: typeof data.pay_api === "boolean" ? data.pay_api : null,
    clientId: clientId || null,
  };
};

export const toRedeemBody = (input: {
  session: string;
  origin: string;
  clientId: string;
  mode: PayMode;
}): WireRedeemRequest => ({
  session: input.session,
  origin: input.origin,
  client_id: input.clientId,
  mode: input.mode,
});

export const readRedeem = (
  value: unknown,
): {
  accessToken: string;
  expiresIn: number | null;
  expiresAt: number | null;
  payApi: boolean | null;
} => {
  const data = asObject(value, "redeem");
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw invalid("access_token");
  }
  return {
    accessToken,
    expiresIn: optNum(data, "expires_in"),
    expiresAt: optNum(data, "expires_at"),
    payApi: typeof data.pay_api === "boolean" ? data.pay_api : null,
  };
};

export const readPing = (value: unknown): { serverTime: number | null } => {
  const data = asObject(value, "ping");
  if (data.ok !== true) throw invalid("ok");
  return { serverTime: optNum(data, "server_time") };
};

export const readError = (status: number, value: unknown): PayError => {
  const envelope = isObject(value) && isObject(value.error) ? value.error : null;
  const details = envelope && isObject(envelope.details) ? envelope.details : {};
  const rawCode = details.code;
  const code = isServerErrorCode(rawCode) ? rawCode : codeForStatus(status);
  const message =
    envelope && typeof envelope.message === "string"
      ? envelope.message.slice(0, 300)
      : `HTTP ${status}`;
  const retry = details.retry_after_seconds;
  return new PayError(code, message, {
    status,
    details: {
      ...(typeof details.field === "string" ? { field: details.field } : {}),
      ...(optStr(details, "min") !== null ? { min: optStr(details, "min") as string } : {}),
      ...(optStr(details, "max") !== null ? { max: optStr(details, "max") as string } : {}),
      ...(typeof details.currency === "string" ? { currency: details.currency } : {}),
      ...(typeof retry === "number" && Number.isFinite(retry)
        ? { retryAfterSeconds: retry }
        : {}),
      ...(typeof details.withdrawal_id === "string"
        ? { withdrawalId: details.withdrawal_id }
        : {}),
    },
  });
};

const readBalance = (value: unknown): Balance => {
  const data = asObject(value, "balance");
  return {
    available: optStr(data, "available"),
    held: optStr(data, "held"),
    total: optStr(data, "total"),
    withdrawable: optStr(data, "withdrawable"),
    currency: optStr(data, "currency") ?? "USD",
  };
};

export const readContext = (value: unknown): PayContext => {
  const data = asObject(value, "context");
  const withdrawal = isObject(data.withdrawal) ? data.withdrawal : null;
  const branding = isObject(data.branding) ? data.branding : {};
  return {
    mode: strictOneOf(data.mode, MODES, "mode"),
    serverTime: num(data, "server_time"),
    tokenExpiresAt: optNum(data, "token_expires_at"),
    balance: readBalance(data.balance),
    withdrawal: withdrawal
      ? {
          twoFactorRequired: withdrawal.two_factor_required === true,
          inFlightId: optStr(withdrawal, "in_flight_id"),
        }
      : null,
    requisitesDelivery: data.requisites_delivery === "raw" ? "raw" : "frame",
    branding: {
      theme:
        typeof branding.theme === "string" &&
        (THEMES as readonly string[]).includes(branding.theme)
          ? (branding.theme as PayTheme)
          : null,
      accentColor: optStr(branding, "accent_color"),
      backgroundColor: optStr(branding, "background_color"),
      logoUrl: optStr(branding, "logo_url"),
    },
  };
};

const readWithdrawalLimits = (value: unknown): CryptoWithdrawalLimits | null => {
  if (!isObject(value)) return null;
  return {
    minUsd: optStr(value, "min_usd") ?? "0",
    minNative: optStr(value, "min_native"),
    maxNative: optStr(value, "max_native"),
    feeUsd: optStr(value, "fee_usd") ?? "0",
    etaSeconds: optNum(value, "eta_seconds"),
    maxSlippagePct: optStr(value, "max_slippage_pct"),
  };
};

const readMethod = (value: unknown): PayMethod | null => {
  if (!isObject(value)) return null;
  const id = optStr(value, "id");
  if (!id) return null;
  switch (value.kind) {
    case "crypto": {
      const method: CryptoMethod = {
        id,
        kind: "crypto",
        chainId: str(value, "chain_id"),
        currency: str(value, "currency"),
        minUsd: optStr(value, "min_usd"),
        maxUsd: optStr(value, "max_usd"),
        minNative: optStr(value, "min_native"),
        maxNative: optStr(value, "max_native"),
        feeUsd: optStr(value, "fee_usd"),
        etaSeconds: optNum(value, "eta_seconds"),
        available: value.available !== false,
        withdrawal: readWithdrawalLimits(value.withdrawal),
      };
      return method;
    }
    case "fiat": {
      if (
        typeof value.rail !== "string" ||
        !(RAILS as readonly string[]).includes(value.rail)
      ) {
        return null;
      }
      const delivery =
        value.delivery === "redirect" || value.delivery === "qr"
          ? value.delivery
          : "requisites";
      const method: FiatMethod = {
        id,
        kind: "fiat",
        rail: value.rail as FiatRail,
        methodId: optStr(value, "method_id") ?? id,
        label: optStr(value, "label"),
        subtitle: optStr(value, "subtitle"),
        currency: str(value, "currency"),
        minAmount: optStr(value, "min_amount"),
        maxAmount: optStr(value, "max_amount"),
        displayedCommissionPct: optStr(value, "displayed_commission_pct"),
        requiresReceipt: value.requires_receipt === true,
        isDefault: value.is_default === true,
        delivery,
      };
      return method;
    }
    case "onramp":
      return { id, kind: "onramp", delivery: "embed" };
    default:
      return null;
  }
};

export const readMethods = (value: unknown): PayMethods => {
  const data = asObject(value, "methods");
  const ordering = isObject(data.ordering) ? data.ordering : {};
  const methods: PayMethod[] = [];
  if (Array.isArray(data.methods)) {
    for (const entry of data.methods) {
      try {
        const method = readMethod(entry);
        if (method) methods.push(method);
      } catch {
        continue;
      }
    }
  }
  return {
    mode: strictOneOf(data.mode, MODES, "mode"),
    suggestedCountry: optStr(data, "suggested_country"),
    methods,
    ordering: {
      currencies: strList(ordering.currencies),
      chains: strList(ordering.chains),
    },
    unavailableRails: strList(data.unavailable_rails),
    maxWithdrawUsd: optStr(data, "max_withdraw_usd"),
  };
};

export const toDepositQuoteQuery = (input: {
  methodId: string;
  amount: string;
}): Record<string, string> => ({
  method_id: input.methodId,
  amount: input.amount,
});

export const readDepositQuote = (value: unknown): DepositQuote => {
  const data = asObject(value, "quote");
  return {
    methodId: str(data, "method_id"),
    amount: str(data, "amount"),
    currency: str(data, "currency"),
    estimatedUsd: optStr(data, "estimated_usd"),
    displayedCommissionPct: optStr(data, "displayed_commission_pct"),
    minAmount: optStr(data, "min_amount"),
    maxAmount: optStr(data, "max_amount"),
  };
};

export const toCryptoDepositBody = (input: {
  chainId: string;
  currency: string;
}): { chain_id: string; currency: string } => ({
  chain_id: input.chainId,
  currency: input.currency,
});

const readRequisites = (value: unknown): Requisites | null => {
  if (!isObject(value)) return null;
  const raw = value.value;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return {
    kind: optStr(value, "kind") ?? "account",
    value: raw,
    amount: optStr(value, "amount") ?? "",
    recipientName: optStr(value, "recipient_name"),
    bank: optStr(value, "bank"),
    country: optStr(value, "country"),
  };
};

const httpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};

const readNextAction = (data: Json): NextAction | null | undefined => {
  if (!("next_action" in data) || data.next_action === undefined) return undefined;
  const value = data.next_action;
  if (!isObject(value)) return null;
  switch (value.type) {
    case "show_requisites": {
      const frame = isObject(value.frame) ? value.frame : null;
      return {
        type: "show_requisites",
        requisites: readRequisites(value.requisites),
        frame: frame
          ? {
              origins: strList(frame.origins),
              path: safeFramePath(frame.path),
            }
          : null,
      };
    }
    case "redirect": {
      const url = httpsUrl(value.url);
      return url ? { type: "redirect", url } : null;
    }
    case "qr": {
      const payload = optStr(value, "payload");
      const imageUrl = httpsUrl(value.image_url);
      return payload || imageUrl ? { type: "qr", payload, imageUrl } : null;
    }
    default:
      return null;
  }
};

const readCryptoDeposit = (data: Json): CryptoDeposit => ({
  id: str(data, "id"),
  kind: "crypto",
  chainId: str(data, "chain_id"),
  currency: str(data, "currency"),
  address: str(data, "address"),
  status: oneOf<CryptoDepositStatus>(data.status, CRYPTO_STATUSES, "closed"),
  expiresAt: optNum(data, "expires_at"),
  createdAt: optNum(data, "created_at") ?? 0,
});

const readFiatDeposit = (data: Json): FiatDeposit => {
  const receipt = isObject(data.receipt) ? data.receipt : {};
  const rail = strictOneOf<FiatRail>(data.rail, RAILS, "rail");
  return {
    id: str(data, "id"),
    kind: "fiat",
    rail,
    methodId: str(data, "method_id"),
    status: oneOf<FiatDepositStatus>(data.status, FIAT_STATUSES, "pending"),
    amount: optStr(data, "amount"),
    currency: str(data, "currency"),
    estimatedUsd: optStr(data, "estimated_usd"),
    creditedUsd: optStr(data, "credited_usd"),
    expiresAt: optNum(data, "expires_at"),
    serverTime: optNum(data, "server_time"),
    nextAction: readNextAction(data),
    receipt: {
      required: receipt.required === true,
      attachedAt: optNum(receipt, "attached_at"),
    },
    createdAt: optNum(data, "created_at"),
    updatedAt: optNum(data, "updated_at") ?? optNum(data, "created_at"),
  };
};

export const readCryptoDepositResponse = (value: unknown): CryptoDeposit => {
  const data = asObject(value, "deposit");
  if (data.kind !== undefined && data.kind !== "crypto") throw invalid("kind");
  return readCryptoDeposit(data);
};

export const readFiatDepositResponse = (value: unknown): FiatDeposit => {
  const data = asObject(value, "deposit");
  if (data.kind !== "fiat") throw invalid("kind");
  return readFiatDeposit(data);
};

export const readDeposit = (value: unknown): Deposit => {
  const data = asObject(value, "deposit");
  if (data.kind === "crypto") return readCryptoDeposit(data);
  if (data.kind === "fiat") return readFiatDeposit(data);
  throw invalid("kind");
};

export const toCreateDepositBody = (
  input: CreateDepositInput,
): WireCreateDepositBody => ({
  method_id: input.methodId,
  amount: input.amount,
  ...(input.customerPhone ? { customer_phone: input.customerPhone } : {}),
  ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
});

export const toReceiptBody = (dataUrl: string): { file_base64: string } => ({
  file_base64: dataUrl,
});

export const readFrameTicket = (value: unknown): FrameTicket => {
  const data = asObject(value, "frame ticket");
  const ticket = str(data, "ticket");
  if (!ticket.startsWith(FRAME_TICKET_PREFIX)) throw invalid("ticket");
  return {
    ticket,
    expiresIn: optNum(data, "expires_in") ?? 60,
    expiresAt: optNum(data, "expires_at"),
    frameOrigins: strList(data.frame_origins),
    framePath: typeof data.frame_path === "string" ? safeFramePath(data.frame_path) : null,
  };
};

export const toOnrampQuery = (input: {
  theme?: PayTheme;
}): Record<string, string> => (input.theme ? { theme: input.theme } : {});

export const readOnramp = (value: unknown): { url: string } => {
  const data = asObject(value, "onramp");
  return { url: str(data, "url") };
};

export const toQuoteWithdrawalBody = (
  input: QuoteWithdrawalInput,
): WireQuoteWithdrawalBody => ({
  method_id: input.methodId,
  address: input.address,
  amount: input.amount,
  ...(input.acceptSlippagePct !== undefined
    ? { accept_slippage_pct: input.acceptSlippagePct }
    : {}),
});

export const toCreateWithdrawalBody = (
  input: CreateWithdrawalInput,
): WireCreateWithdrawalBody => ({
  ...toQuoteWithdrawalBody(input),
  ...(input.quote
    ? {
        quote: {
          fee_usd: input.quote.feeUsd,
          receive_amount: input.quote.receiveAmount,
          receive_amount_usd: input.quote.receiveAmountUsd,
          eta_seconds: input.quote.etaSeconds,
          slippage_pct: input.quote.slippagePct,
        },
      }
    : {}),
  ...(input.twoFactorCode ? { two_factor_code: input.twoFactorCode } : {}),
});

export const readWithdrawalQuote = (value: unknown): WithdrawalQuoteResult => {
  const data = asObject(value, "withdrawal quote");
  if (isObject(data.quote)) {
    const quote = data.quote;
    return {
      quote: {
        feeUsd: optStr(quote, "fee_usd"),
        receiveAmount: optStr(quote, "receive_amount"),
        receiveAmountUsd: optStr(quote, "receive_amount_usd"),
        etaSeconds: optNum(quote, "eta_seconds"),
        slippagePct: optStr(quote, "slippage_pct"),
      },
      slippageWarning: null,
    };
  }
  const warning = asObject(data.slippage_warning, "slippage_warning");
  return {
    quote: null,
    slippageWarning: {
      slippagePct: optStr(warning, "slippage_pct"),
      maxAllowedPct: optStr(warning, "max_allowed_pct"),
      receiveAmount: optStr(warning, "receive_amount"),
      receiveAmountUsd: optStr(warning, "receive_amount_usd"),
    },
  };
};

const readWithdrawalStatus = (value: unknown): WithdrawalStatus =>
  oneOf<WithdrawalStatus>(value, WITHDRAWAL_STATUSES, "pending");

export const readWithdrawal = (value: unknown): Withdrawal => {
  const data = asObject(value, "withdrawal");
  return {
    id: str(data, "id"),
    paymentId: optNum(data, "payment_id"),
    status: readWithdrawalStatus(data.status),
    displayStatus: oneOf<DisplayStatus>(
      data.display_status,
      DISPLAY_STATUSES,
      "pending",
    ),
    amountUsd: optStr(data, "amount_usd"),
    feeUsd: optStr(data, "fee_usd"),
    receiveAmount: optStr(data, "receive_amount"),
    receiveAmountUsd: optStr(data, "receive_amount_usd"),
    chainId: optStr(data, "chain_id"),
    currency: optStr(data, "currency"),
    address: optStr(data, "address"),
    destinationTxHash: optStr(data, "destination_tx_hash"),
    etaSeconds: optNum(data, "eta_seconds"),
    createdAt: optNum(data, "created_at") ?? 0,
    updatedAt: optNum(data, "updated_at") ?? optNum(data, "created_at") ?? 0,
  };
};

export const toActivityQuery = (since: number): Record<string, string> => ({
  since: String(Math.max(0, Math.floor(since))),
});

export const readActivity = (value: unknown): PayActivity => {
  const data = asObject(value, "activity");
  const deposits: CreditedDeposit[] = [];
  const withdrawals: WithdrawalActivity[] = [];
  if (Array.isArray(data.deposits)) {
    for (const entry of data.deposits) {
      if (!isObject(entry)) continue;
      const paymentId = optNum(entry, "payment_id");
      const creditedAt = optNum(entry, "credited_at");
      if (paymentId === null || creditedAt === null) continue;
      deposits.push({
        paymentId,
        amountUsd: optStr(entry, "amount_usd"),
        source: oneOf<DepositSource>(entry.source, DEPOSIT_SOURCES, "other"),
        creditedAt,
      });
    }
  }
  if (Array.isArray(data.withdrawals)) {
    for (const entry of data.withdrawals) {
      if (!isObject(entry)) continue;
      const paymentId = optNum(entry, "payment_id");
      const id = optStr(entry, "id");
      if (paymentId === null || !id) continue;
      withdrawals.push({
        paymentId,
        id,
        status: readWithdrawalStatus(entry.status),
        updatedAt: optNum(entry, "updated_at") ?? 0,
      });
    }
  }
  return { serverTime: num(data, "server_time"), deposits, withdrawals };
};

export const REQUISITES_FRAME_MESSAGES = {
  ready: "binodex-embed:ready",
  resize: "binodex-embed:resize",
  receiptAttached: "binodex-embed:receipt-attached",
  error: "binodex-embed:error",
  init: "binodex-embed:requisites-init",
} as const;

export const requisitesInitMessage = (input: {
  ticket: string;
  depositId: string;
  channel: string;
}): { type: string; ticket: string; deposit_id: string; channel: string } => ({
  type: REQUISITES_FRAME_MESSAGES.init,
  ticket: input.ticket,
  deposit_id: input.depositId,
  channel: input.channel,
});

export const requisitesFrameUrl = (input: {
  origin: string;
  path?: string;
  depositId: string;
  channel: string;
  lang?: string;
  theme?: PayTheme;
  skin?: AppearanceSkin;
}): string => {
  const url = new URL(safeFramePath(input.path), input.origin);
  url.searchParams.set("deposit", input.depositId);
  if (input.lang) url.searchParams.set("lang", input.lang);
  if (input.theme) url.searchParams.set("theme", input.theme);
  if (input.skin && input.theme !== "light") url.searchParams.set("skin", input.skin);
  url.hash = new URLSearchParams({ channel: input.channel }).toString();
  return url.toString();
};

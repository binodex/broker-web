export const SERVER_ERROR_CODES = [
  "UNAUTHENTICATED",
  "ORIGIN_MISMATCH",
  "MODE_NOT_ALLOWED",
  "PAY_API_DISABLED",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "METHOD_UNAVAILABLE",
  "AMOUNT_TOO_SMALL",
  "AMOUNT_TOO_LARGE",
  "INVALID_ADDRESS",
  "UNSUPPORTED_ROUTE",
  "SELF_WALLET",
  "RECIPIENT_BLOCKED",
  "INSUFFICIENT_BALANCE",
  "WITHDRAWALS_RESTRICTED",
  "ACCOUNT_FROZEN",
  "WITHDRAWAL_IN_PROGRESS",
  "TWO_FA_REQUIRED",
  "TWO_FA_INVALID",
  "TWO_FA_REUSED",
  "TWO_FA_LOCKED",
  "DAILY_CAP",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_IN_PROGRESS",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export const CLIENT_ERROR_CODES = [
  "SESSION_FAILED",
  "PAY_API_UNAVAILABLE",
  "INVALID_API_BASE",
  "HOST_UNREACHABLE",
  "NETWORK_ERROR",
  "INVALID_RESPONSE",
  "REQUISITES_FRAME_UNAVAILABLE",
  "UNKNOWN",
] as const;

export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type PayErrorCode = ServerErrorCode | ClientErrorCode;

export interface PayErrorDetails {
  field?: string;
  min?: string;
  max?: string;
  currency?: string;
  retryAfterSeconds?: number;
  withdrawalId?: string;
}

const SERVER_CODES: ReadonlySet<string> = new Set(SERVER_ERROR_CODES);

export const isServerErrorCode = (value: unknown): value is ServerErrorCode =>
  typeof value === "string" && SERVER_CODES.has(value);

export class PayError extends Error {
  readonly code: PayErrorCode;
  readonly status: number | null;
  readonly details: PayErrorDetails;

  constructor(
    code: PayErrorCode,
    message: string = code,
    options: { status?: number | null; details?: PayErrorDetails } = {},
  ) {
    super(message);
    this.name = "PayError";
    this.code = code;
    this.status = options.status ?? null;
    this.details = options.details ?? {};
  }
}

export const isPayError = (value: unknown): value is PayError =>
  value instanceof PayError;

export const isAbortError = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as { name?: unknown }).name === "AbortError";

export const toPayError = (value: unknown): PayError => {
  if (value instanceof PayError) return value;
  return new PayError(
    "UNKNOWN",
    value instanceof Error && value.message ? value.message : "Unknown error",
  );
};

const FALLBACK_BY_STATUS: Record<number, ServerErrorCode> = {
  400: "VALIDATION_FAILED",
  401: "UNAUTHENTICATED",
  403: "MODE_NOT_ALLOWED",
  404: "NOT_FOUND",
  409: "IDEMPOTENCY_IN_PROGRESS",
  413: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

export const codeForStatus = (status: number): PayErrorCode =>
  FALLBACK_BY_STATUS[status] ??
  (status === 502 || status === 503 || status === 504
    ? "PROVIDER_UNAVAILABLE"
    : status >= 500
      ? "INTERNAL_ERROR"
      : "UNKNOWN");

const RETRYABLE: ReadonlySet<PayErrorCode> = new Set<PayErrorCode>([
  "NETWORK_ERROR",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL_ERROR",
  "RATE_LIMITED",
  "IDEMPOTENCY_IN_PROGRESS",
  "HOST_UNREACHABLE",
  "SESSION_FAILED",
  "REQUISITES_FRAME_UNAVAILABLE",
  "UNKNOWN",
]);

export const isRetryable = (error: PayError): boolean =>
  RETRYABLE.has(error.code);

export const FALLBACK_CODES: ReadonlySet<PayErrorCode> = new Set<PayErrorCode>(
  ["PAY_API_UNAVAILABLE", "PAY_API_DISABLED"],
);

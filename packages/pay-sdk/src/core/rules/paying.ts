import type { MessageKey } from "../i18n/index.js";
import type { RequisitesKind } from "./requisites.js";

export type PayStatusTone = "pending" | "completed" | "failed";

export const FINAL_STATES: readonly string[] = ["completed", "failed", "expired"];

export const SUCCESS_STATES: readonly string[] = ["completed", "credited", "success"];

export const statusTone = (status: string): PayStatusTone => {
  if (SUCCESS_STATES.includes(status)) return "completed";
  if (status === "failed" || status === "expired") return "failed";
  return "pending";
};

// Without a provider deadline paymeta keeps a one-day fallback; a "1439:59" countdown would read as a promise.
export const COUNTDOWN_MAX_MS = 60 * 60_000;

const toMs = (value: number | string | null | undefined): number =>
  typeof value === "number" ? value : typeof value === "string" ? new Date(value).getTime() : Number.NaN;

export const showsCountdown = (expiresAt: number | string | null | undefined, nowMs: number): boolean => {
  const ms = toMs(expiresAt) - nowMs;
  return Number.isFinite(ms) && ms <= COUNTDOWN_MAX_MS;
};

export const formatExpires = (expiresAt: number | string | null | undefined, nowMs: number): string => {
  const ms = toMs(expiresAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const PAY_TO_LABEL: Record<RequisitesKind, MessageKey> = {
  upi: "fiat.payToUpi",
  card: "fiat.payToCard",
  phone: "fiat.payToPhone",
  account: "fiat.payToAccount",
};

export const payToLabelKey = (kind: RequisitesKind): MessageKey => PAY_TO_LABEL[kind];

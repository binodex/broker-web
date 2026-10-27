import { createIdempotencyKey } from "./client.js";
import { isAbortError, isPayError } from "./errors.js";

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
};

export const canonicalBody = (body: unknown): string => JSON.stringify(canonical(body ?? null));

const KEEP_CODES: ReadonlySet<string> = new Set([
  "NETWORK_ERROR",
  "HOST_UNREACHABLE",
  "IDEMPOTENCY_IN_PROGRESS",
]);

export const keepsIntentKey = (error: unknown): boolean => {
  if (isAbortError(error) || !isPayError(error)) return true;
  if (KEEP_CODES.has(error.code)) return true;
  return error.status !== null && error.status >= 500;
};

export interface IntentKeys {
  keyFor: (body: unknown) => string;
  settle: (outcome: { ok: true } | { ok: false; error: unknown }) => void;
  reset: () => void;
}

export const createIntentKeys = (): IntentKeys => {
  let held: { fingerprint: string; key: string } | null = null;
  return {
    keyFor: (body) => {
      const fingerprint = canonicalBody(body);
      if (!held || held.fingerprint !== fingerprint) {
        held = { fingerprint, key: createIdempotencyKey() };
      }
      return held.key;
    },
    settle: (outcome) => {
      if (outcome.ok || !keepsIntentKey(outcome.error)) held = null;
    },
    reset: () => {
      held = null;
    },
  };
};

import type { PayPart, PayStatus } from "./types.js";

export const PART_ATTRIBUTE = "data-binodex-pay";

export const REQUIRED_PARTS: readonly PayPart[] = ["frame"];

const PART_NAMES: ReadonlySet<string> = new Set<PayPart>([
  "frame",
  "trigger",
  "close",
  "loader",
  "status",
]);

const LOADING_STATUSES: ReadonlySet<PayStatus> = new Set<PayStatus>([
  "idle",
  "session",
  "loading",
]);

export const isPayPart = (value: unknown): value is PayPart =>
  typeof value === "string" && PART_NAMES.has(value);

export const isLoadingStatus = (status: PayStatus): boolean =>
  LOADING_STATUSES.has(status);

export const missingParts = (
  isPresent: (part: PayPart) => boolean,
  required: readonly PayPart[] = [],
): PayPart[] =>
  Array.from(new Set([...REQUIRED_PARTS, ...required])).filter(
    (part) => !isPresent(part),
  );

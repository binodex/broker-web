const PREFIX = "binodex-embed:";
const REASON_PATTERN = /^[a-z0-9_]{1,64}$/;
const ASSET_PATTERN = /^[A-Z0-9]{2,16}$/;

export type WidgetEvent =
  | { type: "ready" }
  | { type: "reauth-required" }
  | { type: "close" }
  | { type: "credited"; amount: number; asset: string }
  | { type: "error"; reason: string }
  | { type: "resize"; height: number };

export interface WidgetEnvelope {
  event: WidgetEvent;
  channel: string | null;
}

export type InitMessage =
  | { type: "binodex-embed:init"; session: string }
  | { type: "binodex-embed:init"; session: string; channel: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const readEvent = (
  name: string,
  data: Record<string, unknown>,
): WidgetEvent | null => {
  switch (name) {
    case "ready":
    case "reauth-required":
    case "close":
      return { type: name };
    case "resize":
      return isPositiveNumber(data.height)
        ? { type: "resize", height: data.height }
        : null;
    case "credited":
      return isPositiveNumber(data.amount) &&
        typeof data.asset === "string" &&
        ASSET_PATTERN.test(data.asset)
        ? { type: "credited", amount: data.amount, asset: data.asset }
        : null;
    case "error":
      return {
        type: "error",
        reason:
          typeof data.message === "string" && REASON_PATTERN.test(data.message)
            ? data.message
            : "unknown",
      };
    default:
      return null;
  }
};

export const readWidgetMessage = (data: unknown): WidgetEnvelope | null => {
  if (!isPlainObject(data)) return null;
  const { type, channel } = data;
  if (typeof type !== "string" || !type.startsWith(PREFIX)) return null;
  if (channel !== undefined && typeof channel !== "string") return null;
  const event = readEvent(type.slice(PREFIX.length), data);
  if (!event) return null;
  return { event, channel: typeof channel === "string" ? channel : null };
};

export const initMessage = (
  session: string,
  channel: string | null,
): InitMessage =>
  channel
    ? { type: "binodex-embed:init", session, channel }
    : { type: "binodex-embed:init", session };

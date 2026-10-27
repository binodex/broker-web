import { trimNumber } from "../money.js";

export interface NativeBounds {
  minNative?: string | null;
  maxNative?: string | null;
  minUsd: string;
}

const present = (value: string | null | undefined): value is string =>
  value !== null && value !== undefined && value !== "";

const native = (value: string, currency: string) => `${trimNumber(value)} ${currency}`;

export const formatMinLimit = (bounds: NativeBounds, currency: string): string =>
  present(bounds.minNative) ? native(bounds.minNative, currency) : `$${Number(bounds.minUsd).toFixed(2)}`;

export type NativeRange =
  | { kind: "range"; text: string }
  | { kind: "from"; amount: string }
  | { kind: "upTo"; amount: string };

export const formatNativeRange = (bounds: NativeBounds, currency: string): NativeRange | null => {
  const hasMin = present(bounds.minNative);
  const hasMax = present(bounds.maxNative);
  if (hasMin && hasMax) {
    return {
      kind: "range",
      text: `${trimNumber(bounds.minNative as string)}–${native(bounds.maxNative as string, currency)}`,
    };
  }
  if (hasMin) return { kind: "from", amount: native(bounds.minNative as string, currency) };
  if (hasMax) return { kind: "upTo", amount: native(bounds.maxNative as string, currency) };
  return null;
};

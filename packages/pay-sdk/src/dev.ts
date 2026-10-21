import type { PayPart } from "./types.js";

declare const process: { env: Record<string, string | undefined> };

const isProduction = (): boolean => {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    return false;
  }
};

export const warnMissingParts = (
  owner: string,
  missing: readonly PayPart[],
): void => {
  if (isProduction()) return;
  const names = missing.map((part) => `"${part}"`).join(", ");
  const noun = missing.length === 1 ? "part" : "parts";
  console.warn(
    `[@binopartner/pay-sdk] ${owner} rendered nothing: missing required ${noun} ${names}. ` +
      "Render every required part unconditionally inside the root.",
  );
};

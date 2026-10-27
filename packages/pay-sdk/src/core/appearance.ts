import type { Branding } from "./types.js";

export const TOKEN_NAMES = [
  "font-family",
  "font-family-mono",
  "font-size-xs",
  "font-size-sm",
  "font-size-md",
  "font-size-lg",
  "font-weight-regular",
  "font-weight-medium",
  "font-weight-bold",
  "line-height",
  "color-bg",
  "color-surface",
  "color-surface-raised",
  "color-text",
  "color-text-muted",
  "color-border",
  "color-accent",
  "color-on-accent",
  "color-success",
  "color-warning",
  "color-danger",
  "color-focus",
  "radius-sm",
  "radius-md",
  "radius-lg",
  "radius-pill",
  "border-width",
  "space-1",
  "space-2",
  "space-3",
  "space-4",
  "space-5",
  "space-6",
  "control-height",
  "shadow",
  "transition",
  "color-surface-2",
  "color-surface-hover",
  "color-skeleton",
  "color-veil",
  "color-border-strong",
  "color-accent-text",
  "color-overlay",
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

export type AppearanceTheme = "light" | "dark" | "auto";

export type AppearanceSkin = "classic" | "black";

export interface Appearance {
  theme?: AppearanceTheme;
  skin?: AppearanceSkin;
  variables?: Partial<Record<TokenName, string>>;
}

export const resolveSkin = (appearance: Appearance | undefined): AppearanceSkin =>
  appearance?.skin === "black" ? "black" : "classic";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TOKEN_SET: ReadonlySet<string> = new Set(TOKEN_NAMES);
const UNSAFE_VALUE = /[;{}<>\\]|url\s*\(|expression\s*\(/i;

export const safeColor = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
};

export const safeBackground = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "transparent") return trimmed;
  return HEX_COLOR.test(trimmed) ? trimmed : null;
};

export const safeImageUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
};

export const readableOn = (color: string | null): string => {
  if (!color) return "#0b0d11";
  const raw = color.slice(1);
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((value) => value + value)
          .join("")
      : raw.slice(0, 6);
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if (![red, green, blue].every(Number.isFinite)) return "#0b0d11";
  return (red * 299 + green * 587 + blue * 114) / 1000 > 150 ? "#0b0d11" : "#ffffff";
};

export const resolveTheme = (
  appearance: Appearance | undefined,
  branding: Branding | null | undefined,
): AppearanceTheme => appearance?.theme ?? branding?.theme ?? "auto";

export const themeVariables = (
  branding: Branding | null | undefined,
  appearance: Appearance | undefined,
): Record<string, string> => {
  const vars: Record<string, string> = {};
  const accent = safeColor(branding?.accentColor);
  if (accent) {
    vars["--bp-color-accent"] = accent;
    vars["--bp-color-on-accent"] = readableOn(accent);
  }
  const background = safeBackground(branding?.backgroundColor);
  if (background) vars["--bp-color-bg"] = background;
  const overrides = appearance?.variables ?? {};
  for (const [name, value] of Object.entries(overrides)) {
    if (!TOKEN_SET.has(name) || typeof value !== "string") continue;
    if (!value.trim() || UNSAFE_VALUE.test(value)) continue;
    vars[`--bp-${name}`] = value.trim();
  }
  if (overrides["color-accent"] && !overrides["color-on-accent"]) {
    const custom = safeColor(overrides["color-accent"]);
    if (custom) vars["--bp-color-on-accent"] = readableOn(custom);
  }
  const ink = vars["--bp-color-on-accent"];
  if (ink) {
    vars["--bp-accent-ink"] = ink;
    vars["--bp-accent-ink-withdraw"] = ink;
    vars["--bp-accent-ink-trade"] = ink;
  }
  return vars;
};

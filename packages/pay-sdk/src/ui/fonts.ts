import { cssString, resolveBaseUrl, safeBaseUrl } from "./urls.js";

export const DEFAULT_FONT_BASE_URL = "https://binodex.app/fonts";

export const FONT_FAMILY_STACK = '"Gilroy", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const WEIGHTS = [
  [400, "Regular"],
  [500, "Medium"],
  [600, "SemiBold"],
  [700, "Bold"],
] as const;

export const fontFaceCss = (baseUrl: string = DEFAULT_FONT_BASE_URL): string => {
  const base = resolveBaseUrl("fontFaceCss baseUrl", baseUrl, DEFAULT_FONT_BASE_URL);
  return WEIGHTS.map(
    ([weight, name]) =>
      `@font-face{font-family:"Gilroy";src:url(${cssString(`${base}/Gilroy-${name}.woff2`)}) format("woff2");font-weight:${weight};font-style:normal;font-display:swap;}`,
  ).join("\n");
};

const registeredFonts = new WeakMap<FontFaceSet, Set<string>>();

export const registerFontFaces = (baseUrls: readonly string[]): void => {
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) return;
  const bases = [...new Set(baseUrls.map((url) => safeBaseUrl(url)).filter((url): url is string => !!url))];
  const key = bases.join(" ");
  const registered = registeredFonts.get(document.fonts) ?? new Set<string>();
  if (!key || registered.has(key)) return;
  registered.add(key);
  registeredFonts.set(document.fonts, registered);
  for (const [weight, name] of WEIGHTS) {
    const source = bases
      .map((base) => `url(${cssString(`${base}/Gilroy-${name}.woff2`)}) format("woff2")`)
      .join(", ");
    document.fonts.add(new FontFace("Gilroy", source, { weight: String(weight), style: "normal", display: "swap" }));
  }
};

declare const process: { env: Record<string, string | undefined> };

const LOOPBACK_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$|\.localhost$/i;

const isProduction = (): boolean => {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    return false;
  }
};

export const warnIgnoredUrl = (option: string, value: string, fallback: string): void => {
  if (isProduction()) return;
  console.warn(
    `[@binopartner/pay-sdk] ${option} ${JSON.stringify(value)} is ignored: use an https URL ` +
      `(http only on localhost). Falling back to ${JSON.stringify(fallback)}.`,
  );
};

export const safeBaseUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname));
  return secure ? url.href.replace(/\/+$/, "") : null;
};

export const resolveBaseUrl = (option: string, value: string | undefined, fallback: string): string => {
  if (value === undefined) return fallback;
  const safe = safeBaseUrl(value);
  if (safe !== null) return safe;
  warnIgnoredUrl(option, value, fallback);
  return fallback;
};

export const cssString = (value: string): string =>
  `"${value.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;

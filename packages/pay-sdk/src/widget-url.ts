import type { PayMode, PayTheme, WidgetSession } from "./types.js";

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/;
const LANG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export interface WidgetLocation {
  src: string;
  origin: string;
}

export interface WidgetLocationInput {
  session: WidgetSession;
  mode: PayMode;
  channel: string;
  clientId?: string;
  platformUrl?: string;
  lang?: string;
  theme?: PayTheme;
  allowedOrigins?: readonly string[];
}

const fallbackUrl = ({
  mode,
  clientId,
  platformUrl,
}: WidgetLocationInput): string | null => {
  if (!clientId || !platformUrl) return null;
  const url = new URL(`${platformUrl.replace(/\/+$/, "")}/embed/pay`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("client_id", clientId);
  return url.toString();
};

const isTransportAllowed = (url: URL): boolean =>
  url.protocol === "https:" ||
  (url.protocol === "http:" && LOOPBACK_HOST.test(url.hostname));

const normalizeOrigins = (entries: readonly string[]): string[] =>
  entries.flatMap((entry) => {
    try {
      const url = new URL(entry);
      return isTransportAllowed(url) ? [url.origin] : [];
    } catch {
      return [];
    }
  });

export const resolveWidgetLocation = (
  input: WidgetLocationInput,
): WidgetLocation | null => {
  try {
    const base = input.session.widget_url || fallbackUrl(input);
    if (!base) return null;
    const url = new URL(base);
    if (!isTransportAllowed(url) || url.username || url.password) return null;
    const declaredOrigin = input.session.widget_origin;
    if (declaredOrigin && declaredOrigin !== url.origin) return null;
    if (
      input.allowedOrigins &&
      !normalizeOrigins(input.allowedOrigins).includes(url.origin)
    ) {
      return null;
    }
    if (input.lang && LANG_PATTERN.test(input.lang)) {
      url.searchParams.set("lang", input.lang);
    }
    if (input.theme === "light" || input.theme === "dark") {
      url.searchParams.set("theme", input.theme);
    }
    url.hash = new URLSearchParams({ channel: input.channel }).toString();
    return { src: url.toString(), origin: url.origin };
  } catch {
    return null;
  }
};

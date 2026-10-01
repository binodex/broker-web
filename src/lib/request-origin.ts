import { isIP } from "node:net";

const TUNNEL_HOST = /^[a-z0-9-]+\.trycloudflare\.com$/i;

function firstHeader(request: Request, name: string) {
  return (request.headers.get(name) || "").split(",")[0].trim();
}

export function requestPublicOrigin(request: Request): string {
  const forwardedHost = firstHeader(request, "x-forwarded-host");
  const host =
    forwardedHost || firstHeader(request, "host") || new URL(request.url).host;
  const hostName = host.split(":")[0];
  const forwardedProto = firstHeader(request, "x-forwarded-proto");
  const proto =
    forwardedProto ||
    (TUNNEL_HOST.test(hostName)
      ? "https"
      : new URL(request.url).protocol.replace(":", ""));
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function requestRedirectUri(request: Request): string {
  return `${requestPublicOrigin(request)}/auth/callback`;
}

export function requestClientIp(request: Request): string | null {
  const candidate =
    firstHeader(request, "cf-connecting-ip") ||
    firstHeader(request, "x-real-ip") ||
    firstHeader(request, "x-forwarded-for");
  return candidate && isIP(candidate) ? candidate : null;
}

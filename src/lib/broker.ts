import { brokerServerEnv } from "@/lib/env";
import type { BrokerErrorBody } from "@/lib/types";

export class BrokerApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function brokerFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { apiUrl } = brokerServerEnv();
  const { token, headers, ...rest } = init;
  const res = await fetch(`${apiUrl}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as T & BrokerErrorBody;
  if (!res.ok) {
    throw new BrokerApiError(
      data?.error?.message || `Broker API ${res.status}`,
      res.status,
      data?.error?.details,
    );
  }
  return data as T;
}

export function jsonError(error: unknown, fallback = 500) {
  if (error instanceof BrokerApiError) {
    return Response.json(
      { error: { message: error.message, details: error.details } },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : "Internal error";
  if (message.startsWith("Missing ")) {
    return Response.json(
      { error: { message: "Internal error" } },
      { status: fallback },
    );
  }
  return Response.json({ error: { message } }, { status: fallback });
}

export function notConfiguredResponse() {
  return Response.json(
    { error: { message: "Sign-in is temporarily unavailable" } },
    { status: 503 },
  );
}

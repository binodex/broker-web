import { PaySdkError, SESSION_FAILED_MESSAGE } from "./errors.js";
import type { CreateSession, PayMode, WidgetSession } from "./types.js";

const SESSION_PATTERN = /^[\x21-\x7e]{1,1024}$/;
const REUSE_LIMIT_MS = 45_000;
const REUSE_HEADROOM_MS = 15_000;

export interface SessionSource {
  mode: PayMode;
  sessionEndpoint?: string;
  createSession?: CreateSession;
}

export interface HeldSession {
  session: string;
  reusableUntil: number;
}

export const isWidgetSession = (value: unknown): value is WidgetSession => {
  if (!value || typeof value !== "object") return false;
  const { session, expires_in, widget_url, widget_origin } = value as Record<
    string,
    unknown
  >;
  return (
    typeof session === "string" &&
    SESSION_PATTERN.test(session) &&
    (expires_in === undefined || typeof expires_in === "number") &&
    (widget_url === undefined ||
      widget_url === null ||
      typeof widget_url === "string") &&
    (widget_origin === undefined ||
      widget_origin === null ||
      typeof widget_origin === "string")
  );
};

const readServerMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const { error, message } = data as { error?: unknown; message?: unknown };
  const nested =
    error && typeof error === "object"
      ? (error as { message?: unknown }).message
      : error;
  const text =
    typeof nested === "string"
      ? nested
      : typeof message === "string"
        ? message
        : "";
  return text ? text.slice(0, 300) : null;
};

const postSessionEndpoint = async (
  endpoint: string,
  mode: PayMode,
  signal: AbortSignal,
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new PaySdkError("session_failed", SESSION_FAILED_MESSAGE);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PaySdkError(
      "session_failed",
      readServerMessage(data) ?? SESSION_FAILED_MESSAGE,
    );
  }
  return data;
};

export const requestSession = async (
  source: SessionSource,
  signal: AbortSignal,
): Promise<WidgetSession> => {
  let data: unknown;
  try {
    if (source.createSession) {
      data = await source.createSession({ mode: source.mode, signal });
    } else if (source.sessionEndpoint) {
      data = await postSessionEndpoint(
        source.sessionEndpoint,
        source.mode,
        signal,
      );
    } else {
      throw new PaySdkError(
        "session_failed",
        "Pass sessionEndpoint or createSession",
      );
    }
  } catch (error) {
    if (error instanceof PaySdkError || signal.aborted) throw error;
    throw new PaySdkError(
      "session_failed",
      error instanceof Error && error.message
        ? error.message
        : SESSION_FAILED_MESSAGE,
    );
  }
  if (!isWidgetSession(data)) {
    throw new PaySdkError(
      "session_failed",
      readServerMessage(data) ?? SESSION_FAILED_MESSAGE,
    );
  }
  return data;
};

export const holdSession = (
  session: WidgetSession,
  now: number,
): HeldSession => {
  const ttl =
    typeof session.expires_in === "number" && session.expires_in > 0
      ? session.expires_in * 1000 - REUSE_HEADROOM_MS
      : REUSE_LIMIT_MS;
  return {
    session: session.session,
    reusableUntil: now + Math.max(0, Math.min(REUSE_LIMIT_MS, ttl)),
  };
};

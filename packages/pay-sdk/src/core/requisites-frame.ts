import { createChannel } from "../channel.js";
import { defaultTimers, type Timers } from "./api-base.js";
import { PayError, isAbortError, toPayError } from "./errors.js";
import type { AppearanceSkin } from "./appearance.js";
import type { FrameTicket, PayTheme } from "./types.js";
import {
  REQUISITES_FRAME_MESSAGES,
  requisitesFrameUrl,
  requisitesInitMessage,
} from "./wire.js";

export const FRAME_READY_TIMEOUT_MS = 6000;
export const FRAME_MAX_REFRESHES = 3;
export const FRAME_REFRESH_BACKOFF_MS = 1000;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 900;
const REASON = /^[a-z0-9_]{1,64}$/;

export type RequisitesFrameStatus = "loading" | "ready" | "unavailable";

export interface RequisitesFrameOptions {
  depositId: string;
  origins: readonly string[];
  path?: string;
  getTicket: (signal: AbortSignal) => Promise<FrameTicket>;
  lang?: string;
  theme?: PayTheme;
  skin?: AppearanceSkin;
  title?: string;
  readyTimeoutMs?: number;
  timers?: Timers;
  onStatus: (status: RequisitesFrameStatus, error: PayError | null) => void;
  onResize?: (height: number) => void;
  onReceiptAttached?: () => void;
  onFrameError?: (reason: string) => void;
  isActive?: () => boolean;
  maxRefreshes?: number;
  refreshBackoffMs?: number;
}

export interface RequisitesFrameHandle {
  retry: () => void;
  destroy: () => void;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
};

export const runRequisitesFrame = (
  container: HTMLElement,
  options: RequisitesFrameOptions,
): RequisitesFrameHandle => {
  const timers = options.timers ?? defaultTimers;
  const timeoutMs = options.readyTimeoutMs ?? FRAME_READY_TIMEOUT_MS;
  let frame: HTMLIFrameElement | null = null;
  let origin = "";
  let channel = "";
  let timer: unknown = null;
  let ticketController: AbortController | null = null;
  let destroyed = false;
  let attempt = 0;
  let initialized = false;
  let refreshes = 0;
  let refreshTimer: unknown = null;

  const clearTimer = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const clearRefresh = () => {
    if (refreshTimer !== null) timers.clearTimeout(refreshTimer);
    refreshTimer = null;
  };

  const teardownFrame = () => {
    clearTimer();
    clearRefresh();
    ticketController?.abort();
    ticketController = null;
    window.removeEventListener("message", onMessage);
    frame?.remove();
    frame = null;
    initialized = false;
  };

  const unavailable = (error?: PayError) => {
    teardownFrame();
    options.onStatus(
      "unavailable",
      error ?? new PayError("REQUISITES_FRAME_UNAVAILABLE", "The requisites frame did not load"),
    );
  };

  const sendInit = async () => {
    if (initialized || !frame) return;
    initialized = true;
    const controller = new AbortController();
    ticketController = controller;
    try {
      const ticket = await options.getTicket(controller.signal);
      const target = frame?.contentWindow;
      if (destroyed || controller.signal.aborted || !target) return;
      if (ticket.frameOrigins.length > 0 && !ticket.frameOrigins.includes(origin)) {
        unavailable();
        return;
      }
      target.postMessage(
        requisitesInitMessage({ ticket: ticket.ticket, depositId: options.depositId, channel }),
        origin,
      );
      options.onStatus("ready", null);
    } catch (error) {
      if (destroyed || controller.signal.aborted || isAbortError(error)) return;
      unavailable(toPayError(error));
    }
  };

  function onMessage(event: MessageEvent) {
    if (destroyed || !frame) return;
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    const data: unknown = event.data;
    if (!isPlainObject(data) || data.channel !== channel) return;
    switch (data.type) {
      case REQUISITES_FRAME_MESSAGES.ready:
        clearTimer();
        void sendInit();
        return;
      case REQUISITES_FRAME_MESSAGES.resize: {
        const height = data.height;
        if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) return;
        const clamped = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(height)));
        frame.style.height = `${clamped}px`;
        if (initialized) refreshes = 0;
        options.onResize?.(clamped);
        return;
      }
      case REQUISITES_FRAME_MESSAGES.receiptAttached:
        options.onReceiptAttached?.();
        return;
      case REQUISITES_FRAME_MESSAGES.error: {
        const reason =
          typeof data.message === "string" && REASON.test(data.message) ? data.message : "unknown";
        options.onFrameError?.(reason);
        handleFrameError(reason);
        return;
      }
      default:
        return;
    }
  }

  const tryOrigin = (index: number) => {
    teardownFrame();
    if (destroyed) return;
    const next = options.origins[index];
    if (!next) {
      unavailable();
      return;
    }
    attempt = index;
    origin = next;
    channel = createChannel();
    const element = document.createElement("iframe");
    element.setAttribute("title", options.title ?? "Payment details");
    element.setAttribute("allow", `clipboard-write ${origin}`);
    element.setAttribute("referrerpolicy", "origin");
    element.style.display = "block";
    element.style.width = "100%";
    element.style.height = `${MIN_HEIGHT * 2}px`;
    element.style.border = "0";
    element.style.background = "transparent";
    // A color-scheme mismatch between the iframe element and the framed page makes browsers paint an opaque canvas.
    if (options.theme) element.style.colorScheme = options.theme;
    element.setAttribute(
      "src",
      requisitesFrameUrl({
        origin,
        path: options.path,
        depositId: options.depositId,
        channel,
        lang: options.lang,
        theme: options.theme,
        skin: options.skin,
      }),
    );
    frame = element;
    window.addEventListener("message", onMessage);
    timer = timers.setTimeout(() => {
      timer = null;
      tryOrigin(attempt + 1);
    }, timeoutMs);
    options.onStatus("loading", null);
    container.appendChild(element);
  };

  function handleFrameError(reason: string) {
    if (reason === "invalid_params") {
      tryOrigin(attempt + 1);
      return;
    }
    if (reason !== "ticket_expired") {
      unavailable(
        reason === "rate_limited"
          ? new PayError("RATE_LIMITED", "The requisites frame is rate limited")
          : new PayError("REQUISITES_FRAME_UNAVAILABLE", `The requisites frame failed: ${reason}`),
      );
      return;
    }
    if (options.isActive && !options.isActive()) return;
    if (refreshTimer !== null) return;
    const max = options.maxRefreshes ?? FRAME_MAX_REFRESHES;
    if (refreshes >= max) {
      unavailable();
      return;
    }
    refreshes += 1;
    const delay = (options.refreshBackoffMs ?? FRAME_REFRESH_BACKOFF_MS) * 2 ** (refreshes - 1);
    const reloadAt = attempt;
    refreshTimer = timers.setTimeout(() => {
      refreshTimer = null;
      if (destroyed || (options.isActive && !options.isActive())) return;
      tryOrigin(reloadAt);
    }, delay);
  }

  tryOrigin(0);

  return {
    retry: () => {
      if (destroyed) return;
      refreshes = 0;
      tryOrigin(0);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      teardownFrame();
    },
  };
};

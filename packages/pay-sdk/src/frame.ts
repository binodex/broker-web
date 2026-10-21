import { createChannel } from "./channel.js";
import { PaySdkError, toPayError } from "./errors.js";
import {
  initMessage,
  readWidgetMessage,
  type WidgetEvent,
} from "./protocol.js";
import { holdSession, requestSession, type HeldSession } from "./session.js";
import type {
  CreditedEvent,
  FrameOptions,
  PayError,
  PayStatus,
  PayWidgetOptions,
} from "./types.js";
import { resolveWidgetLocation } from "./widget-url.js";

const DEFAULT_HEIGHTS = { initial: 720, min: 520, max: 900 } as const;
const FRAME_PERMISSIONS = "payment *; clipboard-write *";

export interface FrameEvents {
  status: (status: PayStatus, error: PayError | null) => void;
  height: (height: number) => void;
  credited: (event: CreditedEvent) => void;
  close: () => void;
}

export interface HeightBounds {
  initial: number;
  min: number;
  max: number;
}

const finiteSize = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

const fit = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.ceil(value)));

export const heightBounds = (options: FrameOptions): HeightBounds => {
  const min = finiteSize(options.minHeight) ?? DEFAULT_HEIGHTS.min;
  const max = Math.max(
    min,
    options.maxHeight === Infinity
      ? Infinity
      : (finiteSize(options.maxHeight) ?? DEFAULT_HEIGHTS.max),
  );
  const initial = fit(
    finiteSize(options.initialHeight) ?? DEFAULT_HEIGHTS.initial,
    min,
    max,
  );
  return { initial, min, max };
};

const createFrame = (
  src: string,
  title: string,
  height: number,
): HTMLIFrameElement => {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", title);
  frame.setAttribute("allow", FRAME_PERMISSIONS);
  frame.setAttribute("referrerpolicy", "origin");
  frame.style.display = "block";
  frame.style.width = "100%";
  frame.style.height = `${height}px`;
  frame.style.border = "0";
  frame.style.background = "transparent";
  frame.setAttribute("src", src);
  return frame;
};

export const runPayFrame = (
  container: HTMLElement,
  options: PayWidgetOptions & FrameOptions,
  events: FrameEvents,
): (() => void) => {
  const abort = new AbortController();
  const channel = createChannel();
  const bounds = heightBounds(options);
  let stopped = false;
  let frame: HTMLIFrameElement | null = null;
  let widgetOrigin = "";
  let protocol: 1 | 2 | null = null;
  let held: HeldSession | null = null;
  let initInFlight = false;
  let shown = false;
  let status: PayStatus = "idle";

  const setStatus = (next: PayStatus, error: PayError | null = null) => {
    if (stopped || (next === status && next !== "error")) return;
    status = next;
    events.status(next, error);
  };

  const fail = (error: unknown) => {
    if (stopped || abort.signal.aborted) return;
    setStatus("error", toPayError(error));
  };

  const sendInit = async (reuse: boolean) => {
    if (initInFlight) return;
    initInFlight = true;
    try {
      const candidate = held;
      held = null;
      const session =
        reuse && candidate && candidate.reusableUntil > Date.now()
          ? candidate.session
          : (await requestSession(options, abort.signal)).session;
      const target = frame?.contentWindow;
      if (stopped || !target) return;
      target.postMessage(
        initMessage(session, protocol === 2 ? channel : null),
        widgetOrigin,
      );
    } catch (error) {
      fail(error);
    } finally {
      initInFlight = false;
    }
  };

  const handle = (event: WidgetEvent) => {
    switch (event.type) {
      case "ready":
        shown = false;
        setStatus("handshake");
        void sendInit(true);
        return;
      case "reauth-required":
        shown = false;
        setStatus("handshake");
        void sendInit(false);
        return;
      case "resize": {
        const height = fit(event.height, bounds.min, bounds.max);
        if (frame) frame.style.height = `${height}px`;
        events.height(height);
        if (!shown) {
          shown = true;
          setStatus("ready");
        }
        return;
      }
      case "credited":
        events.credited({ amount: event.amount, asset: event.asset });
        return;
      case "close":
        events.close();
        return;
      case "error":
        setStatus("error", {
          code: "widget_error",
          message: "Payment form is unavailable",
          reason: event.reason,
        });
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (stopped || !frame) return;
    if (event.source !== frame.contentWindow || event.origin !== widgetOrigin) {
      return;
    }
    const envelope = readWidgetMessage(event.data);
    if (!envelope) return;
    if (envelope.channel !== null) {
      if (envelope.channel !== channel) return;
      protocol = 2;
    } else if (protocol === 2 || options.requireChannel) {
      return;
    } else {
      protocol = 1;
    }
    handle(envelope.event);
  };

  const onLoad = () => {
    if (status === "loading") setStatus("handshake");
  };

  events.height(bounds.initial);
  setStatus("session");
  requestSession(options, abort.signal)
    .then((session) => {
      if (stopped) return;
      const location = resolveWidgetLocation({
        session,
        channel,
        mode: options.mode,
        clientId: options.clientId,
        platformUrl: options.platformUrl,
        lang: options.lang,
        theme: options.theme,
      });
      if (!location) {
        throw new PaySdkError(
          "invalid_widget_url",
          "The widget session has no usable widget URL",
        );
      }
      held = holdSession(session, Date.now());
      widgetOrigin = location.origin;
      frame = createFrame(
        location.src,
        options.title || (options.mode === "withdraw" ? "Withdraw" : "Deposit"),
        bounds.initial,
      );
      frame.addEventListener("load", onLoad);
      window.addEventListener("message", onMessage);
      setStatus("loading");
      container.appendChild(frame);
    })
    .catch(fail);

  return () => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    window.removeEventListener("message", onMessage);
    if (frame) {
      frame.removeEventListener("load", onLoad);
      frame.remove();
      frame = null;
    }
    held = null;
  };
};

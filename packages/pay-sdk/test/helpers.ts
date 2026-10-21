import { vi } from "vitest";
import type { WidgetSession } from "../src/types.js";

export const SESSION = `wss_${"a".repeat(43)}`;
export const FRESH_SESSION = `wss_${"b".repeat(43)}`;
export const WIDGET_ORIGIN = "https://pay.example";
export const WIDGET_URL = `${WIDGET_ORIGIN}/embed/pay?mode=deposit&client_id=client-1`;

export const widgetSession = (
  overrides: Partial<WidgetSession> = {},
): WidgetSession => ({
  session: SESSION,
  expires_in: 60,
  widget_url: WIDGET_URL,
  widget_origin: WIDGET_ORIGIN,
  ...overrides,
});

export const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

export const iframeIn = (container: ParentNode): HTMLIFrameElement | null =>
  container.querySelector("iframe");

export const channelOf = (frame: HTMLIFrameElement): string => {
  const src = frame.getAttribute("src") ?? "";
  return new URLSearchParams(new URL(src).hash.slice(1)).get("channel") ?? "";
};

export const fromWidget = (
  frame: HTMLIFrameElement,
  data: unknown,
  init: { origin?: string; source?: MessageEventSource | null } = {},
): void => {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin: init.origin ?? WIDGET_ORIGIN,
      source: init.source === undefined ? frame.contentWindow : init.source,
    }),
  );
};

export const captureInit = (frame: HTMLIFrameElement) => {
  const target = frame.contentWindow;
  if (!target) throw new Error("iframe has no window");
  return vi.spyOn(target, "postMessage").mockImplementation(() => undefined);
};

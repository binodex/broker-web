import { afterEach, describe, expect, it, vi } from "vitest";
import {
  channelOf,
  fromWidget,
  iframeIn,
  settle,
  widgetSession,
} from "../test/helpers.js";
import { mount, type PayWidget } from "./mount.js";
import type { CreateSession } from "./types.js";

const widgets: PayWidget[] = [];

const markup = (parts: string[]) => {
  const root = document.createElement("div");
  for (const name of parts) {
    const element = document.createElement(
      name === "trigger" || name === "close" ? "button" : "div",
    );
    element.setAttribute("data-binodex-pay", name);
    if (name === "loader") element.textContent = "Opening";
    root.append(element);
  }
  document.body.append(root);
  return root;
};

const part = (root: HTMLElement, name: string) =>
  root.querySelector<HTMLElement>(`[data-binodex-pay="${name}"]`);

const keep = (widget: PayWidget | null) => {
  if (widget) widgets.push(widget);
  return widget;
};

afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.destroy());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("mount", () => {
  it("hides the root, warns and creates nothing without a frame part", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const createSession = vi.fn<CreateSession>(async () => widgetSession());
    const root = markup(["trigger", "loader"]);

    const widget = mount(root, { mode: "deposit", createSession });
    await settle();

    expect(widget).toBeNull();
    expect(root.hidden).toBe(true);
    expect(createSession).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'missing required part "frame"',
    );
  });

  it("wires trigger, loader, close and frame parts", async () => {
    const onOpenChange = vi.fn();
    const createSession = vi.fn<CreateSession>(async () => widgetSession());
    const root = markup(["trigger", "loader", "close", "frame"]);

    const widget = keep(
      mount(root, {
        mode: "deposit",
        createSession,
        open: false,
        onOpenChange,
      }),
    );
    const trigger = part(root, "trigger");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(part(root, "close")?.hidden).toBe(true);
    expect(part(root, "loader")?.hidden).toBe(true);
    expect(createSession).not.toHaveBeenCalled();

    trigger?.click();
    await settle();
    const frame = iframeIn(root);
    expect(frame?.parentElement).toBe(part(root, "frame"));
    expect(trigger?.getAttribute("aria-controls")).toBe(
      part(root, "frame")?.id,
    );
    expect(part(root, "loader")?.hidden).toBe(false);
    expect(root.getAttribute("data-status")).toBe("loading");

    if (!frame) throw new Error("no frame");
    fromWidget(frame, {
      type: "binodex-embed:resize",
      height: 600,
      channel: channelOf(frame),
    });
    expect(part(root, "loader")?.hidden).toBe(true);
    expect(widget?.getState()).toEqual({
      open: true,
      status: "ready",
      error: null,
    });

    part(root, "close")?.click();
    expect(iframeIn(root)).toBeNull();
    expect(part(root, "frame")?.hidden).toBe(true);
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it("fills an empty status part with the error message", async () => {
    const root = markup(["status", "frame"]);

    keep(
      mount(root, {
        mode: "deposit",
        createSession: vi.fn(async () =>
          Promise.reject(new Error("Sign in again")),
        ),
      }),
    );
    await settle();

    expect(part(root, "status")?.hidden).toBe(false);
    expect(part(root, "status")?.textContent).toBe("Sign in again");
  });

  it("closes when the widget asks and stays inert after destroy", async () => {
    const onOpenChange = vi.fn();
    const createSession = vi.fn<CreateSession>(async () => widgetSession());
    const root = markup(["frame"]);
    const widget = keep(
      mount(root, { mode: "deposit", createSession, onOpenChange }),
    );
    await settle();
    const frame = iframeIn(root);
    if (!frame) throw new Error("no frame");

    fromWidget(frame, {
      type: "binodex-embed:close",
      channel: channelOf(frame),
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(iframeIn(root)).toBeNull();

    widget?.destroy();
    widget?.open();
    await settle();
    expect(iframeIn(root)).toBeNull();
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FRESH_SESSION,
  SESSION,
  WIDGET_ORIGIN,
  WIDGET_URL,
  captureInit,
  channelOf,
  fromWidget,
  iframeIn,
  settle,
  widgetSession,
} from "../test/helpers.js";
import { runPayFrame, type FrameEvents } from "./frame.js";
import type { CreateSession, FrameOptions, WidgetSession } from "./types.js";

type Overrides = FrameOptions & {
  createSession?: CreateSession;
  sessionEndpoint?: string;
  requireChannel?: boolean;
  allowedWidgetOrigins?: readonly string[];
  clientId?: string;
  platformUrl?: string;
  lang?: string;
  theme?: "light" | "dark";
  mode?: "deposit" | "withdraw";
};

const stops: Array<() => void> = [];

const start = (overrides: Overrides = {}) => {
  const container = document.createElement("div");
  document.body.append(container);
  const events = {
    status: vi.fn<FrameEvents["status"]>(),
    height: vi.fn<FrameEvents["height"]>(),
    credited: vi.fn<FrameEvents["credited"]>(),
    close: vi.fn<FrameEvents["close"]>(),
  };
  const { sessionEndpoint, createSession: provided, ...rest } = overrides;
  const createSession =
    provided ?? vi.fn<CreateSession>(async () => widgetSession());
  const source = sessionEndpoint ? { sessionEndpoint } : { createSession };
  const stop = runPayFrame(
    container,
    { mode: "deposit", ...rest, ...source },
    events,
  );
  stops.push(stop);
  return { container, createSession, events, stop };
};

const opened = async (overrides: Overrides = {}) => {
  const run = start(overrides);
  await settle();
  const frame = iframeIn(run.container);
  if (!frame) throw new Error("widget iframe was not created");
  return { ...run, frame, init: captureInit(frame), channel: channelOf(frame) };
};

afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("opening the widget", () => {
  it("loads the widget URL with a fresh per-instance channel in the fragment", async () => {
    const first = await opened();
    const second = await opened();

    const src = new URL(first.frame.getAttribute("src") ?? "");
    expect(`${src.origin}${src.pathname}${src.search}`).toBe(WIDGET_URL);
    expect(first.channel).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second.channel).not.toBe(first.channel);
    expect(first.frame.getAttribute("allow")).toBe(
      `payment ${WIDGET_ORIGIN}; clipboard-write ${WIDGET_ORIGIN}`,
    );
    expect(first.frame.getAttribute("referrerpolicy")).toBe("origin");
    expect(first.frame.getAttribute("title")).toBe("Deposit");
    expect(first.events.status.mock.calls.map(([status]) => status)).toEqual([
      "session",
      "loading",
    ]);
    expect(first.events.height).toHaveBeenCalledWith(720);
  });

  it("builds the legacy URL from platformUrl and clientId when the session has none", async () => {
    const { frame } = await opened({
      mode: "withdraw",
      createSession: vi.fn(async () => ({ session: SESSION })),
      platformUrl: "https://platform.example/",
      clientId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      lang: "ru",
      theme: "light",
    });

    const src = new URL(frame.getAttribute("src") ?? "");
    expect(src.origin + src.pathname).toBe(
      "https://platform.example/embed/pay",
    );
    expect(Object.fromEntries(src.searchParams)).toEqual({
      mode: "withdraw",
      client_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      lang: "ru",
      theme: "light",
    });
    expect(frame.getAttribute("title")).toBe("Withdraw");
  });

  it.each<[string, Partial<WidgetSession>]>([
    [
      "plain http",
      { widget_url: "http://pay.example/embed/pay", widget_origin: undefined },
    ],
    [
      "a script URL",
      { widget_url: "javascript:alert(1)", widget_origin: undefined },
    ],
    [
      "credentials",
      {
        widget_url: "https://user:secret@pay.example/embed/pay",
        widget_origin: undefined,
      },
    ],
    ["a different declared origin", { widget_origin: "https://other.example" }],
    ["no URL at all", { widget_url: undefined, widget_origin: undefined }],
  ])("refuses a widget URL with %s", async (_case, overrides) => {
    const run = start({
      createSession: vi.fn(async () => widgetSession(overrides)),
    });
    await settle();

    expect(iframeIn(run.container)).toBeNull();
    expect(run.events.status).toHaveBeenLastCalledWith("error", {
      code: "invalid_widget_url",
      message: "The widget session has no usable widget URL",
    });
  });

  it("scopes the iframe permissions to the widget origin of the session", async () => {
    const { frame } = await opened({
      createSession: vi.fn(async () =>
        widgetSession({
          widget_url: "https://pay.eu.example/embed/pay?mode=deposit",
          widget_origin: "https://pay.eu.example",
        }),
      ),
    });

    expect(frame.getAttribute("allow")).toBe(
      "payment https://pay.eu.example; clipboard-write https://pay.eu.example",
    );
    expect(frame.getAttribute("allow")).not.toContain("*");
  });

  describe("allowedWidgetOrigins", () => {
    it("opens a widget whose origin is listed, whatever the entry's path or slash", async () => {
      const { frame } = await opened({
        allowedWidgetOrigins: [
          "https://other.example",
          `${WIDGET_ORIGIN}/some/path/`,
        ],
      });

      expect(frame.getAttribute("src")).toMatch(/^https:\/\/pay\.example\//);
    });

    it.each<[string, readonly string[], Partial<WidgetSession>]>([
      ["a different origin", ["https://pay.other.example"], {}],
      [
        "a lookalike host",
        [WIDGET_ORIGIN],
        {
          widget_url: "https://pay.example.evil.test/embed/pay",
          widget_origin: undefined,
        },
      ],
      [
        "a different port",
        [WIDGET_ORIGIN],
        {
          widget_url: "https://pay.example:8443/embed/pay",
          widget_origin: undefined,
        },
      ],
      ["an empty list", [], {}],
      ["entries that are not origins", ["pay.example", "not a url", ""], {}],
      ["a plain http entry for a remote host", ["http://pay.example"], {}],
    ])(
      "refuses a widget outside the list: %s",
      async (_case, allowed, session) => {
        const createSession = vi.fn<CreateSession>(async () =>
          widgetSession(session),
        );
        const run = start({ allowedWidgetOrigins: allowed, createSession });
        await settle();

        expect(iframeIn(run.container)).toBeNull();
        expect(run.events.status).toHaveBeenLastCalledWith("error", {
          code: "invalid_widget_url",
          message: "The widget session has no usable widget URL",
        });
      },
    );

    it("also guards the URL built from platformUrl and clientId", async () => {
      const run = start({
        createSession: vi.fn(async () => ({ session: SESSION })),
        platformUrl: "https://platform.example",
        clientId: "client-1",
        allowedWidgetOrigins: [WIDGET_ORIGIN],
      });
      await settle();

      expect(iframeIn(run.container)).toBeNull();
      expect(run.events.status).toHaveBeenLastCalledWith(
        "error",
        expect.objectContaining({ code: "invalid_widget_url" }),
      );
    });

    it("keeps accepting every https widget when the option is omitted", async () => {
      const { frame } = await opened({
        createSession: vi.fn(async () =>
          widgetSession({
            widget_url: "https://anywhere.example/embed/pay",
            widget_origin: "https://anywhere.example",
          }),
        ),
      });

      expect(frame.getAttribute("src")).toMatch(
        /^https:\/\/anywhere\.example\//,
      );
    });
  });

  it("allows plain http only on a loopback widget host", async () => {
    const { frame } = await opened({
      createSession: vi.fn(async () =>
        widgetSession({
          widget_url:
            "http://localhost:5173/embed/pay?mode=deposit&client_id=c",
          widget_origin: "http://localhost:5173",
        }),
      ),
    });

    expect(frame.getAttribute("src")).toMatch(
      /^http:\/\/localhost:5173\/embed\/pay\?/,
    );
  });
});

describe("handshake", () => {
  it("answers a ready that echoes the channel with a channel-bound init for the widget origin", async () => {
    const { frame, init, channel, createSession } = await opened();

    fromWidget(frame, { type: "binodex-embed:ready", channel });
    await settle();

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(
      { type: "binodex-embed:init", session: SESSION, channel },
      WIDGET_ORIGIN,
    );
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("speaks the legacy handshake to a frame that does not know channels", async () => {
    const { frame, init } = await opened();

    fromWidget(frame, { type: "binodex-embed:ready" });
    await settle();

    expect(init).toHaveBeenCalledWith(
      { type: "binodex-embed:init", session: SESSION },
      WIDGET_ORIGIN,
    );
  });

  it("refuses a legacy frame when requireChannel is set", async () => {
    const { frame, init, events } = await opened({ requireChannel: true });

    fromWidget(frame, { type: "binodex-embed:ready" });
    await settle();

    expect(init).not.toHaveBeenCalled();
    expect(events.status).toHaveBeenLastCalledWith("loading", null);
  });

  it("ignores messages from other windows, other origins and other channels", async () => {
    const { frame, init, channel, events } = await opened();
    const stranger = document.createElement("iframe");
    document.body.append(stranger);

    fromWidget(
      frame,
      { type: "binodex-embed:ready", channel },
      { source: window },
    );
    fromWidget(
      frame,
      { type: "binodex-embed:ready", channel },
      { source: stranger.contentWindow },
    );
    fromWidget(
      frame,
      { type: "binodex-embed:ready", channel },
      { source: null },
    );
    fromWidget(
      frame,
      { type: "binodex-embed:ready", channel },
      { origin: "https://evil.example" },
    );
    fromWidget(frame, { type: "binodex-embed:ready", channel: "A".repeat(22) });
    fromWidget(frame, { type: "binodex-embed:close", channel: "A".repeat(22) });
    fromWidget(
      frame,
      { type: "binodex-embed:credited", amount: 1, asset: "USDT" },
      { origin: "https://evil.example" },
    );
    await settle();

    expect(init).not.toHaveBeenCalled();
    expect(events.close).not.toHaveBeenCalled();
    expect(events.credited).not.toHaveBeenCalled();
  });

  it("keeps two widgets on one page apart", async () => {
    const first = await opened();
    const second = await opened();

    fromWidget(first.frame, {
      type: "binodex-embed:close",
      channel: first.channel,
    });
    fromWidget(first.frame, {
      type: "binodex-embed:close",
      channel: second.channel,
    });

    expect(first.events.close).toHaveBeenCalledTimes(1);
    expect(second.events.close).not.toHaveBeenCalled();
  });

  it("stops accepting channel-less messages once the frame proved the channel", async () => {
    const { frame, channel, events } = await opened();

    fromWidget(frame, { type: "binodex-embed:ready", channel });
    fromWidget(frame, { type: "binodex-embed:close" });
    fromWidget(frame, {
      type: "binodex-embed:credited",
      amount: 5,
      asset: "USDT",
    });
    await settle();
    expect(events.close).not.toHaveBeenCalled();
    expect(events.credited).not.toHaveBeenCalled();

    fromWidget(frame, { type: "binodex-embed:close", channel });
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("mints one fresh session for a reauth and its trailing ready", async () => {
    const createSession = vi
      .fn<CreateSession>()
      .mockResolvedValueOnce(widgetSession())
      .mockResolvedValueOnce(widgetSession({ session: FRESH_SESSION }));
    const { frame, init, channel } = await opened({ createSession });
    fromWidget(frame, { type: "binodex-embed:ready", channel });
    await settle();

    fromWidget(frame, { type: "binodex-embed:reauth-required", channel });
    fromWidget(frame, { type: "binodex-embed:ready", channel });
    await settle();

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenCalledTimes(2);
    expect(init).toHaveBeenLastCalledWith(
      { type: "binodex-embed:init", session: FRESH_SESSION, channel },
      WIDGET_ORIGIN,
    );
  });

  it.each([
    [60, 44_000, 1],
    [60, 46_000, 2],
    [20, 4_000, 1],
    [20, 6_000, 2],
  ])(
    "with expires_in %ss and a ready after %sms mints %s session(s)",
    async (expiresIn, delay, mints) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const createSession = vi.fn<CreateSession>(async () =>
        widgetSession({ expires_in: expiresIn }),
      );
      const { frame, channel } = await opened({ createSession });

      vi.setSystemTime(Date.now() + delay);
      fromWidget(frame, { type: "binodex-embed:ready", channel });
      await settle();

      expect(createSession).toHaveBeenCalledTimes(mints);
    },
  );
});

describe("widget events", () => {
  it("maps resize, credited, close and error", async () => {
    const { frame, channel, events } = await opened({
      minHeight: 520,
      maxHeight: 900,
    });

    fromWidget(frame, { type: "binodex-embed:resize", height: 400, channel });
    expect(frame.style.height).toBe("520px");
    fromWidget(frame, { type: "binodex-embed:resize", height: 1200, channel });
    expect(frame.style.height).toBe("900px");
    fromWidget(frame, { type: "binodex-embed:resize", height: 640.2, channel });
    expect(frame.style.height).toBe("641px");
    expect(events.height).toHaveBeenLastCalledWith(641);
    expect(events.status).toHaveBeenLastCalledWith("ready", null);

    fromWidget(frame, {
      type: "binodex-embed:credited",
      amount: 25,
      asset: "USDT",
      channel,
    });
    expect(events.credited).toHaveBeenCalledWith({ amount: 25, asset: "USDT" });

    fromWidget(frame, { type: "binodex-embed:close", channel });
    expect(events.close).toHaveBeenCalledTimes(1);

    fromWidget(frame, {
      type: "binodex-embed:error",
      message: "widget_auth_error",
      channel,
    });
    expect(events.status).toHaveBeenLastCalledWith("error", {
      code: "widget_error",
      message: "Payment form is unavailable",
      reason: "widget_auth_error",
    });
  });

  it("keeps the frame within bounded default heights unless told otherwise", async () => {
    const bounded = await opened();
    fromWidget(bounded.frame, {
      type: "binodex-embed:resize",
      height: 4096,
      channel: bounded.channel,
    });
    expect(bounded.frame.style.height).toBe("900px");
    fromWidget(bounded.frame, {
      type: "binodex-embed:resize",
      height: 120,
      channel: bounded.channel,
    });
    expect(bounded.frame.style.height).toBe("520px");

    const unbounded = await opened({ minHeight: 0, maxHeight: Infinity });
    fromWidget(unbounded.frame, {
      type: "binodex-embed:resize",
      height: 4096,
      channel: unbounded.channel,
    });
    expect(unbounded.frame.style.height).toBe("4096px");
  });

  it("moves to handshake once the frame document has loaded", async () => {
    const { frame, events } = await opened();

    frame.dispatchEvent(new Event("load"));

    expect(events.status).toHaveBeenLastCalledWith("handshake", null);
  });
});

describe("sessions", () => {
  it("posts the mode to sessionEndpoint and shows the server message on failure", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { error: { message: "Origin is not registered" } },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const run = start({
      sessionEndpoint: "/api/widget-session",
      mode: "withdraw",
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/widget-session",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ mode: "withdraw" }),
      }),
    );
    expect(iframeIn(run.container)).toBeNull();
    expect(run.events.status).toHaveBeenLastCalledWith("error", {
      code: "session_failed",
      message: "Origin is not registered",
    });
  });

  it("opens the widget from a sessionEndpoint response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(widgetSession())),
    );

    const run = start({ sessionEndpoint: "/api/widget-session" });
    await settle();

    expect(iframeIn(run.container)).not.toBeNull();
  });

  it.each([
    [
      vi.fn(async () => Promise.reject(new Error("Sign in again"))),
      "Sign in again",
    ],
    [
      vi.fn(async () => ({ session: "" }) as WidgetSession),
      "Could not create widget session",
    ],
    [
      vi.fn(async () => ({}) as WidgetSession),
      "Could not create widget session",
    ],
  ])(
    "reports a failed session without creating the frame (%#)",
    async (createSession, message) => {
      const run = start({ createSession });
      await settle();

      expect(iframeIn(run.container)).toBeNull();
      expect(run.events.status).toHaveBeenLastCalledWith("error", {
        code: "session_failed",
        message,
      });
    },
  );
});

describe("stopping", () => {
  it("aborts a pending session and never creates the frame", async () => {
    let signal: AbortSignal | undefined;
    let resolve: (session: WidgetSession) => void = () => undefined;
    const run = start({
      createSession: vi.fn((context) => {
        signal = context.signal;
        return new Promise<WidgetSession>((done) => {
          resolve = done;
        });
      }),
    });

    run.stop();
    resolve(widgetSession());
    await settle();

    expect(signal?.aborted).toBe(true);
    expect(iframeIn(run.container)).toBeNull();
    expect(run.events.status.mock.calls.map(([status]) => status)).toEqual([
      "session",
    ]);
  });

  it("removes the frame and stops listening", async () => {
    const { frame, channel, events, stop, container } = await opened();

    stop();
    fromWidget(frame, { type: "binodex-embed:close", channel });

    expect(iframeIn(container)).toBeNull();
    expect(events.close).not.toHaveBeenCalled();
  });
});

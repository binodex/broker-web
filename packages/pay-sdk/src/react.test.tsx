import { act, type ReactNode } from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  channelOf,
  fromWidget,
  iframeIn,
  settle,
  widgetSession,
} from "../test/helpers.js";
import * as Pay from "./react.js";
import type { CreateSession } from "./types.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: ReactRoot;
let warn: ReturnType<typeof vi.spyOn>;

const render = async (ui: ReactNode) => {
  await act(async () => {
    root.render(ui);
    await settle();
  });
};

const flush = async () => {
  await act(async () => {
    await settle();
  });
};

const part = (name: string) =>
  host.querySelector(`[data-binodex-pay="${name}"]`);

const sessionSpy = () => vi.fn<CreateSession>(async () => widgetSession());

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("<Root> part validation", () => {
  it("renders nothing and never creates a session without a <Frame>", async () => {
    const createSession = sessionSpy();

    await render(
      <Pay.Root mode="deposit" createSession={createSession}>
        <div className="modal">
          <Pay.Trigger>Deposit</Pay.Trigger>
          <Pay.Loader>Opening</Pay.Loader>
          <Pay.Status />
        </div>
      </Pay.Root>,
    );

    expect(host.childNodes).toHaveLength(0);
    expect(createSession).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      'missing required part "frame"',
    );
  });

  it("does not warn in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()}>
        <Pay.Loader />
      </Pay.Root>,
    );

    expect(host.childNodes).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("enforces extra parts listed in required", async () => {
    const createSession = sessionSpy();

    await render(
      <Pay.Root
        mode="deposit"
        createSession={createSession}
        required={["close"]}
      >
        <Pay.Frame />
      </Pay.Root>,
    );
    expect(host.childNodes).toHaveLength(0);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"close"');

    await act(async () => {
      root.unmount();
    });
    root = createRoot(host);
    await render(
      <Pay.Root
        mode="deposit"
        createSession={createSession}
        required={["close"]}
      >
        <Pay.Close />
        <Pay.Frame />
      </Pay.Root>,
    );
    expect(part("close")).not.toBeNull();
    expect(iframeIn(host)).not.toBeNull();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("tears the widget down and renders nothing once a required part goes away", async () => {
    const view = (withFrame: boolean) => (
      <Pay.Root mode="deposit" createSession={sessionSpy()}>
        <Pay.Loader />
        {withFrame ? <Pay.Frame /> : null}
      </Pay.Root>
    );
    await render(view(true));
    expect(iframeIn(host)).not.toBeNull();

    await render(view(false));

    expect(host.childNodes).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("renders nothing on the server", () => {
    expect(
      renderToString(
        <Pay.Root mode="deposit" createSession={sessionSpy()}>
          <Pay.Trigger>Deposit</Pay.Trigger>
          <Pay.Frame />
        </Pay.Root>,
      ),
    ).toBe("");
  });

  it("requires parts to sit inside a <Root>", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(render(<Pay.Frame />)).rejects.toThrow(
      "<Frame> must be used inside <Root>",
    );
  });
});

describe("<Root> with its parts", () => {
  it("mounts the frame, shows the loader until the form is ready and reports credits", async () => {
    const onCredited = vi.fn();
    const createSession = sessionSpy();

    await render(
      <Pay.Root
        mode="deposit"
        createSession={createSession}
        onCredited={onCredited}
      >
        <Pay.Loader>Opening widget</Pay.Loader>
        <Pay.Frame title="Top up" className="frame" minHeight={520} />
      </Pay.Root>,
    );

    const frame = iframeIn(host);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(frame?.parentElement).toBe(part("frame"));
    expect(frame?.getAttribute("title")).toBe("Top up");
    expect(part("frame")?.className).toBe("frame");
    expect(part("loader")?.textContent).toBe("Opening widget");
    if (!frame) throw new Error("no frame");
    const channel = channelOf(frame);

    await act(async () => {
      fromWidget(frame, { type: "binodex-embed:resize", height: 610, channel });
    });
    expect(part("loader")).toBeNull();
    expect(part("frame")?.getAttribute("data-status")).toBe("ready");
    expect((part("frame") as HTMLElement).style.minHeight).toBe("610px");

    await act(async () => {
      fromWidget(frame, {
        type: "binodex-embed:credited",
        amount: 25,
        asset: "USDT",
        channel,
      });
    });
    expect(onCredited).toHaveBeenCalledWith({ amount: 25, asset: "USDT" });
  });

  it("opens from <Trigger> and closes when the widget asks to", async () => {
    const onOpenChange = vi.fn();
    const createSession = sessionSpy();

    await render(
      <Pay.Root
        mode="withdraw"
        createSession={createSession}
        defaultOpen={false}
        onOpenChange={onOpenChange}
      >
        <Pay.Trigger>Withdraw</Pay.Trigger>
        <Pay.Frame />
      </Pay.Root>,
    );
    const trigger = part("trigger") as HTMLButtonElement;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(part("frame")).toBeNull();
    expect(createSession).not.toHaveBeenCalled();

    await act(async () => {
      trigger.click();
      await settle();
    });
    const frame = iframeIn(host);
    expect(frame).not.toBeNull();
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "withdraw" }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(part("frame")?.id);

    await act(async () => {
      if (frame)
        fromWidget(frame, {
          type: "binodex-embed:close",
          channel: channelOf(frame),
        });
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(iframeIn(host)).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes from <Close> under a controlled open prop", async () => {
    const onOpenChange = vi.fn();
    const view = (open: boolean) => (
      <Pay.Root
        mode="deposit"
        createSession={sessionSpy()}
        open={open}
        onOpenChange={onOpenChange}
      >
        <Pay.Close>Done</Pay.Close>
        <Pay.Frame />
      </Pay.Root>
    );
    await render(view(true));

    await act(async () => {
      (part("close") as HTMLButtonElement).click();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(iframeIn(host)).not.toBeNull();

    await render(view(false));
    expect(iframeIn(host)).toBeNull();
    expect(part("close")).toBeNull();
  });

  it("shows <Status> when the session cannot be created", async () => {
    const onError = vi.fn();

    await render(
      <Pay.Root
        mode="deposit"
        createSession={vi.fn(async () =>
          Promise.reject(new Error("Sign in again")),
        )}
        onError={onError}
      >
        <Pay.Loader />
        <Pay.Status>{(error) => `Failed: ${error.message}`}</Pay.Status>
        <Pay.Frame />
      </Pay.Root>,
    );
    await flush();

    expect(part("status")?.textContent).toBe("Failed: Sign in again");
    expect(part("status")?.getAttribute("role")).toBe("alert");
    expect(part("loader")).toBeNull();
    expect(iframeIn(host)).toBeNull();
    expect(onError).toHaveBeenCalledWith({
      code: "session_failed",
      message: "Sign in again",
    });
  });

  it("restarts with a new session when the mode changes", async () => {
    const createSession = sessionSpy();
    const view = (mode: "deposit" | "withdraw") => (
      <Pay.Root mode={mode} createSession={createSession}>
        <Pay.Frame />
      </Pay.Root>
    );
    await render(view("deposit"));
    const first = iframeIn(host);

    await render(view("withdraw"));

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "withdraw" }),
    );
    expect(iframeIn(host)).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });

  it("exposes state to custom shells through usePayWidget", async () => {
    const Shell = ({ children }: { children: ReactNode }) => {
      const { open, status } = Pay.usePayWidget();
      return (
        <section data-open={String(open)} data-shell-status={status}>
          {children}
        </section>
      );
    };

    await render(
      <Pay.Root mode="deposit" createSession={sessionSpy()}>
        <Shell>
          <Pay.Frame />
        </Shell>
      </Pay.Root>,
    );

    const shell = host.querySelector("section");
    expect(shell?.getAttribute("data-open")).toBe("true");
    expect(shell?.getAttribute("data-shell-status")).toBe("loading");
  });
});

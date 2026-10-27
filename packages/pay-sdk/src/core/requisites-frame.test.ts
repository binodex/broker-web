import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayError } from "./errors.js";
import type { FrameTicket } from "./types.js";
import { runRequisitesFrame, type RequisitesFrameStatus } from "./requisites-frame.js";

const ORIGINS = ["https://binodex-ru.test", "https://binodex.test"];

let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const frameOf = () => container.querySelector("iframe");

const channelOf = (frame: HTMLIFrameElement) =>
  new URLSearchParams(new URL(frame.getAttribute("src") ?? "").hash.slice(1)).get("channel") ?? "";

const post = (frame: HTMLIFrameElement, data: unknown, origin: string, source: MessageEventSource | null = frame.contentWindow) => {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
};

const TICKET: FrameTicket = {
  ticket: "wft_123",
  expiresIn: 60,
  expiresAt: null,
  frameOrigins: ORIGINS,
  framePath: "/embed/pay/requisites",
};

const setup = (
  getTicket = vi.fn(async (): Promise<FrameTicket> => TICKET),
  path?: string,
  isActive?: () => boolean,
) => {
  const statuses: [RequisitesFrameStatus, string | null][] = [];
  const onResize = vi.fn();
  const onReceiptAttached = vi.fn();
  const handle = runRequisitesFrame(container, {
    depositId: "dep_ru_1",
    origins: ORIGINS,
    path,
    getTicket,
    lang: "ru-RU",
    theme: "dark",
    onStatus: (status, error) => statuses.push([status, error?.code ?? null]),
    onResize,
    onReceiptAttached,
    isActive,
  });
  return { handle, statuses, getTicket, onResize, onReceiptAttached };
};

describe("runRequisitesFrame", () => {
  it("builds the frame URL on the proven origin with a channel in the fragment", () => {
    const { handle } = setup();
    const frame = frameOf();
    const url = new URL(frame?.getAttribute("src") ?? "");
    expect(url.origin).toBe(ORIGINS[0]);
    expect(url.pathname).toBe("/embed/pay/requisites");
    expect(url.searchParams.get("deposit")).toBe("dep_ru_1");
    expect(url.searchParams.get("lang")).toBe("ru-RU");
    expect(url.search).not.toContain("wft_");
    expect(channelOf(frame as HTMLIFrameElement)).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(frame?.getAttribute("referrerpolicy")).toBe("origin");
    handle.destroy();
  });

  it("matches the frame colour scheme to the host theme so the transparent frame blends in", () => {
    const { handle } = setup();
    const frame = frameOf() as HTMLIFrameElement;
    expect(frame.style.colorScheme).toBe("dark");
    expect(frame.style.background).toBe("transparent");
    expect(new URL(frame.getAttribute("src") ?? "").searchParams.get("theme")).toBe("dark");
    expect([...new URL(frame.getAttribute("src") ?? "").searchParams.keys()].sort()).toEqual(["deposit", "lang", "theme"]);
    handle.destroy();
  });

  it.each([
    ["dark", "classic", "classic"],
    ["dark", "black", "black"],
    ["light", "black", null],
    [undefined, "classic", "classic"],
  ] as const)("tells the frame the host skin (theme %s, skin %s) so its surfaces match", (theme, skin, expected) => {
    const handle = runRequisitesFrame(container, {
      depositId: "dep_ru_1",
      origins: ORIGINS,
      getTicket: async () => TICKET,
      theme,
      skin,
      onStatus: () => undefined,
    });
    expect(new URL(frameOf()?.getAttribute("src") ?? "").searchParams.get("skin")).toBe(expected);
    handle.destroy();
  });

  it("leaves the colour scheme alone when no theme is known", () => {
    const handle = runRequisitesFrame(container, {
      depositId: "dep_ru_1",
      origins: ORIGINS,
      getTicket: async () => TICKET,
      onStatus: () => undefined,
    });
    expect(frameOf()?.style.colorScheme).toBe("");
    expect(new URL(frameOf()?.getAttribute("src") ?? "").searchParams.has("theme")).toBe(false);
    handle.destroy();
  });

  it("hands over a ticket only after a channel-bound ready from the exact origin", async () => {
    const { handle, getTicket, statuses } = setup();
    const frame = frameOf() as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(() => undefined);
    const channel = channelOf(frame);

    post(frame, { type: "binodex-embed:ready", channel }, "https://evil.test");
    post(frame, { type: "binodex-embed:ready", channel: "wrong" }, ORIGINS[0] as string);
    post(frame, { type: "binodex-embed:ready", channel }, ORIGINS[0] as string, window);
    await vi.advanceTimersByTimeAsync(0);
    expect(getTicket).not.toHaveBeenCalled();

    post(frame, { type: "binodex-embed:ready", channel }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(0);
    expect(getTicket).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { type: "binodex-embed:requisites-init", ticket: "wft_123", deposit_id: "dep_ru_1", channel },
      ORIGINS[0],
    );
    expect(statuses.at(-1)).toEqual(["ready", null]);

    post(frame, { type: "binodex-embed:ready", channel }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(0);
    expect(getTicket).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("tries the next widget origin when no ready arrives within 6 s", async () => {
    const { handle, statuses } = setup();
    expect(new URL(frameOf()?.getAttribute("src") ?? "").origin).toBe(ORIGINS[0]);
    await vi.advanceTimersByTimeAsync(5999);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(new URL(frameOf()?.getAttribute("src") ?? "").origin).toBe(ORIGINS[0]);
    await vi.advanceTimersByTimeAsync(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(new URL(frameOf()?.getAttribute("src") ?? "").origin).toBe(ORIGINS[1]);
    expect(statuses.every(([status]) => status === "loading")).toBe(true);
    handle.destroy();
  });

  it("shows REQUISITES_FRAME_UNAVAILABLE instead of a blank box when every origin fails, and can retry", async () => {
    const { handle, statuses } = setup();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(frameOf()).toBeNull();
    expect(statuses.at(-1)).toEqual(["unavailable", "REQUISITES_FRAME_UNAVAILABLE"]);

    handle.retry();
    expect(new URL(frameOf()?.getAttribute("src") ?? "").origin).toBe(ORIGINS[0]);
    expect(statuses.at(-1)).toEqual(["loading", null]);
    handle.destroy();
    expect(frameOf()).toBeNull();
  });

  it("reports a failed ticket as unavailable with its code", async () => {
    const { handle, statuses } = setup(vi.fn(async () => {
      throw new PayError("NOT_FOUND");
    }));
    const frame = frameOf() as HTMLIFrameElement;
    post(frame, { type: "binodex-embed:ready", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toEqual(["unavailable", "NOT_FOUND"]);
    handle.destroy();
  });

  it("never hands a ticket to an origin the backend does not list", async () => {
    const { handle, statuses } = setup(
      vi.fn(async (): Promise<FrameTicket> => ({ ...TICKET, frameOrigins: ["https://binodex.test"] })),
    );
    const frame = frameOf() as HTMLIFrameElement;
    const postMessage = vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(() => undefined);
    post(frame, { type: "binodex-embed:ready", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(0);
    expect(postMessage).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual(["unavailable", "REQUISITES_FRAME_UNAVAILABLE"]);
    handle.destroy();
  });

  it("uses the backend frame path but never lets it change the origin", () => {
    const first = setup(undefined, "/embed/pay/requisites-v2");
    expect(new URL(frameOf()?.getAttribute("src") ?? "").pathname).toBe("/embed/pay/requisites-v2");
    first.handle.destroy();
    const second = setup(undefined, "//evil.test/x");
    const url = new URL(frameOf()?.getAttribute("src") ?? "");
    expect(url.origin).toBe(ORIGINS[0]);
    expect(url.pathname).toBe("/embed/pay/requisites");
    second.handle.destroy();
  });

  it("clamps resize and forwards receipt events", async () => {
    const { handle, onResize, onReceiptAttached } = setup();
    const frame = frameOf() as HTMLIFrameElement;
    const channel = channelOf(frame);
    post(frame, { type: "binodex-embed:resize", height: 5000, channel }, ORIGINS[0] as string);
    post(frame, { type: "binodex-embed:resize", height: -1, channel }, ORIGINS[0] as string);
    post(frame, { type: "binodex-embed:receipt-attached", channel }, ORIGINS[0] as string);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledWith(900);
    expect(frame.style.height).toBe("900px");
    expect(onReceiptAttached).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  const readyAndInit = async (frame: HTMLIFrameElement) => {
    const postMessage = vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation(() => undefined);
    post(frame, { type: "binodex-embed:ready", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(0);
    return postMessage;
  };

  it("reloads the frame with a fresh ticket on ticket_expired, with backoff and a bound", async () => {
    let minted = 0;
    const getTicket = vi.fn(async (): Promise<FrameTicket> => ({ ...TICKET, ticket: `wft_${++minted}` }));
    const { handle, statuses } = setup(getTicket);
    let frame = frameOf() as HTMLIFrameElement;
    let postMessage = await readyAndInit(frame);
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({ ticket: "wft_1", deposit_id: "dep_ru_1" });

    const backoffs = [1000, 2000, 4000];
    for (const [index, backoff] of backoffs.entries()) {
      const channel = channelOf(frame);
      post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel }, ORIGINS[0] as string);
      post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel }, ORIGINS[0] as string);
      await vi.advanceTimersByTimeAsync(backoff - 1);
      expect(frameOf()).toBe(frame);
      await vi.advanceTimersByTimeAsync(1);
      const reloaded = frameOf() as HTMLIFrameElement;
      expect(reloaded).not.toBe(frame);
      expect(new URL(reloaded.getAttribute("src") ?? "").origin).toBe(ORIGINS[0]);
      expect(channelOf(reloaded)).not.toBe(channel);
      frame = reloaded;
      postMessage = await readyAndInit(frame);
      expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
        type: "binodex-embed:requisites-init",
        ticket: `wft_${index + 2}`,
        deposit_id: "dep_ru_1",
        channel: channelOf(frame),
      });
    }
    expect(getTicket).toHaveBeenCalledTimes(4);

    post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(frameOf()).toBeNull();
    expect(statuses.at(-1)).toEqual(["unavailable", "REQUISITES_FRAME_UNAVAILABLE"]);
    expect(getTicket).toHaveBeenCalledTimes(4);

    handle.retry();
    frame = frameOf() as HTMLIFrameElement;
    await readyAndInit(frame);
    post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(1000);
    expect(frameOf()).not.toBe(frame);
    handle.destroy();
  });

  it("does not refresh once the deposit is terminal", async () => {
    let active = true;
    const { handle, getTicket } = setup(undefined, undefined, () => active);
    const frame = frameOf() as HTMLIFrameElement;
    await readyAndInit(frame);
    active = false;
    post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(frameOf()).toBe(frame);
    expect(getTicket).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it("does not refresh when the deposit turns terminal during the backoff", async () => {
    let active = true;
    const { handle, getTicket } = setup(undefined, undefined, () => active);
    const frame = frameOf() as HTMLIFrameElement;
    await readyAndInit(frame);
    post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
    active = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(frameOf()).toBe(frame);
    expect(getTicket).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it.each([
    ["unavailable", "REQUISITES_FRAME_UNAVAILABLE"],
    ["origin_mismatch", "REQUISITES_FRAME_UNAVAILABLE"],
    ["deposit_mismatch", "REQUISITES_FRAME_UNAVAILABLE"],
    ["rate_limited", "RATE_LIMITED"],
    ["Not A Code!", "REQUISITES_FRAME_UNAVAILABLE"],
  ])("turns frame error %s into an error state with retry", async (message, code) => {
    const { handle, statuses } = setup();
    const frame = frameOf() as HTMLIFrameElement;
    await readyAndInit(frame);
    post(frame, { type: "binodex-embed:error", message, channel: "other" }, ORIGINS[0] as string);
    expect(frameOf()).toBe(frame);
    post(frame, { type: "binodex-embed:error", message, channel: channelOf(frame) }, ORIGINS[0] as string);
    expect(frameOf()).toBeNull();
    expect(statuses.at(-1)).toEqual(["unavailable", code]);
    handle.retry();
    expect(frameOf()).not.toBeNull();
    handle.destroy();
  });

  it("resets the reload budget once a reloaded frame reports a healthy resize", async () => {
    const { handle, statuses, getTicket } = setup();
    let frame = frameOf() as HTMLIFrameElement;
    await readyAndInit(frame);
    for (let round = 0; round < 6; round += 1) {
      post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
      await vi.advanceTimersByTimeAsync(1000);
      const reloaded = frameOf() as HTMLIFrameElement;
      expect(reloaded).not.toBe(frame);
      frame = reloaded;
      await readyAndInit(frame);
      post(frame, { type: "binodex-embed:resize", height: 400, channel: channelOf(frame) }, ORIGINS[0] as string);
    }
    expect(getTicket).toHaveBeenCalledTimes(7);
    expect(statuses.some(([status]) => status === "unavailable")).toBe(false);
    handle.destroy();
  });

  it("a resize before the init round does not reset the budget", async () => {
    const { handle, statuses } = setup();
    let frame = frameOf() as HTMLIFrameElement;
    await readyAndInit(frame);
    for (let round = 0; round < 3; round += 1) {
      post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
      await vi.advanceTimersByTimeAsync(1000 * 2 ** round);
      frame = frameOf() as HTMLIFrameElement;
      post(frame, { type: "binodex-embed:resize", height: 400, channel: channelOf(frame) }, ORIGINS[0] as string);
      await readyAndInit(frame);
    }
    post(frame, { type: "binodex-embed:error", message: "ticket_expired", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(statuses.at(-1)).toEqual(["unavailable", "REQUISITES_FRAME_UNAVAILABLE"]);
    handle.destroy();
  });

  it("moves to the next origin at once on invalid_params and fails after the last one", async () => {
    const { handle, statuses } = setup();
    let frame = frameOf() as HTMLIFrameElement;
    post(frame, { type: "binodex-embed:error", message: "invalid_params", channel: channelOf(frame) }, ORIGINS[0] as string);
    frame = frameOf() as HTMLIFrameElement;
    expect(new URL(frame.getAttribute("src") ?? "").origin).toBe(ORIGINS[1]);
    post(frame, { type: "binodex-embed:error", message: "invalid_params", channel: channelOf(frame) }, ORIGINS[1] as string);
    expect(frameOf()).toBeNull();
    expect(statuses.at(-1)).toEqual(["unavailable", "REQUISITES_FRAME_UNAVAILABLE"]);
    handle.destroy();
  });

  it("keeps unavailable terminal without trying other origins", async () => {
    const { handle, statuses } = setup();
    const frame = frameOf() as HTMLIFrameElement;
    post(frame, { type: "binodex-embed:error", message: "unavailable", channel: channelOf(frame) }, ORIGINS[0] as string);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(frameOf()).toBeNull();
    expect(statuses.at(-1)).toEqual(["unavailable", "REQUISITES_FRAME_UNAVAILABLE"]);
    handle.destroy();
  });
});


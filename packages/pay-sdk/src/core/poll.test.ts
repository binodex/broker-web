import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPoller } from "./poll.js";

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  setVisibility("visible");
  vi.useRealTimers();
});

describe("createPoller", () => {
  it("backs off 4 s -> 8 s -> 16 s -> 30 s on failures and resets on success", async () => {
    const outcomes: ("ok" | "fail")[] = ["fail", "fail", "fail", "fail", "ok", "ok"];
    const at: number[] = [];
    const start = Date.now();
    const task = vi.fn(async () => {
      at.push(Date.now() - start);
      if (outcomes.shift() === "fail") throw new Error("down");
      return "continue" as const;
    });
    const poller = createPoller(task, { intervalMs: 4000, maxIntervalMs: 30_000 });
    poller.start();
    await vi.advanceTimersByTimeAsync(84_000);
    expect(at).toEqual([0, 8000, 24000, 54000, 84000]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(at.at(-1)).toBe(88000);
    poller.stop();
  });

  it("stops when the task says so and when stopped, aborting the in-flight call", async () => {
    let seen: AbortSignal | null = null;
    const done = createPoller(async () => "stop", { intervalMs: 1000 });
    done.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(done.running).toBe(false);

    const slow = createPoller(
      (signal) => {
        seen = signal;
        return new Promise(() => undefined);
      },
      { intervalMs: 1000 },
    );
    slow.start();
    await vi.advanceTimersByTimeAsync(0);
    slow.stop();
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
  });

  it("pauses while the page is hidden and resumes on visibility", async () => {
    const task = vi.fn(async () => "continue" as const);
    const poller = createPoller(task, { intervalMs: 5000, immediate: false });
    poller.start();
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(task).not.toHaveBeenCalled();
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("now() runs an off-cycle tick", async () => {
    const task = vi.fn(async () => "continue" as const);
    const poller = createPoller(task, { intervalMs: 5000, immediate: false });
    poller.start();
    poller.now();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    poller.stop();
  });
});

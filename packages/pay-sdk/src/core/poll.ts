import { defaultTimers, type Timers } from "./api-base.js";

export type PollOutcome = "continue" | "stop";

export interface PollerOptions {
  intervalMs: number;
  maxIntervalMs?: number;
  pauseWhenHidden?: boolean;
  immediate?: boolean;
  timers?: Timers;
}

export interface Poller {
  start: () => void;
  stop: () => void;
  now: () => void;
  readonly running: boolean;
}

const isHidden = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

export const createPoller = (
  task: (signal: AbortSignal) => Promise<PollOutcome>,
  options: PollerOptions,
): Poller => {
  const timers = options.timers ?? defaultTimers;
  const maxInterval = options.maxIntervalMs ?? options.intervalMs;
  const pauseWhenHidden = options.pauseWhenHidden ?? true;
  let delay = options.intervalMs;
  let handle: unknown = null;
  let controller: AbortController | null = null;
  let running = false;
  let inFlight = false;
  let pausedTick = false;

  const clear = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };

  const schedule = (ms: number) => {
    clear();
    if (!running) return;
    handle = timers.setTimeout(() => {
      handle = null;
      void tick();
    }, ms);
  };

  const tick = async () => {
    if (!running || inFlight) return;
    if (pauseWhenHidden && isHidden()) {
      pausedTick = true;
      return;
    }
    inFlight = true;
    controller = new AbortController();
    let outcome: PollOutcome = "continue";
    try {
      outcome = await task(controller.signal);
      delay = options.intervalMs;
    } catch {
      delay = Math.min(maxInterval, delay * 2);
    } finally {
      inFlight = false;
      controller = null;
    }
    if (!running) return;
    if (outcome === "stop") {
      stop();
      return;
    }
    schedule(delay);
  };

  const onVisibility = () => {
    if (!running || isHidden() || !pausedTick) return;
    pausedTick = false;
    void tick();
  };

  const start = () => {
    if (running) return;
    running = true;
    delay = options.intervalMs;
    if (pauseWhenHidden && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (options.immediate === false) schedule(delay);
    else void tick();
  };

  const stop = () => {
    if (!running) return;
    running = false;
    clear();
    controller?.abort();
    controller = null;
    pausedTick = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };

  return {
    start,
    stop,
    now: () => {
      if (!running || inFlight) return;
      clear();
      void tick();
    },
    get running() {
      return running;
    },
  };
};

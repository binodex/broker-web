export interface ServerClock {
  observe: (serverTime: number | null | undefined, receivedAt?: number) => void;
  offset: () => number;
  now: () => number;
}

export const serverClockOffsetMs = (
  serverTime: number | null | undefined,
  receivedAtMs: number,
): number =>
  typeof serverTime === "number" && Number.isFinite(serverTime) && serverTime > 0
    ? serverTime - receivedAtMs
    : 0;

export const createServerClock = (
  localNow: () => number = Date.now,
): ServerClock => {
  let offset = 0;
  return {
    observe: (serverTime, receivedAt = localNow()) => {
      if (typeof serverTime !== "number" || !Number.isFinite(serverTime)) return;
      if (serverTime <= 0) return;
      offset = serverClockOffsetMs(serverTime, receivedAt);
    },
    offset: () => offset,
    now: () => localNow() + offset,
  };
};

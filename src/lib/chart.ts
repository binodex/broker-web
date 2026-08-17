import type { Candle } from "@/lib/types";

export function asCandles(data: unknown): Candle[] {
  if (Array.isArray(data)) {
    if (!data.length) return [];
    if (Array.isArray(data[0])) {
      return data
        .filter(
          (row): row is Candle =>
            Array.isArray(row) &&
            row.length >= 5 &&
            row.slice(0, 5).every((item) => Number.isFinite(Number(item))),
        )
        .map((row) => {
          const vol = Number(row[5]);
          return Number.isFinite(vol) && vol > 0
            ? ([row[0], row[1], row[2], row[3], row[4], vol] as Candle)
            : ([row[0], row[1], row[2], row[3], row[4]] as Candle);
        });
    }
    return (data as Array<Record<string, unknown>>)
      .map((row) => {
        const time = Number(row.t ?? row.time ?? row[0]);
        const open = Number(row.o ?? row.open ?? row[1]);
        const high = Number(row.h ?? row.high ?? row[2]);
        const low = Number(row.l ?? row.low ?? row[3]);
        const close = Number(row.c ?? row.close ?? row[4]);
        const vol = Number(row.v ?? row.volume ?? row[5]);
        return (
          Number.isFinite(vol) && vol > 0
            ? [time, open, high, low, close, vol]
            : [time, open, high, low, close]
        ) as Candle;
      })
      .filter((row) => row.every((item) => Number.isFinite(item)));
  }
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    if (Array.isArray(body.candles)) return asCandles(body.candles);
    if (Array.isArray(body.data)) return asCandles(body.data);
    if (Array.isArray(body.klines)) return asCandles(body.klines);
  }
  return [];
}

export function liveChartWindow(intervalMs: number, bars: number, now = Date.now()) {
  const count = Math.max(1, bars);
  return {
    start_time: String(now - intervalMs * count),
    limit: String(count + 1),
  };
}

export function lastClose(candles: Candle[]): number | undefined {
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const close = candles[i][4];
    if (Number.isFinite(close) && close !== 0) return close;
  }
  return undefined;
}

export function mergeCandles(prev: Candle[], next: Candle[]): Candle[] {
  if (!next.length) return prev;
  if (!prev.length) return next;
  const map = new Map<number, Candle>();
  for (const row of prev) map.set(row[0], row);
  for (const row of next) map.set(row[0], row);
  return [...map.values()].sort((a, b) => a[0] - b[0]);
}

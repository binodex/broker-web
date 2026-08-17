import type { Candle } from "@/lib/types";

export type LinePoint = { time: number; value: number };

function closes(candles: Candle[]) {
  return candles.map((row) => ({
    time: row[0] > 1e12 ? Math.floor(row[0] / 1000) : row[0],
    close: row[4],
  }));
}

export function sma(candles: Candle[], period = 20): LinePoint[] {
  const rows = closes(candles);
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < rows.length; i += 1) {
    sum += rows[i].close;
    if (i >= period) sum -= rows[i - period].close;
    if (i >= period - 1) out.push({ time: rows[i].time, value: sum / period });
  }
  return out;
}

export function ema(candles: Candle[], period = 20): LinePoint[] {
  const rows = closes(candles);
  if (rows.length < period) return [];
  const k = 2 / (period + 1);
  let prev = rows.slice(0, period).reduce((acc, row) => acc + row.close, 0) / period;
  const out: LinePoint[] = [{ time: rows[period - 1].time, value: prev }];
  for (let i = period; i < rows.length; i += 1) {
    prev = rows[i].close * k + prev * (1 - k);
    out.push({ time: rows[i].time, value: prev });
  }
  return out;
}

export function bollinger(candles: Candle[], period = 20, mult = 2) {
  const rows = closes(candles);
  const mid: LinePoint[] = [];
  const upper: LinePoint[] = [];
  const lower: LinePoint[] = [];
  for (let i = period - 1; i < rows.length; i += 1) {
    const slice = rows.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, row) => acc + row.close, 0) / period;
    const variance =
      slice.reduce((acc, row) => acc + (row.close - mean) ** 2, 0) / period;
    const dev = Math.sqrt(variance);
    mid.push({ time: rows[i].time, value: mean });
    upper.push({ time: rows[i].time, value: mean + mult * dev });
    lower.push({ time: rows[i].time, value: mean - mult * dev });
  }
  return { mid, upper, lower };
}

export function wma(candles: Candle[], period = 20): LinePoint[] {
  const rows = closes(candles);
  const out: LinePoint[] = [];
  const den = (period * (period + 1)) / 2;
  for (let i = period - 1; i < rows.length; i += 1) {
    let acc = 0;
    for (let j = 0; j < period; j += 1) {
      acc += rows[i - period + 1 + j].close * (j + 1);
    }
    out.push({ time: rows[i].time, value: acc / den });
  }
  return out;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9) {
  const rows = closes(candles);
  const kFast = 2 / (fast + 1);
  const kSlow = 2 / (slow + 1);
  const kSig = 2 / (signal + 1);
  let emaFast = 0;
  let emaSlow = 0;
  let emaSig = 0;
  const line: LinePoint[] = [];
  const sig: LinePoint[] = [];
  const hist: LinePoint[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const price = rows[i].close;
    emaFast = i === 0 ? price : price * kFast + emaFast * (1 - kFast);
    emaSlow = i === 0 ? price : price * kSlow + emaSlow * (1 - kSlow);
    if (i < slow - 1) continue;
    const value = emaFast - emaSlow;
    emaSig = line.length === 0 ? value : value * kSig + emaSig * (1 - kSig);
    line.push({ time: rows[i].time, value });
    sig.push({ time: rows[i].time, value: emaSig });
    hist.push({ time: rows[i].time, value: value - emaSig });
  }
  return { line, signal: sig, hist };
}

export function stoch(candles: Candle[], period = 14, smooth = 3) {
  const rows = candles.map((row) => ({
    time: row[0] > 1e12 ? Math.floor(row[0] / 1000) : row[0],
    high: row[2],
    low: row[3],
    close: row[4],
  }));
  const raw: LinePoint[] = [];
  for (let i = period - 1; i < rows.length; i += 1) {
    const slice = rows.slice(i - period + 1, i + 1);
    const hi = Math.max(...slice.map((item) => item.high));
    const lo = Math.min(...slice.map((item) => item.low));
    const value = hi === lo ? 50 : ((rows[i].close - lo) / (hi - lo)) * 100;
    raw.push({ time: rows[i].time, value });
  }
  const k: LinePoint[] = [];
  for (let i = smooth - 1; i < raw.length; i += 1) {
    const value =
      raw.slice(i - smooth + 1, i + 1).reduce((acc, item) => acc + item.value, 0) /
      smooth;
    k.push({ time: raw[i].time, value });
  }
  const d: LinePoint[] = [];
  for (let i = smooth - 1; i < k.length; i += 1) {
    const value =
      k.slice(i - smooth + 1, i + 1).reduce((acc, item) => acc + item.value, 0) /
      smooth;
    d.push({ time: k[i].time, value });
  }
  return { k, d };
}

export function momentum(candles: Candle[], period = 10): LinePoint[] {
  const rows = closes(candles);
  const out: LinePoint[] = [];
  for (let i = period; i < rows.length; i += 1) {
    out.push({
      time: rows[i].time,
      value: rows[i].close - rows[i - period].close,
    });
  }
  return out;
}

export function atr(candles: Candle[], period = 14): LinePoint[] {
  const rows = candles.map((row) => ({
    time: row[0] > 1e12 ? Math.floor(row[0] / 1000) : row[0],
    high: row[2],
    low: row[3],
    close: row[4],
  }));
  if (rows.length <= period) return [];
  const trs: number[] = [rows[0].high - rows[0].low];
  for (let i = 1; i < rows.length; i += 1) {
    trs.push(
      Math.max(
        rows[i].high - rows[i].low,
        Math.abs(rows[i].high - rows[i - 1].close),
        Math.abs(rows[i].low - rows[i - 1].close),
      ),
    );
  }
  let prev = trs.slice(1, period + 1).reduce((acc, item) => acc + item, 0) / period;
  const out: LinePoint[] = [{ time: rows[period].time, value: prev }];
  for (let i = period + 1; i < rows.length; i += 1) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out.push({ time: rows[i].time, value: prev });
  }
  return out;
}

export function rsi(candles: Candle[], period = 14): LinePoint[] {
  const rows = closes(candles);
  if (rows.length <= period) return [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = rows[i].close - rows[i - 1].close;
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  gain /= period;
  loss /= period;
  const out: LinePoint[] = [];
  const push = (index: number) => {
    const rs = loss === 0 ? 100 : gain / loss;
    out.push({ time: rows[index].time, value: 100 - 100 / (1 + rs) });
  };
  push(period);
  for (let i = period + 1; i < rows.length; i += 1) {
    const delta = rows[i].close - rows[i - 1].close;
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
    push(i);
  }
  return out;
}

export function volume(candles: Candle[]) {
  return candles
    .map((row) => {
      const time = row[0] > 1e12 ? Math.floor(row[0] / 1000) : row[0];
      const raw = row[5];
      const value =
        raw != null && Number.isFinite(raw) && raw > 0
          ? raw
          : Math.max(row[2] - row[3], 0);
      return {
        time,
        value,
        color: row[4] >= row[1] ? "#0ecb8177" : "#f6465d77",
      };
    })
    .filter((item) => Number.isFinite(item.time) && Number.isFinite(item.value));
}

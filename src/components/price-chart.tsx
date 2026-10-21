"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Logical,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  Activity,
  BarChart3,
  ChartLine,
  ChevronDown,
  Gauge,
  LineChart,
  Minus,
  MousePointer2,
  Scan,
  Square,
  Trash2,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import { atr, bollinger, ema, macd, momentum, rsi, sma, stoch, volume, wma } from "@/lib/indicators";
import { BoardPlace } from "@/components/board-place";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { money, quoteDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Candle, OpenTrade } from "@/lib/types";

type Tool = "cursor" | "hline" | "vline" | "trend" | "rect" | "fib";
type DrawKind = Exclude<Tool, "cursor">;
type Ind = "sma" | "ema" | "wma" | "bb" | "vol" | "rsi" | "macd" | "stoch" | "mom" | "atr";
type ChartStyle = "candle" | "bar" | "line" | "area" | "heikin";
type Sel = { kind: DrawKind; id: string };

interface PriceChartProps {
  pairId: number | null;
  interval: string;
  intervalMs: number;
  candles: Candle[];
  lastPrice?: number;
  digits?: number;
  empty?: boolean;
  loading?: boolean;
  label?: string;
  trades?: OpenTrade[];
  previewSec?: number;
}

type Bar = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Point = { time: UTCTimestamp; price: number; logical: number };

function toBars(candles: Candle[]) {
  const bars: Bar[] = [];
  let last = -Infinity;
  for (const row of candles) {
    if (!Array.isArray(row) || row.length < 5) continue;
    let time = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    if (![time, open, high, low, close].every(Number.isFinite)) continue;
    if (time > 1e12) time = Math.floor(time / 1000);
    if (time <= last) continue;
    last = time;
    bars.push({
      time: time as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
  }
  return bars;
}

function toSec(ms: number) {
  return ms > 1e12 ? Math.floor(ms / 1000) : ms;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function remain(closeTs: number, now: number) {
  const closeMs = closeTs > 1e12 ? closeTs : closeTs * 1000;
  const sec = Math.max(0, Math.floor((closeMs - now) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function placeFlags(
  items: Array<{ id: number; y: number }>,
  height: number,
  size = 24,
) {
  const top = 48;
  const ordered = [...items].sort((a, b) => a.y - b.y);
  const placed: Array<{ id: number; y: number }> = [];
  for (const item of ordered) {
    let y = Math.max(top, item.y);
    const last = placed[placed.length - 1];
    if (last && y < last.y + size) y = last.y + size;
    if (y + size > height - 10) y = Math.max(top, height - 10 - size);
    placed.push({ id: item.id, y });
  }
  return new Map(placed.map((item) => [item.id, item.y]));
}

function estimate(trade: OpenTrade, current?: number) {
  if (current == null) return null;
  const delta = current - trade.open_price;
  if (delta === 0) return 0;
  const win = trade.action === "up" ? delta > 0 : delta < 0;
  return win ? trade.potential_profit : -trade.amount;
}

function asHeikin(bars: Bar[]) {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const close = (bar.open + bar.high + bar.low + bar.close) / 4;
    const open =
      i === 0 ? (bar.open + bar.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: bar.time,
      open,
      close,
      high: Math.max(bar.high, open, close),
      low: Math.min(bar.low, open, close),
    });
  }
  return out;
}

function asClose(bars: Bar[]) {
  return bars.map((bar) => ({ time: bar.time, value: bar.close }));
}

function mapMain(bars: Bar[], style: ChartStyle) {
  if (style === "line" || style === "area") return asClose(bars);
  if (style === "heikin") return asHeikin(bars);
  return bars;
}

function asLine(points: Array<{ time: number; value: number }>) {
  return points.map((item) => ({
    time: item.time as UTCTimestamp,
    value: item.value,
  }));
}

function xFromLogical(
  xAtIndex: (index: number) => number | null,
  logical: number,
  spacing: number,
) {
  if (!Number.isFinite(logical) || !(spacing > 0)) return null;
  const i0 = Math.floor(logical);
  const x0 = xAtIndex(i0);
  if (x0 == null) return null;
  return x0 + (logical - i0) * spacing;
}

function VLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18" />
    </svg>
  );
}

function FibIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 10h16M4 14h10M4 18h6" />
    </svg>
  );
}

const CHART_STYLES = [
  { id: "candle" as const, title: "Candles" },
  { id: "bar" as const, title: "Bars" },
  { id: "line" as const, title: "Line" },
  { id: "area" as const, title: "Area" },
  { id: "heikin" as const, title: "Heikin Ashi" },
];

function addMainSeries(chart: IChartApi, style: ChartStyle, precision: number) {
  const price = {
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineColor: "#80f6bc",
    priceLineWidth: 1 as const,
    priceLineStyle: LineStyle.Dashed,
    priceFormat: {
      type: "price" as const,
      precision,
      minMove: 10 ** -precision,
    },
  };
  if (style === "bar") {
    return chart.addSeries(BarSeries, {
      upColor: "#0ecb81",
      downColor: "#f6465d",
      ...price,
    });
  }
  if (style === "line") {
    return chart.addSeries(LineSeries, {
      color: "#80f6bc",
      lineWidth: 2,
      ...price,
    });
  }
  if (style === "area") {
    return chart.addSeries(AreaSeries, {
      lineColor: "#80f6bc",
      topColor: "rgba(128,246,188,0.28)",
      bottomColor: "rgba(128,246,188,0.02)",
      lineWidth: 2,
      ...price,
    });
  }
  return chart.addSeries(CandlestickSeries, {
    upColor: "#0ecb81",
    downColor: "#f6465d",
    borderVisible: false,
    wickUpColor: "#0ecb81",
    wickDownColor: "#f6465d",
    ...price,
  });
}

const DRAW_TOOLS = [
  { id: "cursor" as const, title: "Cursor", hint: "Pan the chart", Icon: MousePointer2 },
  { id: "hline" as const, title: "Horizontal", hint: "Price level", Icon: Minus },
  { id: "vline" as const, title: "Vertical", hint: "Time marker", Icon: VLineIcon },
  { id: "trend" as const, title: "Trend line", hint: "Click and drag", Icon: TrendingUp },
  { id: "rect" as const, title: "Rectangle", hint: "Click and drag", Icon: Square },
  { id: "fib" as const, title: "Fibonacci", hint: "Click and drag", Icon: FibIcon },
];

const IND_ITEMS = [
  { id: "sma" as const, title: "SMA 20", tone: "Average", Icon: LineChart },
  { id: "ema" as const, title: "EMA 20", tone: "Exponential", Icon: TrendingUp },
  { id: "wma" as const, title: "WMA 20", tone: "Weighted", Icon: Waves },
  { id: "bb" as const, title: "Bollinger 20", tone: "Bands", Icon: ChartLine },
  { id: "vol" as const, title: "Volume", tone: "Volume", Icon: BarChart3 },
  { id: "atr" as const, title: "ATR 14", tone: "Volatility", Icon: Gauge },
  { id: "rsi" as const, title: "RSI 14", tone: "Oscillator", Icon: Activity },
  { id: "macd" as const, title: "MACD", tone: "Trend", Icon: BarChart3 },
  { id: "stoch" as const, title: "Stochastic", tone: "K/D", Icon: Activity },
  { id: "mom" as const, title: "Momentum 10", tone: "Momentum", Icon: Gauge },
];

export function PriceChart({
  pairId,
  interval,
  intervalMs,
  candles,
  lastPrice,
  digits = 5,
  empty = false,
  loading = false,
  label,
  trades = [],
}: PriceChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const smaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLoRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiRef = useRef<ISeriesApi<"Line"> | null>(null);
  const wmaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const atrRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSigRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const stochKRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stochDRef = useRef<ISeriesApi<"Line"> | null>(null);
  const momRef = useRef<ISeriesApi<"Line"> | null>(null);
  const entryLinesRef = useRef<IPriceLine[]>([]);
  const drawLinesRef = useRef<IPriceLine[]>([]);
  const seedRef = useRef("");
  const lastBarRef = useRef<number | null>(null);
  const entryBarRef = useRef<Map<number, number>>(new Map());
  const toolRef = useRef<Tool>("cursor");
  const pendingRef = useRef<Point | null>(null);
  const [tool, setTool] = useState<Tool>("cursor");
  const [style, setStyle] = useState<ChartStyle>("candle");
  const styleRef = useRef<ChartStyle>("candle");
  styleRef.current = style;
  const [inds, setInds] = useState<Record<Ind, boolean>>({
    sma: false,
    ema: false,
    wma: false,
    bb: false,
    vol: true,
    rsi: false,
    macd: false,
    stoch: false,
    mom: false,
    atr: false,
  });
  const [hlines, setHlines] = useState<Array<{ id: string; price: number }>>([]);
  const [vlines, setVlines] = useState<Array<{ id: string; time: number; logical: number }>>([]);
  const [trends, setTrends] = useState<Array<{ id: string; a: Point; b: Point }>>(
    [],
  );
  const [rects, setRects] = useState<Array<{ id: string; a: Point; b: Point }>>(
    [],
  );
  const [fibs, setFibs] = useState<Array<{ id: string; lo: number; hi: number }>>(
    [],
  );
  const [frame, setFrame] = useState(0);
  const [draft, setDraft] = useState<{ a: Point; b: Point } | null>(null);
  const [selected, setSelected] = useState<Sel | null>(null);
  const dragRef = useRef<{
    kind: DrawKind;
    id: string;
    start: Point;
    price?: number;
    logical?: number;
    time?: number;
    a?: Point;
    b?: Point;
    lo?: number;
    hi?: number;
  } | null>(null);
  const intervalMsRef = useRef(intervalMs);
  const barsRef = useRef<Bar[]>([]);
  const lastPriceRef = useRef(lastPrice);
  const tradesRef = useRef<OpenTrade[]>([]);
  intervalMsRef.current = intervalMs;
  lastPriceRef.current = lastPrice;
  toolRef.current = tool;

  const bars = useMemo(() => toBars(candles), [candles]);
  barsRef.current = bars;
  const activeTrades = useMemo(
    () => trades.filter((item) => item.asset_id === pairId),
    [trades, pairId],
  );
  tradesRef.current = activeTrades;

  useEffect(() => {
    setHlines([]);
    setVlines([]);
    setTrends([]);
    setRects([]);
    setFibs([]);
    pendingRef.current = null;
    setTool("cursor");
    setSelected(null);
    dragRef.current = null;
    entryBarRef.current.clear();
  }, [pairId, interval]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const precision = Math.max(1, quoteDigits(digits));
    const chart = createChart(host, {
      width: Math.max(host.clientWidth, 1),
      height: Math.max(host.clientHeight, 1),
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#848e9c",
        fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#80f6bc88", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1a3a2e" },
        horzLine: { color: "#80f6bc88", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1a3a2e" },
      },
      rightPriceScale: { borderColor: "#2b3139" },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      timeScale: {
        borderColor: "#2b3139",
        timeVisible: true,
        secondsVisible: interval.endsWith("s"),
        rightOffset: 12,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
        minBarSpacing: 4,
        shiftVisibleRangeOnNewBar: true,
      },
    });
    chartRef.current = chart;
    seriesRef.current = addMainSeries(chart, styleRef.current, precision) as ISeriesApi<"Candlestick">;
    seedRef.current = "";
    lastBarRef.current = null;
    const observer = new ResizeObserver(() => {
      chart.applyOptions({
        width: Math.max(host.clientWidth, 1),
        height: Math.max(host.clientHeight, 1),
      });
    });
    observer.observe(host);
    const bump = () => setFrame((n) => n + 1);
    const onRange = (range: { from: number; to: number } | null) => {
      if (range && range.from < -0.2) {
        const span = Math.max(30, range.to - range.from);
        chart.timeScale().setVisibleLogicalRange({ from: 0, to: span });
        return;
      }
      seriesRef.current?.priceScale().applyOptions({ autoScale: true });
      bump();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const timer = window.setInterval(bump, 250);
    return () => {
      window.clearInterval(timer);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      smaRef.current = null;
      emaRef.current = null;
      bbMidRef.current = null;
      bbUpRef.current = null;
      bbLoRef.current = null;
      rsiRef.current = null;
      wmaRef.current = null;
      atrRef.current = null;
      macdRef.current = null;
      macdSigRef.current = null;
      macdHistRef.current = null;
      volRef.current = null;
      stochKRef.current = null;
      stochDRef.current = null;
      momRef.current = null;
      entryLinesRef.current = [];
      drawLinesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const draw = tool !== "cursor";
    chart.applyOptions({
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: !draw,
        horzTouchDrag: !draw,
        vertTouchDrag: !draw,
      },
      handleScale: {
        mouseWheel: !draw,
        pinch: !draw,
        axisPressedMouseMove: !draw,
      },
    });
  }, [tool]);

  function pickPoint(clientX: number, clientY: number): Point | null {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const host = hostRef.current;
    if (!series || !chart || !host) return null;
    const box = host.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const px = series.coordinateToPrice(y);
    const logical = chart.timeScale().coordinateToLogical(x);
    if (px == null || !Number.isFinite(px) || logical == null || !Number.isFinite(logical)) {
      return null;
    }
    const first = barsRef.current[0];
    const step = intervalMsRef.current / 1000;
    const unix = first ? Number(first.time) + logical * step : logical;
    return { time: unix as UTCTimestamp, price: px, logical };
  }

  function shiftPoint(origin: Point, dLog: number, dPrice: number): Point {
    const logical = origin.logical + dLog;
    const first = barsRef.current[0];
    const step = intervalMsRef.current / 1000;
    const unix = first ? Number(first.time) + logical * step : logical;
    return { time: unix as UTCTimestamp, price: origin.price + dPrice, logical };
  }

  function finishDraw(kind: DrawKind, id: string) {
    setSelected({ kind, id });
    setTool("cursor");
  }

  function removeDraw(sel: Sel) {
    if (sel.kind === "hline") setHlines((rows) => rows.filter((row) => row.id !== sel.id));
    if (sel.kind === "vline") setVlines((rows) => rows.filter((row) => row.id !== sel.id));
    if (sel.kind === "trend") setTrends((rows) => rows.filter((row) => row.id !== sel.id));
    if (sel.kind === "rect") setRects((rows) => rows.filter((row) => row.id !== sel.id));
    if (sel.kind === "fib") setFibs((rows) => rows.filter((row) => row.id !== sel.id));
    setSelected((current) => (current?.id === sel.id ? null : current));
  }

  function commit(a: Point, b: Point) {
    const mode = toolRef.current;
    const id = uid();
    if (mode === "hline") {
      setHlines((rows) => [...rows, { id, price: b.price }]);
      finishDraw("hline", id);
      return;
    }
    if (mode === "vline") {
      setVlines((rows) => [...rows, { id, time: Number(b.time), logical: b.logical }]);
      finishDraw("vline", id);
      return;
    }
    if (mode === "trend") {
      setTrends((rows) => [...rows, { id, a, b }]);
      finishDraw("trend", id);
      return;
    }
    if (mode === "rect") {
      setRects((rows) => [...rows, { id, a, b }]);
      finishDraw("rect", id);
      return;
    }
    if (mode === "fib") {
      setFibs((rows) => [
        ...rows,
        { id, lo: Math.min(a.price, b.price), hi: Math.max(a.price, b.price) },
      ]);
      finishDraw("fib", id);
    }
  }

  function onEditDown(
    event: PointerEvent<Element>,
    kind: DrawKind,
    id: string,
    extra: {
      price?: number;
      logical?: number;
      time?: number;
      a?: Point;
      b?: Point;
      lo?: number;
      hi?: number;
    },
  ) {
    const point = pickPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    setSelected({ kind, id });
    dragRef.current = { kind, id, start: point, ...extra };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onEditMove(event: PointerEvent<Element>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pickPoint(event.clientX, event.clientY);
    if (!point) return;
    const dLog = point.logical - drag.start.logical;
    const dPrice = point.price - drag.start.price;
    if (drag.kind === "hline" && drag.price != null) {
      setHlines((rows) =>
        rows.map((row) => (row.id === drag.id ? { ...row, price: drag.price! + dPrice } : row)),
      );
      return;
    }
    if (drag.kind === "vline") {
      setVlines((rows) =>
        rows.map((row) =>
          row.id === drag.id
            ? { ...row, time: Number(point.time), logical: point.logical }
            : row,
        ),
      );
      return;
    }
    if ((drag.kind === "trend" || drag.kind === "rect") && drag.a && drag.b) {
      const next = { a: shiftPoint(drag.a, dLog, dPrice), b: shiftPoint(drag.b, dLog, dPrice) };
      if (drag.kind === "trend") {
        setTrends((rows) => rows.map((row) => (row.id === drag.id ? { ...row, ...next } : row)));
      } else {
        setRects((rows) => rows.map((row) => (row.id === drag.id ? { ...row, ...next } : row)));
      }
      return;
    }
    if (drag.kind === "fib" && drag.lo != null && drag.hi != null) {
      setFibs((rows) =>
        rows.map((row) =>
          row.id === drag.id
            ? { ...row, lo: drag.lo! + dPrice, hi: drag.hi! + dPrice }
            : row,
        ),
      );
    }
  }

  function onEditUp() {
    dragRef.current = null;
  }

  function onDrawDown(event: PointerEvent<HTMLDivElement>) {
    if (tool === "cursor") return;
    event.preventDefault();
    const point = pickPoint(event.clientX, event.clientY);
    if (!point) return;
    pendingRef.current = point;
    setDraft({ a: point, b: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDrawMove(event: PointerEvent<HTMLDivElement>) {
    if (!pendingRef.current) return;
    const point = pickPoint(event.clientX, event.clientY);
    if (!point) return;
    setDraft({ a: pendingRef.current, b: point });
  }

  function onDrawUp(event: PointerEvent<HTMLDivElement>) {
    const start = pendingRef.current;
    pendingRef.current = null;
    const point = pickPoint(event.clientX, event.clientY) ?? draft?.b;
    setDraft(null);
    if (!start || !point) return;
    commit(start, point);
  }

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const precision = Math.max(1, quoteDigits(digits));
    series.applyOptions({
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
      priceLineColor: "#80f6bc",
      priceLineStyle: LineStyle.Dashed,
    });
    chart.applyOptions({
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        vertLine: { color: "#80f6bc88", labelBackgroundColor: "#1a3a2e" },
        horzLine: { color: "#80f6bc88", labelBackgroundColor: "#1a3a2e" },
      },
    });
    chart.timeScale().applyOptions({
      secondsVisible: interval.endsWith("s"),
    });
  }, [digits, interval]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const precision = Math.max(1, quoteDigits(digits));
    if (seriesRef.current) {
      try {
        chart.removeSeries(seriesRef.current);
      } catch {
        seriesRef.current = null;
      }
    }
    seriesRef.current = addMainSeries(chart, style, precision) as ISeriesApi<"Candlestick">;
    seedRef.current = "";
    lastBarRef.current = null;
    const mapped = mapMain(barsRef.current, style);
    if (mapped.length) {
      seriesRef.current.setData(mapped as never);
      lastBarRef.current = Number(barsRef.current[barsRef.current.length - 1].time);
    }
    setFrame((n) => n + 1);
  }, [style, digits]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data = bars;
    const seed = `${pairId}:${interval}:${style}`;
    const extra = Math.min(
      18,
      Math.max(
        10,
        ...activeTrades.map((trade) => {
          const last = data[data.length - 1];
          if (!last) return 10;
          return Math.ceil((toSec(trade.close_timestamp) - Number(last.time)) / (intervalMs / 1000)) + 4;
        }),
      ),
    );
    chart.timeScale().applyOptions({ rightOffset: extra, fixLeftEdge: false, minBarSpacing: 4 });
    const mapped = mapMain(data, style);
    if (seedRef.current !== seed) {
      if (!mapped.length) return;
      series.setData(mapped as never);
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, data.length - 72),
        to: data.length + extra,
      });
      seedRef.current = seed;
      lastBarRef.current = Number(data[data.length - 1].time);
      return;
    }
    if (!mapped.length) return;
    const last = mapped[mapped.length - 1];
    const time = Number(data[data.length - 1].time);
    const prev = lastBarRef.current;
    if (prev == null || time < prev) {
      series.setData(mapped as never);
      lastBarRef.current = time;
      return;
    }
    series.update(last as never);
    lastBarRef.current = time;
  }, [bars, pairId, interval, intervalMs, activeTrades, style]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || loading || lastPrice == null || !bars.length) return;
    const last = bars[bars.length - 1];
    if (style === "line" || style === "area") {
      series.update({ time: last.time, value: lastPrice } as never);
      return;
    }
    const live: Bar = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, lastPrice),
      low: Math.min(last.low, lastPrice),
      close: lastPrice,
    };
    if (style === "heikin") {
      const ha = asHeikin([...bars.slice(0, -1), live]);
      series.update(ha[ha.length - 1] as never);
      return;
    }
    series.update(live as never);
  }, [bars, lastPrice, loading, style]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ensure = (
      ref: MutableRefObject<ISeriesApi<"Line"> | null>,
      color: string,
      scale?: string,
    ) => {
      if (ref.current) return ref.current;
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: scale ?? "right",
      });
      ref.current = line;
      return line;
    };
    const drop = (ref: MutableRefObject<ISeriesApi<"Line"> | null>) => {
      if (!ref.current) return;
      try {
        chart.removeSeries(ref.current);
      } catch {
        return;
      }
      ref.current = null;
    };
    if (inds.sma) ensure(smaRef, "#60a5fa").setData(asLine(sma(candles, 20)));
    else drop(smaRef);
    if (inds.ema) ensure(emaRef, "#c084fc").setData(asLine(ema(candles, 20)));
    else drop(emaRef);
    if (inds.wma) ensure(wmaRef, "#22d3ee").setData(asLine(wma(candles, 20)));
    else drop(wmaRef);
    if (inds.bb) {
      const band = bollinger(candles, 20);
      ensure(bbMidRef, "#80f6bc").setData(asLine(band.mid));
      ensure(bbUpRef, "#848e9c").setData(asLine(band.upper));
      ensure(bbLoRef, "#848e9c").setData(asLine(band.lower));
    } else {
      drop(bbMidRef);
      drop(bbUpRef);
      drop(bbLoRef);
    }
    if (inds.vol) {
      if (!volRef.current) {
        volRef.current = chart.addSeries(HistogramSeries, {
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "vol",
        });
      }
      volRef.current.setData(
        volume(candles).map((item) => ({
          time: item.time as UTCTimestamp,
          value: item.value,
          color: item.color,
        })),
      );
    } else if (volRef.current) {
      try {
        chart.removeSeries(volRef.current);
      } catch {
        volRef.current = null;
      }
      volRef.current = null;
    }
    if (inds.atr) ensure(atrRef, "#fb7185", "atr").setData(asLine(atr(candles, 14)));
    else drop(atrRef);
    if (inds.rsi) ensure(rsiRef, "#80f6bc", "rsi").setData(asLine(rsi(candles, 14)));
    else drop(rsiRef);
    if (inds.macd) {
      const next = macd(candles);
      ensure(macdRef, "#60a5fa", "macd").setData(asLine(next.line));
      ensure(macdSigRef, "#80f6bc", "macd").setData(asLine(next.signal));
      if (!macdHistRef.current) {
        macdHistRef.current = chart.addSeries(HistogramSeries, {
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "macd",
        });
      }
      macdHistRef.current.setData(
        next.hist.map((item) => ({
          time: item.time as UTCTimestamp,
          value: item.value,
          color: item.value >= 0 ? "#0ecb8188" : "#f6465d88",
        })),
      );
    } else {
      drop(macdRef);
      drop(macdSigRef);
      if (macdHistRef.current) {
        try {
          chart.removeSeries(macdHistRef.current);
        } catch {
          macdHistRef.current = null;
        }
        macdHistRef.current = null;
      }
    }
    if (inds.stoch) {
      const next = stoch(candles);
      ensure(stochKRef, "#80f6bc", "stoch").setData(asLine(next.k));
      ensure(stochDRef, "#60a5fa", "stoch").setData(asLine(next.d));
    } else {
      drop(stochKRef);
      drop(stochDRef);
    }
    if (inds.mom) ensure(momRef, "#c084fc", "mom").setData(asLine(momentum(candles, 10)));
    else drop(momRef);
    const panes = [
      inds.vol ? "vol" : null,
      inds.rsi ? "rsi" : null,
      inds.macd ? "macd" : null,
      inds.stoch ? "stoch" : null,
      inds.mom ? "mom" : null,
      inds.atr ? "atr" : null,
    ].filter((id): id is string => Boolean(id));
    seriesRef.current?.applyOptions({
      autoscaleInfoProvider: () => {
        const range = chart.timeScale().getVisibleLogicalRange();
        const data = barsRef.current;
        let lo = Infinity;
        let hi = -Infinity;
        if (range && data.length) {
          const from = Math.max(0, Math.floor(range.from));
          const to = Math.min(data.length - 1, Math.ceil(range.to));
          for (let i = from; i <= to; i++) {
            const bar = data[i];
            if (!bar) continue;
            if (bar.low < lo) lo = bar.low;
            if (bar.high > hi) hi = bar.high;
          }
        }
        const live = lastPriceRef.current;
        if (live != null && Number.isFinite(live)) {
          lo = Math.min(lo, live);
          hi = Math.max(hi, live);
        }
        for (const trade of tradesRef.current) {
          if (trade.open_price > 0) {
            lo = Math.min(lo, trade.open_price);
            hi = Math.max(hi, trade.open_price);
          }
        }
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
        if (hi - lo < 1e-12) {
          const slack = Math.max(Math.abs(lo) * 0.0008, 1e-8);
          lo -= slack;
          hi += slack;
        }
        const pad = (hi - lo) * 0.18;
        return {
          priceRange: {
            minValue: lo - pad,
            maxValue: hi + pad,
          },
        };
      },
    });
    const paneH = panes.length ? Math.min(0.15, 0.5 / panes.length) : 0;
    seriesRef.current?.priceScale().applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: panes.length ? panes.length * paneH + 0.02 : 0.08 },
    });
    panes.forEach((id, index) => {
      const bottom = (panes.length - 1 - index) * paneH;
      chart.priceScale(id).applyOptions({
        scaleMargins: { top: 1 - bottom - paneH, bottom },
        borderVisible: false,
      });
    });
  }, [candles, inds, activeTrades]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of drawLinesRef.current) series.removePriceLine(line);
    const next: IPriceLine[] = [];
    for (const item of hlines) {
      next.push(
        series.createPriceLine({
          price: item.price,
          color: "#80f6bc",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        }),
      );
    }
    for (const item of fibs) {
      const span = item.hi - item.lo || 1;
      for (const level of [0, 0.236, 0.382, 0.5, 0.618, 1]) {
        next.push(
          series.createPriceLine({
            price: item.lo + span * level,
            color: "#80f6bc",
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: false,
            title: "",
          }),
        );
      }
    }
    drawLinesRef.current = next;
  }, [hlines, fibs, style]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const line of entryLinesRef.current) series.removePriceLine(line);
    entryLinesRef.current = [];
  }, [activeTrades]);

  const overlay = useMemo(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const wrap = wrapRef.current;
    if (!chart || !series || !wrap) return null;
    const last = bars[bars.length - 1];
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const step = intervalMs / 1000;
    const spacing = chart.timeScale().options().barSpacing ?? 6;
    const xAtIndex = (index: number) =>
      chart.timeScale().logicalToCoordinate(index as Logical);
    const barW = Math.max(4, spacing);
    const indexAt = (unix: number) => {
      if (!bars.length) return 0;
      const lastI = bars.length - 1;
      const firstT = Number(bars[0].time);
      const lastT = Number(bars[lastI].time);
      if (unix >= lastT) return lastI;
      if (unix <= firstT) return 0;
      let lo = 0;
      let hi = lastI;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (Number(bars[mid].time) <= unix) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    const xAt = (unix: number) => {
      if (!bars.length || step <= 0) return null;
      const firstT = Number(bars[0].time);
      const lastI = bars.length - 1;
      const lastT = Number(bars[lastI].time);
      let logical = 0;
      if (unix >= lastT) logical = lastI + (unix - lastT) / step;
      else if (unix <= firstT) logical = (unix - firstT) / step;
      else {
        const lo = indexAt(unix);
        const hi = Math.min(lastI, lo + 1);
        const t0 = Number(bars[lo].time);
        const t1 = Number(bars[hi].time);
        logical = lo + (t1 === t0 ? 0 : (unix - t0) / (t1 - t0));
      }
      return xFromLogical(xAtIndex, logical, spacing);
    };
    const xPoint = (point: Point) => {
      return xFromLogical(xAtIndex, point.logical, spacing) ?? xAt(Number(point.time));
    };
    const lastI = bars.length - 1;
    const lastT = last ? Number(last.time) : 0;
    const nowSec = Date.now() / 1000;
    const pins = entryBarRef.current;
    const liveIds = new Set(activeTrades.map((item) => item.id));
    for (const id of [...pins.keys()]) {
      if (!liveIds.has(id)) pins.delete(id);
    }
    for (const trade of activeTrades) {
      if (pins.has(trade.id) || !bars.length) continue;
      const openSec = toSec(trade.open_timestamp);
      const onLive = openSec >= lastT || nowSec - openSec <= step;
      pins.set(
        trade.id,
        onLive ? lastT : Number(bars[indexAt(openSec)].time),
      );
    }
    const xEntry = (tradeId: number) => {
      const bucket = pins.get(tradeId);
      if (bucket == null || lastI < 0) return null;
      const found = bars.findIndex((item) => Number(item.time) === bucket);
      return xAtIndex(found >= 0 ? found : indexAt(bucket));
    };
    const items = activeTrades.map((trade) => {
      const age =
        Date.now() -
        (trade.open_timestamp > 1e12
          ? trade.open_timestamp
          : trade.open_timestamp * 1000);
      const entryPrice =
        lastPrice != null &&
        trade.open_price > 0 &&
        age < 2500 &&
        Math.abs(trade.open_price - lastPrice) / lastPrice > 0.0015
          ? lastPrice
          : trade.open_price || lastPrice;
      const entryY =
        entryPrice != null ? series.priceToCoordinate(entryPrice) : null;
      const expiryX = xAt(toSec(trade.close_timestamp));
      const openX = xEntry(trade.id);
      const pnl = estimate(trade, lastPrice);
      return { trade, entryY, expiryX, openX, pnl };
    });
    const lastX = lastI >= 0 ? xAtIndex(lastI) : null;
    const nowX =
      lastX != null && last && step > 0
        ? lastX + Math.min(1, Math.max(0, (nowSec - Number(last.time)) / step)) * barW
        : xAt(nowSec);
    const flagSource = items
      .filter((item) => item.entryY != null)
      .map((item) => ({ id: item.trade.id, y: (item.entryY as number) - 10 }));
    const flags = placeFlags(flagSource, height);
    const toBox = (item: { id: string; a: Point; b: Point }) => {
      const x1 = xPoint(item.a);
      const x2 = xPoint(item.b);
      const y1 = series.priceToCoordinate(item.a.price);
      const y2 = series.priceToCoordinate(item.b.price);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      return {
        id: item.id,
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        x1,
        y1,
        x2,
        y2,
      };
    };
    const boxes = rects.map(toBox).filter(Boolean);
    const verts = vlines
      .map((item) => {
        const x = xFromLogical(xAtIndex, item.logical, spacing) ?? xAt(item.time);
        return x == null ? null : { id: item.id, x };
      })
      .filter(Boolean);
    const trendLines = trends
      .map((item) => toBox({ id: item.id, a: item.a, b: item.b }))
      .filter(Boolean);
    const ghost = draft ? toBox({ id: "draft", a: draft.a, b: draft.b }) : null;
    const horiz = hlines
      .map((item) => {
        const y = series.priceToCoordinate(item.price);
        return y == null ? null : { id: item.id, y, price: item.price };
      })
      .filter(Boolean);
    const fibBoxes = fibs
      .map((item) => {
        const y1 = series.priceToCoordinate(item.hi);
        const y2 = series.priceToCoordinate(item.lo);
        if (y1 == null || y2 == null) return null;
        return {
          id: item.id,
          top: Math.min(y1, y2),
          height: Math.max(8, Math.abs(y2 - y1)),
          lo: item.lo,
          hi: item.hi,
        };
      })
      .filter(Boolean);
    void frame;
    return {
      width,
      height,
      items,
      boxes,
      verts,
      trendLines,
      ghost,
      flags,
      nowX,
      lastX,
      barW,
      horiz,
      fibBoxes,
    };
  }, [
    activeTrades,
    bars,
    lastPrice,
    intervalMs,
    rects,
    vlines,
    trends,
    hlines,
    fibs,
    draft,
    frame,
    tool,
  ]);

  function toggleInd(id: Ind) {
    setInds((current) => ({ ...current, [id]: !current[id] }));
  }

  function chooseTool(id: Tool) {
    pendingRef.current = null;
    setDraft(null);
    dragRef.current = null;
    if (id !== "cursor") setSelected(null);
    setTool((current) => (current === id && id !== "cursor" ? "cursor" : id));
  }

  function clearDraws() {
    pendingRef.current = null;
    setDraft(null);
    dragRef.current = null;
    setSelected(null);
    setHlines([]);
    setVlines([]);
    setTrends([]);
    setRects([]);
    setFibs([]);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "Escape") {
        setSelected(null);
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selected) {
        event.preventDefault();
        removeDraw(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  function resetView() {
    const chart = chartRef.current;
    const data = barsRef.current;
    if (!chart || !data.length) return;
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, data.length - 72),
      to: data.length + 12,
    });
    seriesRef.current?.priceScale().applyOptions({ autoScale: true });
  }

  const activeDraw = DRAW_TOOLS.find((item) => item.id === tool) ?? DRAW_TOOLS[0];
  const indOn = IND_ITEMS.filter((item) => inds[item.id]).length;

  return (
    <div ref={wrapRef} className="chart-stage relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="relative z-[1] h-full w-full" />
      {tool !== "cursor" ? (
        <div
          className="absolute inset-0 z-[6] cursor-crosshair touch-none"
          onPointerDown={onDrawDown}
          onPointerMove={onDrawMove}
          onPointerUp={onDrawUp}
          onPointerCancel={() => {
            pendingRef.current = null;
            setDraft(null);
          }}
        />
      ) : null}
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-[5]">
          {overlay.lastX != null ? (
            <div
              className="absolute top-0 bottom-0 bg-[#80f6bc]/[0.07]"
              style={{
                left: overlay.lastX - overlay.barW / 2,
                width: overlay.barW,
              }}
            />
          ) : null}
          {overlay.nowX != null ? (
            <div
              className="absolute top-0 bottom-0 w-px bg-[#80f6bc]/40"
              style={{ left: overlay.nowX }}
            />
          ) : null}
          {overlay.horiz.map((item) =>
            item ? (
              <div
                key={item.id}
                className={cn(
                  "absolute right-0 left-0 z-[7] h-3 -translate-y-1/2 cursor-move",
                  tool === "cursor" ? "pointer-events-auto" : "pointer-events-none",
                )}
                style={{ top: item.y }}
                onPointerDown={(event) =>
                  tool === "cursor" &&
                  onEditDown(event, "hline", item.id, { price: item.price })
                }
                onPointerMove={onEditMove}
                onPointerUp={onEditUp}
              >
                <div
                  className={cn(
                    "absolute inset-x-0 top-1/2 h-px -translate-y-1/2",
                    selected?.id === item.id ? "bg-[#80f6bc]" : "bg-transparent",
                  )}
                />
                {selected?.id === item.id ? (
                  <button
                    type="button"
                    className="pointer-events-auto absolute top-1/2 right-16 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm bg-[#0b0e11] text-[#80f6bc]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeDraw({ kind: "hline", id: item.id })}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null,
          )}
          {overlay.verts.map((item) =>
            item ? (
              <div
                key={item.id}
                className={cn(
                  "absolute top-0 bottom-0 z-[7] w-3 -translate-x-1/2 cursor-move",
                  tool === "cursor" ? "pointer-events-auto" : "pointer-events-none",
                )}
                style={{ left: item.x }}
                onPointerDown={(event) => {
                  if (tool !== "cursor") return;
                  const row = vlines.find((line) => line.id === item.id);
                  onEditDown(event, "vline", item.id, {
                    logical: row?.logical,
                    time: row?.time,
                  });
                }}
                onPointerMove={onEditMove}
                onPointerUp={onEditUp}
              >
                <div
                  className={cn(
                    "absolute inset-y-0 left-1/2 w-px -translate-x-1/2",
                    selected?.id === item.id ? "bg-[#80f6bc]" : "bg-[#80f6bc]/80",
                  )}
                />
                {selected?.id === item.id ? (
                  <button
                    type="button"
                    className="pointer-events-auto absolute top-12 left-1/2 flex size-5 -translate-x-1/2 items-center justify-center rounded-sm bg-[#0b0e11] text-[#80f6bc]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeDraw({ kind: "vline", id: item.id })}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null,
          )}
          {overlay.trendLines.map((item) =>
            item ? (
              <svg
                key={item.id}
                className={cn(
                  "absolute inset-0 z-[7] h-full w-full",
                  tool === "cursor" ? "pointer-events-auto" : "pointer-events-none",
                )}
                onPointerDown={(event) => {
                  if (tool !== "cursor") return;
                  const row = trends.find((line) => line.id === item.id);
                  if (!row) return;
                  onEditDown(event, "trend", item.id, { a: row.a, b: row.b });
                }}
                onPointerMove={onEditMove}
                onPointerUp={onEditUp}
              >
                <line
                  x1={item.x1}
                  y1={item.y1}
                  x2={item.x2}
                  y2={item.y2}
                  stroke="transparent"
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                <line
                  x1={item.x1}
                  y1={item.y1}
                  x2={item.x2}
                  y2={item.y2}
                  stroke="#80f6bc"
                  strokeWidth={selected?.id === item.id ? "2.2" : "1.6"}
                  strokeLinecap="round"
                />
                <circle cx={item.x1} cy={item.y1} r="3" fill="#80f6bc" />
                <circle cx={item.x2} cy={item.y2} r="3" fill="#80f6bc" />
              </svg>
            ) : null,
          )}
          {overlay.trendLines.map((item) =>
            item && selected?.id === item.id ? (
              <button
                key={`${item.id}-x`}
                type="button"
                className="pointer-events-auto absolute z-[8] flex size-5 items-center justify-center rounded-sm bg-[#0b0e11] text-[#80f6bc]"
                style={{
                  left: (item.x1 + item.x2) / 2 - 10,
                  top: (item.y1 + item.y2) / 2 - 18,
                }}
                onClick={() => removeDraw({ kind: "trend", id: item.id })}
              >
                <X className="size-3" />
              </button>
            ) : null,
          )}
          {overlay.boxes.map((item) =>
            item ? (
              <div
                key={item.id}
                className={cn(
                  "absolute z-[7] cursor-move border bg-[#80f6bc]/10",
                  selected?.id === item.id ? "border-[#80f6bc]" : "border-[#80f6bc]/80",
                  tool === "cursor" ? "pointer-events-auto" : "pointer-events-none",
                )}
                style={{
                  left: item.left,
                  top: item.top,
                  width: Math.max(8, item.width),
                  height: Math.max(8, item.height),
                }}
                onPointerDown={(event) => {
                  if (tool !== "cursor") return;
                  const row = rects.find((box) => box.id === item.id);
                  if (!row) return;
                  onEditDown(event, "rect", item.id, { a: row.a, b: row.b });
                }}
                onPointerMove={onEditMove}
                onPointerUp={onEditUp}
              >
                {selected?.id === item.id ? (
                  <button
                    type="button"
                    className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-sm bg-[#0b0e11] text-[#80f6bc]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeDraw({ kind: "rect", id: item.id })}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null,
          )}
          {overlay.fibBoxes.map((item) =>
            item ? (
              <div
                key={item.id}
                className={cn(
                  "absolute right-14 left-0 z-[7] cursor-move border border-dashed",
                  selected?.id === item.id ? "border-[#80f6bc]/70" : "border-[#80f6bc]/25",
                  tool === "cursor" ? "pointer-events-auto" : "pointer-events-none",
                )}
                style={{ top: item.top, height: item.height }}
                onPointerDown={(event) =>
                  tool === "cursor" &&
                  onEditDown(event, "fib", item.id, { lo: item.lo, hi: item.hi })
                }
                onPointerMove={onEditMove}
                onPointerUp={onEditUp}
              >
                {selected?.id === item.id ? (
                  <button
                    type="button"
                    className="absolute -top-2 right-2 flex size-5 items-center justify-center rounded-sm bg-[#0b0e11] text-[#80f6bc]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeDraw({ kind: "fib", id: item.id })}
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null,
          )}
          {overlay.ghost && tool === "hline" ? (
            <div
              className="absolute right-0 left-0 h-px bg-[#80f6bc]"
              style={{ top: overlay.ghost.y2 }}
            />
          ) : null}
          {overlay.ghost && tool === "vline" ? (
            <div
              className="absolute top-0 bottom-0 w-px bg-[#80f6bc]"
              style={{ left: overlay.ghost.x2 }}
            />
          ) : null}
          {overlay.ghost && (tool === "rect" || tool === "fib") ? (
            <div
              className="absolute border border-dashed border-[#80f6bc] bg-[#80f6bc]/10"
              style={{
                left: overlay.ghost.left,
                top: overlay.ghost.top,
                width: Math.max(2, overlay.ghost.width),
                height: Math.max(2, overlay.ghost.height),
              }}
            />
          ) : null}
          {overlay.ghost && tool === "trend" ? (
            <svg className="absolute inset-0 h-full w-full">
              <line
                x1={overlay.ghost.x1}
                y1={overlay.ghost.y1}
                x2={overlay.ghost.x2}
                y2={overlay.ghost.y2}
                stroke="#80f6bc"
                strokeWidth="1.4"
              />
            </svg>
          ) : null}
          {overlay.items.map(({ trade, entryY, expiryX, openX, pnl }) => {
            const axisPad = 58;
            const from = openX ?? Math.max(0, (expiryX ?? overlay.width - axisPad) - 72);
            const to = Math.max(expiryX ?? from + 72, from + 72);
            const flagLeft = Math.min(
              Math.max(8, to + 6),
              overlay.width - 132,
            );
            const flagTop =
              overlay.flags.get(trade.id) ?? Math.max(48, (entryY ?? 40) - 10);
            const mark = "#ff8d3a";
            return (
              <div key={trade.id}>
                {expiryX != null ? (
                  <div
                    className={cn(
                      "absolute top-0 bottom-0 w-px",
                      trade.action === "up" ? "bg-up/55" : "bg-down/55",
                    )}
                    style={{ left: expiryX }}
                  />
                ) : null}
                {entryY != null ? (
                  <svg className="absolute inset-0 h-full w-full">
                    <line
                      x1={from}
                      y1={entryY}
                      x2={to}
                      y2={entryY}
                      stroke={mark}
                      strokeWidth="1.35"
                    />
                    {openX != null ? (
                      <circle
                        cx={openX}
                        cy={entryY}
                        r="4"
                        fill={mark}
                        stroke="#0b0e11"
                        strokeWidth="1.75"
                      />
                    ) : null}
                  </svg>
                ) : null}
                <div
                  className={cn(
                    "absolute flex h-5 items-center gap-1.5 rounded-md px-1.5 text-[10px] font-medium",
                    trade.action === "up"
                      ? "bg-[#0ecb81] text-[#0b0e11]"
                      : "bg-[#f6465d] text-white",
                  )}
                  style={{ top: flagTop, left: flagLeft }}
                >
                  <span>{trade.action === "up" ? "UP" : "DN"}</span>
                  <span>{money(trade.amount)}</span>
                  <span className="tabular-nums">
                    {remain(trade.close_timestamp, Date.now())}
                  </span>
                  {pnl != null ? (
                    <span className="tabular-nums">
                      {`${pnl > 0 ? "+" : ""}${money(pnl)}`}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {loading && bars.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <BoardPlace title={label ?? "Chart"} text="Connecting quotes" pulse />
        </div>
      ) : null}
      <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5">
        <div className="flex items-center overflow-hidden rounded-md border border-white/10 bg-[#0b0e11]/92 shadow-[0_10px_28px_rgba(0,0,0,.4)] backdrop-blur-md">
          {DRAW_TOOLS.map(({ id, title, Icon }) => (
            <button
              key={id}
              type="button"
              title={title}
              onClick={() => chooseTool(id)}
              className={cn(
                "flex size-9 items-center justify-center border-r border-white/8",
                tool === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              title="Chart type"
              className="text-foreground data-[state=open]:bg-white/6 flex h-9 items-center gap-1.5 border-r border-white/8 px-2.5 text-[12px] outline-none"
            >
              <ChartLine className="size-3.5" />
              <span className="hidden sm:inline">
                {CHART_STYLES.find((item) => item.id === style)?.title}
              </span>
              <ChevronDown className="size-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-44 rounded-md border border-white/10 bg-[#12161c] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,.55)]"
            >
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-[0.14em] uppercase">
                Chart type
              </DropdownMenuLabel>
              {CHART_STYLES.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className={cn(
                    "rounded-sm py-2 text-[12.5px]",
                    style === item.id ? "text-primary" : "",
                  )}
                  onSelect={() => setStyle(item.id)}
                >
                  {item.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className="text-foreground data-[state=open]:bg-white/6 flex h-9 items-center gap-1.5 px-2.5 text-[12px] outline-none">
              <Activity className="size-3.5" />
              <span className="hidden sm:inline">Indicators</span>
              {indOn ? (
                <span className="bg-primary/15 text-primary rounded-sm px-1 text-[10px]">{indOn}</span>
              ) : null}
              <ChevronDown className="size-3 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-60 rounded-md border border-white/10 bg-[#12161c] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,.55)]"
            >
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-[0.14em] uppercase">
                On chart
              </DropdownMenuLabel>
              {IND_ITEMS.map(({ id, title, tone, Icon }) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={inds[id]}
                  className="rounded-sm py-2 pr-2 pl-8 text-[12.5px]"
                  onSelect={(event) => {
                    event.preventDefault();
                    toggleInd(id);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-3.5 shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span>{title}</span>
                      <span className="text-muted-foreground text-[10px]">{tone}</span>
                    </span>
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center border-l border-white/10"
            onClick={resetView}
          >
            <Scan className="size-3.5" />
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center border-l border-white/10"
            onClick={clearDraws}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        {tool !== "cursor" ? (
          <span className="text-primary rounded-md border border-primary/25 bg-[#0b0e11]/92 px-2.5 py-1.5 text-[11px] shadow-[0_10px_28px_rgba(0,0,0,.4)]">
            {activeDraw.hint}
          </span>
        ) : null}
      </div>
      {empty && !loading ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <BoardPlace
            icon={ChartLine}
            title="No history"
            text="Candles for this pair have not arrived yet"
          />
        </div>
      ) : null}
    </div>
  );
}

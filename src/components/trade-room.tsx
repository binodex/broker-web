"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { asCandles, lastClose, liveChartWindow, mergeCandles } from "@/lib/chart";
import { durationLabel, money, price, quoteDigits } from "@/lib/format";
import { BoardPlace } from "@/components/board-place";
import { IosGroup, IosRow, IosSheet } from "@/components/ios-sheet";
import { OpenTradesTable } from "@/components/open-trades-table";
import { PairFilters, PairRow } from "@/components/pair-rail";
import { PairMark } from "@/components/pair-mark";
import { PriceChart } from "@/components/price-chart";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterPairs, type OtcFilter, type PairCat, type PairSortKey, type PayoutFloor, type SortDir } from "@/lib/pairs";
import { cn } from "@/lib/utils";
import type { BinaryPair, Candle, TradeAction } from "@/lib/types";

const INTERVALS = [
  "5s",
  "15s",
  "30s",
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
] as const;

const INTERVAL_LABEL: Record<(typeof INTERVALS)[number], string> = {
  "5s": "5S",
  "15s": "15S",
  "30s": "30S",
  "1m": "1M",
  "2m": "2M",
  "3m": "3M",
  "4m": "4M",
  "5m": "5M",
  "15m": "15M",
  "30m": "30M",
  "1h": "1H",
  "4h": "4H",
};
const MIN_TRADE_SEC = 15;
const OTC_DURATIONS = [15, 30, 60, 120, 180, 240, 300, 900, 1800, 3600];
const SPOT_DURATIONS = [60, 120, 180, 240, 300, 900, 1800, 3600];

function pairDurations(pair: BinaryPair | null) {
  const otc = Boolean(pair?.is_otc) || (pair?.min_timeframe ?? 60) < 60;
  const ladder = otc ? OTC_DURATIONS : SPOT_DURATIONS;
  const api = pair?.min_timeframe ?? 0;
  const floor = Math.max(
    MIN_TRADE_SEC,
    ladder[0],
    api >= MIN_TRADE_SEC ? api : 0,
  );
  if (!pair) return ladder.filter((item) => item >= MIN_TRADE_SEC);
  return ladder.filter((item) => item >= floor && item <= pair.max_timeframe);
}

function intervalMs(interval: string) {
  const map: Record<string, number> = {
    "5s": 5_000,
    "15s": 15_000,
    "30s": 30_000,
    "1m": 60_000,
    "2m": 120_000,
    "3m": 180_000,
    "4m": 240_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
  };
  return map[interval] ?? 60_000;
}

function pairIntervals(pair: BinaryPair | null) {
  const floor = Math.max(5, pair?.min_timeframe ?? 5) * 1000;
  return INTERVALS.filter((item) => intervalMs(item) >= floor);
}

function mergePairs(rest: BinaryPair[], live: BinaryPair[]): BinaryPair[] {
  if (!live.length) return rest;
  const byId = new Map(rest.map((item) => [item.id, item]));
  for (const row of live) {
    const current = byId.get(row.id);
    byId.set(row.id, current ? { ...current, ...row } : row);
  }
  return [...byId.values()];
}

export function TradeRoom() {
  const { session, mode, pairs, live } = useSession();
  const user = session?.user;
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<PairCat>("all");
  const [otc, setOtc] = useState<OtcFilter>("all");
  const [payoutFloor, setPayoutFloor] = useState<PayoutFloor>(0);
  const [sort, setSort] = useState<PairSortKey>("payout");
  const [dir, setDir] = useState<SortDir>("desc");
  const [assetId, setAssetId] = useState<number | null>(null);
  const [interval, setInterval] = useState<(typeof INTERVALS)[number]>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartEmpty, setChartEmpty] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewInterval, setViewInterval] = useState<(typeof INTERVALS)[number]>("1m");
  const candleCache = useRef(new Map<string, Candle[]>());
  const tickSig = useRef("");
  const [amount, setAmount] = useState("10");
  const [duration, setDuration] = useState(60);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"pair" | "duration" | "interval" | null>(
    null,
  );
  const [sheetQuery, setSheetQuery] = useState("");

  function toggleSort(key: PairSortKey) {
    if (sort === key) {
      setDir((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(key);
    setDir(key === "payout" ? "desc" : "asc");
  }

  const assets = useMemo(
    () => mergePairs(pairs, live.assets),
    [pairs, live.assets],
  );
  const filtered = useMemo(
    () =>
      filterPairs(assets, {
        query,
        cat,
        otc,
        payout: payoutFloor,
        sort,
        dir,
      }),
    [assets, query, cat, otc, payoutFloor, sort, dir],
  );
  const sheetPairs = useMemo(
    () =>
      filterPairs(assets, {
        query: sheetQuery,
        cat,
        otc,
        payout: payoutFloor,
        sort,
        dir,
      }),
    [assets, sheetQuery, cat, otc, payoutFloor, sort, dir],
  );
  const selectedId = assetId ?? assets[0]?.id ?? null;
  const selected = assets.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!assetId && assets[0]) setAssetId(assets[0].id);
  }, [assetId, assets]);

  const durations = useMemo(() => pairDurations(selected), [selected]);
  const charts = useMemo(() => pairIntervals(selected), [selected]);

  useEffect(() => {
    if (!selected) return;
    const allowed = pairDurations(selected);
    if (allowed.length && !allowed.includes(duration)) {
      setDuration(allowed.includes(60) ? 60 : allowed[0]);
    }
    if (charts.length && !charts.includes(interval)) {
      setInterval(charts.includes("1m") ? "1m" : charts[0]);
    }
  }, [selected, duration, interval, charts]);

  useEffect(() => {
    if (!selectedId) return;
    const key = `${selectedId}:${interval}`;
    tickSig.current = "";
    const cached = candleCache.current.get(key);
    let stop = false;
    setChartEmpty(false);
    if (cached?.length) {
      setCandles(cached);
      setViewId(selectedId);
      setViewInterval(interval);
      setChartReady(true);
    } else {
      setChartReady(false);
    }
    const remember = (rows: Candle[]) => {
      if (!rows.length) return;
      candleCache.current.set(key, rows);
      if (candleCache.current.size > 24) {
        const oldest = candleCache.current.keys().next().value;
        if (oldest) candleCache.current.delete(oldest);
      }
    };
    const loadFull = async () => {
      const range = liveChartWindow(intervalMs(interval), 800);
      const params = new URLSearchParams({
        asset_id: String(selectedId),
        interval,
        start_time: range.start_time,
        limit: range.limit,
      });
      try {
        const res = await fetch(`/api/chart?${params}`);
        const rows = asCandles(res.ok ? await res.json() : []);
        if (stop) return;
        setCandles(rows);
        remember(rows);
        setViewId(selectedId);
        setViewInterval(interval);
        setChartEmpty(rows.length === 0 && !cached?.length);
        setChartReady(true);
        const close = lastClose(rows);
        if (close != null && close !== 0) live.notePrice(selectedId, close);
      } catch {
        if (!stop && !cached?.length) {
          setChartEmpty(true);
          setChartReady(true);
        }
      }
    };
    const loadTick = async () => {
      const range = liveChartWindow(intervalMs(interval), 12);
      const params = new URLSearchParams({
        asset_id: String(selectedId),
        interval,
        start_time: range.start_time,
        limit: range.limit,
      });
      try {
        const res = await fetch(`/api/chart?${params}`);
        const rows = asCandles(res.ok ? await res.json() : []);
        if (stop || !rows.length) return;
        const close = lastClose(rows);
        const sig = `${rows[rows.length - 1][0]}:${close}`;
        if (sig === tickSig.current) {
          if (close != null && close !== 0) live.notePrice(selectedId, close);
          return;
        }
        tickSig.current = sig;
        setCandles((current) => {
          const next = mergeCandles(current, rows);
          remember(next);
          return next;
        });
        if (close != null && close !== 0) live.notePrice(selectedId, close);
      } catch {
        return;
      }
    };
    void loadFull();
    const id = window.setInterval(loadTick, 1000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [selectedId, interval, live.notePrice]);

  const candleClose = chartReady ? lastClose(candles) : undefined;
  const rawPrice = selected
    ? (live.prices[selected.id]?.price ?? candleClose)
    : undefined;
  const lastPrice =
    rawPrice != null && rawPrice !== 0 ? rawPrice : undefined;
  const chartDigits = quoteDigits(selected?.digits ?? 0, lastPrice);
  const minAmount = user?.min_trade_amount ?? 1;
  const available = user ? user[mode].available : 0;
  const marketOpen = selected ? selected.scheduled_until === 0 : false;
  const canTrade = Boolean(selected && marketOpen && !busy);

  async function place(action: TradeAction) {
    if (!selected || busy) return;
    const stake = Number(amount);
    const hold = Math.max(MIN_TRADE_SEC, duration);
    if (!Number.isFinite(stake) || stake < minAmount) return;
    setBusy(true);
    try {
      await live.openTrade({
        asset_id: selected.id,
        amount: stake,
        action,
        duration: hold,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[248px_minmax(0,1fr)_280px] lg:grid-rows-1">
      <aside className="bg-sidebar hidden h-full min-h-0 overflow-hidden border-r lg:flex lg:flex-col">
        <PairFilters
          assets={assets}
          query={query}
          onQuery={setQuery}
          cat={cat}
          onCat={setCat}
          otc={otc}
          onOtc={setOtc}
          payout={payoutFloor}
          onPayout={setPayoutFloor}
          sort={sort}
          dir={dir}
          onSort={toggleSort}
          compact
        />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-[12px]">
              No pairs match the filter
            </p>
          ) : (
            filtered.map((pair) => (
              <PairRow
                key={pair.id}
                pair={pair}
                active={pair.id === selectedId}
                quote={live.prices[pair.id]?.price}
                onClick={() => setAssetId(pair.id)}
              />
            ))
          )}
        </div>
      </aside>

      <section className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="flex h-11 items-center gap-2 border-b border-white/6 px-2 lg:h-9">
          <button
            type="button"
            onClick={() => {
              setSheetQuery("");
              setSheet("pair");
            }}
            className="flex min-w-0 flex-1 items-center gap-2 lg:pointer-events-none"
          >
            {selected ? (
              <PairMark symbol={selected.symbol} className="size-6 text-[8px] lg:size-5" />
            ) : null}
            <span className="truncate text-[15px] font-medium transition-opacity duration-300 lg:text-[13px]">
              {selected?.symbol ?? "—"}
              {selected?.is_otc ? (
                <span className="text-primary ml-1 text-[10px]">OTC</span>
              ) : null}
            </span>
          </button>
          {lastPrice != null && selected ? (
            <span className="text-[13px] tabular-nums transition-opacity duration-300">
              {price(lastPrice, selected.digits)}
            </span>
          ) : (
            <span className="text-muted-foreground text-[13px] tabular-nums">
              —
            </span>
          )}
          <span
            className={cn(
              "text-[11px]",
              marketOpen ? "text-up" : "text-down",
            )}
          >
            {marketOpen ? "Open" : "Closed"}
          </span>
          <button
            type="button"
            onClick={() => setSheet("interval")}
            className="text-primary ml-auto h-8 px-2 text-[13px] lg:hidden"
          >
            {INTERVAL_LABEL[interval]}
          </button>
          <div className="ml-auto hidden lg:flex">
            {charts.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setInterval(item)}
                className={cn(
                  "h-8 px-2 text-[11px]",
                  interval === item
                    ? "text-primary shadow-[inset_0_-2px_0_0_#80f6bc]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {INTERVAL_LABEL[item]}
              </button>
            ))}
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {assets.length === 0 ? (
            <BoardPlace title="Market" text="Loading pairs" pulse />
          ) : (
            <PriceChart
              pairId={viewId ?? selectedId}
              interval={viewInterval}
              intervalMs={intervalMs(viewInterval)}
              candles={candles}
              lastPrice={
                chartReady &&
                viewId === selectedId &&
                viewInterval === interval
                  ? lastPrice
                  : undefined
              }
              digits={chartDigits}
              empty={chartEmpty}
              loading={!chartReady}
              label={selected?.symbol}
              trades={live.openTrades}
              previewSec={duration}
            />
          )}
        </div>
        <OpenTradesTable
          trades={live.openTrades}
          pairs={assets}
          prices={live.prices}
        />
      </section>

      <aside className="bg-sidebar flex h-full min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
        <div className="hidden h-8 items-center justify-between border-b px-3 lg:flex">
          <span className="text-[12px] font-medium">Order · {mode}</span>
          {selected ? (
            <span className="text-up text-[12px]">{selected.payout}%</span>
          ) : null}
        </div>
        <div className="flex flex-col lg:flex-1 lg:gap-3 lg:p-3">
          <div className="divide-y lg:hidden">
            <button
              type="button"
              onClick={() => {
                setSheetQuery("");
                setSheet("pair");
              }}
              className="flex h-9 w-full items-center gap-2 px-3"
            >
              {selected ? (
                <PairMark symbol={selected.symbol} className="size-5 text-[8px]" />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {selected?.symbol ?? "Pair"}
              </span>
              <span
                className={cn(
                  "text-[12px]",
                  marketOpen ? "text-up" : "text-muted-foreground",
                )}
              >
                {selected ? `${selected.payout}%` : "—"}
              </span>
            </button>
            <label className="flex h-9 items-center gap-2 px-3">
              <span className="text-muted-foreground w-14 text-[12px]">
                Amount
              </span>
              <input
                type="number"
                min={minAmount}
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-9 min-w-0 flex-1 bg-transparent text-right text-[13px] tabular-nums outline-none"
              />
              <span className="text-muted-foreground text-[12px]">USD</span>
            </label>
            <button
              type="button"
              onClick={() => setSheet("duration")}
              className="flex h-9 w-full items-center px-3"
            >
              <span className="text-muted-foreground flex-1 text-left text-[12px]">
                Time
              </span>
              <span className="text-primary text-[13px]">
                {durationLabel(duration)}
              </span>
            </button>
          </div>
          <p className="text-muted-foreground border-t px-3 py-1.5 text-[11px] lg:hidden">
            Available {money(available)}
          </p>
          <label className="hidden gap-1 lg:grid">
            <span className="text-muted-foreground text-[11px]">Amount USD</span>
            <Input
              type="number"
              min={minAmount}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-9 rounded-[2px] text-lg tabular-nums"
            />
            <span className="text-muted-foreground text-[11px]">
              min {money(minAmount)} · avail {money(available)}
            </span>
          </label>
          <div className="hidden gap-1 lg:grid">
            <span className="text-muted-foreground text-[11px]">
              Expiry · from 15s
            </span>
            <div className="flex flex-wrap gap-1">
              {durations.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDuration(item)}
                  className={cn(
                    "h-7 rounded-md border px-2.5 text-[11px]",
                    duration === item
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "text-muted-foreground hover:border-white/15 hover:text-foreground",
                  )}
                >
                  {durationLabel(item)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 p-2 lg:mt-auto lg:p-0">
            <Button
              disabled={!canTrade}
              className="h-9 rounded-[2px] bg-[#0ecb81] text-[13px] font-medium text-[#0b0e11] hover:bg-[#0ecb81]/90 lg:h-10"
              onClick={() => void place("up")}
            >
              Up
            </Button>
            <Button
              disabled={!canTrade}
              className="h-9 rounded-[2px] bg-[#f6465d] text-[13px] font-medium text-white hover:bg-[#f6465d]/90 lg:h-10"
              onClick={() => void place("down")}
            >
              Down
            </Button>
          </div>
        </div>
      </aside>

      <IosSheet
        open={sheet === "pair"}
        onOpenChange={(next) => setSheet(next ? "pair" : null)}
        title="Market"
      >
        <PairFilters
          assets={assets}
          query={sheetQuery}
          onQuery={setSheetQuery}
          cat={cat}
          onCat={setCat}
          otc={otc}
          onOtc={setOtc}
          payout={payoutFloor}
          onPayout={setPayoutFloor}
          sort={sort}
          dir={dir}
          onSort={toggleSort}
        />
        <IosGroup>
          {sheetPairs.map((pair) => (
            <PairRow
              key={pair.id}
              pair={pair}
              active={pair.id === selectedId}
              quote={live.prices[pair.id]?.price}
              onClick={() => {
                setAssetId(pair.id);
                setSheet(null);
              }}
            />
          ))}
        </IosGroup>
      </IosSheet>

      <IosSheet
        open={sheet === "duration"}
        onOpenChange={(next) => setSheet(next ? "duration" : null)}
        title="Expiry"
      >
        <IosGroup>
          {durations.map((item) => (
            <IosRow
              key={item}
              compact
              active={item === duration}
              onClick={() => {
                setDuration(item);
                setSheet(null);
              }}
            >
              <span className="flex-1 text-[13px]">{durationLabel(item)}</span>
              {item === duration ? <Check className="text-primary size-3.5" /> : null}
            </IosRow>
          ))}
        </IosGroup>
      </IosSheet>

      <IosSheet
        open={sheet === "interval"}
        onOpenChange={(next) => setSheet(next ? "interval" : null)}
        title="Timeframe"
      >
        <IosGroup>
          {charts.map((item) => (
            <IosRow
              key={item}
              compact
              active={item === interval}
              onClick={() => {
                setInterval(item);
                setSheet(null);
              }}
            >
              <span className="flex-1 text-[13px]">{INTERVAL_LABEL[item]}</span>
              {item === interval ? <Check className="text-primary size-3.5" /> : null}
            </IosRow>
          ))}
        </IosGroup>
      </IosSheet>
    </div>
  );
}

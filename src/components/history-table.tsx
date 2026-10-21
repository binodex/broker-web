"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChartLine,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { BoardPlace } from "@/components/board-place";
import { PairMark } from "@/components/pair-mark";
import { TerminalJump, TradeSource } from "@/components/trade-source";
import { useSession } from "@/components/session-provider";
import { money, price, when } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClosedTrade, OpenTrade } from "@/lib/types";

type Status = "open" | "closed";
type DemoFilter = "all" | "true" | "false";

const PAGE = 20;

export function HistoryTable() {
  const { pairs, mode } = useSession();
  const [status, setStatus] = useState<Status>("closed");
  const [demo, setDemo] = useState<DemoFilter>(mode === "demo" ? "true" : "false");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Array<OpenTrade | ClosedTrade>>([]);
  const [loading, setLoading] = useState(true);

  const pairById = useMemo(() => {
    const map = new Map(pairs.map((item) => [Number(item.id), item]));
    return map;
  }, [pairs]);

  useEffect(() => {
    setDemo(mode === "demo" ? "true" : "false");
  }, [mode]);

  useEffect(() => {
    setPage(0);
  }, [status, demo]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      status,
      limit: String(PAGE),
      offset: String(page * PAGE),
    });
    if (demo !== "all") params.set("is_demo", demo);
    fetch(`/api/trades?${params}`)
      .then(async (res) => (res.ok ? await res.json() : { trades: [] }))
      .then((data) =>
        setRows((data.trades ?? []) as Array<OpenTrade | ClosedTrade>),
      )
      .finally(() => setLoading(false));
  }, [status, demo, page]);

  const hasMore = rows.length === PAGE;
  const from = rows.length ? page * PAGE + 1 : 0;
  const to = page * PAGE + rows.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-white/6 px-3 py-2 md:h-11 md:flex-row md:items-center md:py-0">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <Clock3 className="text-primary size-3.5" />
          History
        </p>
        <TerminalJump />
        <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
          <Seg
            value={status}
            onChange={setStatus}
            items={[
              { id: "closed", label: "Closed" },
              { id: "open", label: "Open" },
            ]}
          />
          <Seg
            value={demo}
            onChange={setDemo}
            items={[
              { id: "all", label: "All" },
              { id: "false", label: "Real" },
              { id: "true", label: "Demo" },
            ]}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <BoardPlace
            icon={ChartLine}
            title="History"
            text="Loading trades"
            pulse
          />
        ) : rows.length === 0 ? (
          <EmptyBlotter status={status} />
        ) : (
          <>
            <div className="divide-y md:hidden">
              {rows.map((trade) => (
                <MobileRow
                  key={trade.id}
                  trade={trade}
                  symbol={
                    pairById.get(Number(trade.asset_id))?.symbol ??
                    (trade as { symbol?: string }).symbol ??
                    `#${trade.asset_id}`
                  }
                  otc={pairById.get(Number(trade.asset_id))?.is_otc}
                  digits={pairById.get(Number(trade.asset_id))?.digits ?? 5}
                />
              ))}
            </div>
            <table className="hidden w-full min-w-[860px] border-collapse text-[12px] md:table">
              <thead className="bg-sidebar sticky top-0 z-10">
                <tr className="text-muted-foreground border-b text-left">
                  <th className="px-3 py-2 font-medium">Pair</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                  <th className="px-3 py-2 text-right font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((trade) => {
                  const pair = pairById.get(Number(trade.asset_id));
                  const symbol =
                    pair?.symbol ??
                    (trade as { symbol?: string }).symbol ??
                    `#${trade.asset_id}`;
                  const closed = "profit" in trade;
                  const profit = closed ? (trade as ClosedTrade).profit : null;
                  const closePrice = closed
                    ? (trade as ClosedTrade).close_price
                    : null;
                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-secondary/50 border-b border-[#1e2329]"
                    >
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-2">
                          <PairMark symbol={symbol} />
                          <span className="font-medium">
                            {symbol}
                            {pair?.is_otc ? (
                              <span className="text-primary ml-1 text-[10px]">
                                OTC
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <SideBadge action={trade.action} />
                      </td>
                      <td className="px-3 py-1.5">
                        <AccountBadge demo={Boolean(trade.is_demo)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <TradeSource trade={trade} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {money(trade.amount)}
                      </td>
                      <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">
                        {price(trade.open_price, pair?.digits ?? 5)}
                        {closePrice != null ? (
                          <>
                            <span className="mx-1">→</span>
                            {price(closePrice, pair?.digits ?? 5)}
                          </>
                        ) : null}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          profit == null
                            ? "text-muted-foreground"
                            : profit > 0
                              ? "text-up"
                              : profit < 0
                                ? "text-down"
                                : "text-muted-foreground",
                        )}
                      >
                        {profit == null
                          ? money((trade as OpenTrade).potential_profit)
                          : `${profit > 0 ? "+" : ""}${money(profit)}`}
                      </td>
                      <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">
                        {when(
                          closed
                            ? (trade as ClosedTrade).close_timestamp
                            : trade.open_timestamp,
                        )}
                      </td>
                      <td className="text-muted-foreground px-3 py-1.5 text-right tabular-nums">
                        #{trade.id}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="flex h-10 items-center justify-between border-t px-3">
        <p className="text-muted-foreground text-[11px] tabular-nums">
          {from}-{to}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            className="border-border text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 flex h-7 items-center gap-1 rounded-[2px] border px-2 text-[12px] disabled:cursor-not-allowed"
          >
            <ChevronLeft className="size-3.5" />
            Prev
          </button>
          <span className="text-muted-foreground min-w-8 text-center text-[12px] tabular-nums">
            {page + 1}
          </span>
          <button
            type="button"
            disabled={!hasMore || loading}
            onClick={() => setPage((current) => current + 1)}
            className="border-border text-muted-foreground hover:text-foreground disabled:text-muted-foreground/40 flex h-7 items-center gap-1 rounded-[2px] border px-2 text-[12px] disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Seg<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="flex h-7 overflow-hidden rounded-[2px] border">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "px-2.5 text-[11px]",
            value === item.id
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function SideBadge({ action }: { action: "up" | "down" }) {
  const up = action === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] uppercase",
        up ? "text-up" : "text-down",
      )}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {action}
    </span>
  );
}

function AccountBadge({ demo }: { demo: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-[2px] px-1.5 py-0.5 text-[10px] uppercase",
        demo
          ? "bg-secondary text-muted-foreground"
          : "bg-primary/15 text-primary",
      )}
    >
      {demo ? "demo" : "real"}
    </span>
  );
}

function MobileRow({
  trade,
  symbol,
  otc,
  digits,
}: {
  trade: OpenTrade | ClosedTrade;
  symbol: string;
  otc?: boolean;
  digits: number;
}) {
  const closed = "profit" in trade;
  const profit = closed ? (trade as ClosedTrade).profit : null;
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5">
      <PairMark symbol={symbol} className="mt-0.5 size-8 text-[10px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-medium">
            {symbol}
            {otc ? <span className="text-primary ml-1 text-[10px]">OTC</span> : null}
          </p>
          <p
            className={cn(
              "text-[13px] tabular-nums",
              profit == null
                ? "text-muted-foreground"
                : profit > 0
                  ? "text-up"
                  : profit < 0
                    ? "text-down"
                    : "text-muted-foreground",
            )}
          >
            {profit == null
              ? money((trade as OpenTrade).potential_profit)
              : `${profit > 0 ? "+" : ""}${money(profit)}`}
          </p>
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <SideBadge action={trade.action} />
          <AccountBadge demo={Boolean(trade.is_demo)} />
          <TradeSource trade={trade} compact />
          <span className="tabular-nums">{money(trade.amount)}</span>
          <span className="tabular-nums">
            {price(trade.open_price, digits)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
          {when(
            closed
              ? (trade as ClosedTrade).close_timestamp
              : trade.open_timestamp,
          )}{" "}
          · #{trade.id}
        </p>
      </div>
    </div>
  );
}

function EmptyBlotter({ status }: { status: Status }) {
  return (
    <BoardPlace
      icon={ChartLine}
      title={status === "open" ? "No open positions" : "No history yet"}
      text="Open a trade on the desk — it will show up here."
    />
  );
}

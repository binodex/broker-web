"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PairMark } from "@/components/pair-mark";
import { money, price } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BinaryPair, OpenTrade } from "@/lib/types";

function remain(closeTs: number, now: number) {
  const closeMs = closeTs > 1e12 ? closeTs : closeTs * 1000;
  const sec = Math.max(0, Math.floor((closeMs - now) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function estimate(trade: OpenTrade, current?: number) {
  if (current == null) return null;
  const delta = current - trade.open_price;
  if (delta === 0) return 0;
  const win = trade.action === "up" ? delta > 0 : delta < 0;
  return win ? trade.potential_profit : -trade.amount;
}

export function OpenTradesTable({
  trades,
  pairs,
  prices,
}: {
  trades: OpenTrade[];
  pairs: BinaryPair[];
  prices: Record<number, { price: number; timestamp: number }>;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pairById = new Map(pairs.map((item) => [Number(item.id), item]));

  return (
    <div className="flex min-h-0 flex-col border-t">
      <div className="text-muted-foreground flex h-7 items-center justify-between px-2 text-[11px]">
        <span>Open</span>
        <span className="tabular-nums">{trades.length}</span>
      </div>
      {trades.length === 0 ? (
        <p className="text-muted-foreground px-2 pb-2.5 text-[12px]">
          No open trades
        </p>
      ) : (
        <div className="max-h-40 overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-[12px]">
            <thead className="bg-sidebar sticky top-0">
              <tr className="text-muted-foreground text-left">
                <th className="px-2 py-1 font-medium">Pair</th>
                <th className="px-2 py-1 font-medium">Side</th>
                <th className="px-2 py-1 text-right font-medium">Amount</th>
                <th className="px-2 py-1 text-right font-medium">Open</th>
                <th className="px-2 py-1 text-right font-medium">Now</th>
                <th className="px-2 py-1 text-right font-medium">Closes in</th>
                <th className="px-2 py-1 text-right font-medium">P/L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => {
                const pair = pairById.get(Number(trade.asset_id));
                const symbol =
                  pair?.symbol ??
                  (trade as { symbol?: string }).symbol ??
                  `#${trade.asset_id}`;
                const digits = pair?.digits ?? 5;
                const current = prices[trade.asset_id]?.price;
                const pnl = estimate(trade, current);
                const up = trade.action === "up";
                return (
                  <tr key={trade.id} className="border-t border-[#1e2329]">
                    <td className="px-2 py-1">
                      <span className="flex items-center gap-1.5">
                        <PairMark symbol={symbol} className="size-4 text-[7px]" />
                        <span className="font-medium">{symbol}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 uppercase",
                          up ? "text-up" : "text-down",
                        )}
                      >
                        {up ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )}
                        {trade.action}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {money(trade.amount)}
                    </td>
                    <td className="text-muted-foreground px-2 py-1 text-right tabular-nums">
                      {price(trade.open_price, digits)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {current == null ? "—" : price(current, digits)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {remain(trade.close_timestamp, now)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1 text-right tabular-nums",
                        pnl == null
                          ? "text-muted-foreground"
                          : pnl > 0
                            ? "text-up"
                            : pnl < 0
                              ? "text-down"
                              : "text-muted-foreground",
                      )}
                    >
                      {pnl == null
                        ? money(trade.potential_profit)
                        : `${pnl > 0 ? "+" : ""}${money(pnl)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

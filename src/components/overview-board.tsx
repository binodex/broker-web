"use client";

import { useEffect, useMemo, useState } from "react";
import { money, when } from "@/lib/format";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ClosedTrade, OpenTrade } from "@/lib/types";

export function OverviewBoard() {
  const { session, mode, setMode, live: feed } = useSession();
  const user = session?.user;
  const [open, setOpen] = useState<OpenTrade[]>([]);
  const [closed, setClosed] = useState<ClosedTrade[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/trades?status=open&limit=20").then((res) => res.json()),
      fetch("/api/trades?status=closed&limit=12").then((res) => res.json()),
    ]).then(([live, history]) => {
      if (!alive) return;
      setOpen((live?.trades ?? []) as OpenTrade[]);
      setClosed((history?.trades ?? []) as ClosedTrade[]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const liveTrades = useMemo(() => {
    const map = new Map<number, OpenTrade>();
    for (const trade of open) map.set(trade.id, trade);
    for (const trade of feed.openTrades) map.set(trade.id, trade);
    return [...map.values()].sort(
      (a, b) => b.open_timestamp - a.open_timestamp,
    );
  }, [open, feed.openTrades]);

  const history = useMemo(() => {
    const map = new Map<number, ClosedTrade>();
    for (const trade of closed) map.set(trade.id, trade);
    for (const trade of feed.lastClosed) map.set(trade.id, trade);
    return [...map.values()]
      .sort((a, b) => b.close_timestamp - a.close_timestamp)
      .slice(0, 12);
  }, [closed, feed.lastClosed]);

  if (!user) {
    return (
      <div className="grid gap-px bg-border">
        <Skeleton className="h-10 rounded-none" />
        <Skeleton className="h-64 rounded-none" />
      </div>
    );
  }

  const side = user[mode];

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="grid grid-cols-2 border-b md:grid-cols-4">
        <Stat label={`Available · ${mode}`} value={money(side.available)} />
        <Stat label="In trades" value={money(side.held)} />
        <Stat label="Total" value={money(side.total)} />
        <Stat label="Open" value={String(liveTrades.length)} />
      </div>
      <div className="flex h-8 items-center gap-2 border-b px-3">
        <Button
          size="xs"
          variant="outline"
          className="h-6 rounded-[2px]"
          onClick={() => setMode(mode === "demo" ? "real" : "demo")}
        >
          {mode === "demo" ? "Real" : "Demo"}
        </Button>
        <Button
          size="xs"
          className="h-6 rounded-[2px]"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("broker-navigate", { detail: "/app/trade" }),
            );
          }}
        >
          Trade
        </Button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ml-auto text-[12px]"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("broker-navigate", { detail: "/app/history" }),
            );
          }}
        >
          History
        </button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No closed trades yet
              </TableCell>
            </TableRow>
          ) : (
            history.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell className="tabular-nums">
                  #{trade.id}
                </TableCell>
                <TableCell
                  className={cn(
                    "uppercase",
                    trade.action === "up" ? "text-up" : "text-down",
                  )}
                >
                  {trade.action}
                </TableCell>
                <TableCell className="tabular-nums">
                  {money(trade.amount)}
                </TableCell>
                <TableCell
                  className={cn(
                    "tabular-nums",
                    trade.profit > 0
                      ? "text-up"
                      : trade.profit < 0
                        ? "text-down"
                        : "text-muted-foreground",
                  )}
                >
                  {trade.profit > 0 ? "+" : ""}
                  {money(trade.profit)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {when(trade.close_timestamp)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="text-[15px] tabular-nums">{value}</p>
    </div>
  );
}

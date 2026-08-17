"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { PairMark } from "@/components/pair-mark";
import { price } from "@/lib/format";
import {
  hasOtc,
  hasReal,
  presentCats,
  type OtcFilter,
  type PairCat,
  type PairSortKey,
  type PayoutFloor,
  type SortDir,
} from "@/lib/pairs";
import { cn } from "@/lib/utils";
import type { BinaryPair } from "@/lib/types";

const PAYOUTS: Array<{ id: PayoutFloor; label: string }> = [
  { id: 0, label: "All %" },
  { id: 80, label: "80%+" },
  { id: 90, label: "90%+" },
];

export function PairFilters({
  assets,
  query,
  onQuery,
  cat,
  onCat,
  otc,
  onOtc,
  payout,
  onPayout,
  sort,
  dir,
  onSort,
  compact,
}: {
  assets: BinaryPair[];
  query: string;
  onQuery: (value: string) => void;
  cat: PairCat;
  onCat: (value: PairCat) => void;
  otc: OtcFilter;
  onOtc: (value: OtcFilter) => void;
  payout: PayoutFloor;
  onPayout: (value: PayoutFloor) => void;
  sort: PairSortKey;
  dir: SortDir;
  onSort: (key: PairSortKey) => void;
  compact?: boolean;
}) {
  const cats = presentCats(assets);
  const otcOn = hasOtc(assets);
  const realOn = hasReal(assets);
  const marketChips = otcOn && realOn;
  return (
    <div className="shrink-0 border-b">
      <div className={cn(compact ? "px-2 pt-2 pb-1.5" : "px-4 pt-1 pb-2")}>
        <label
          className={cn(
            "border-input bg-secondary flex items-center gap-2 rounded-[2px] border px-2.5",
            compact ? "h-7" : "h-9",
          )}
        >
          <Search className="text-muted-foreground size-3.5" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search pair"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ChipScroll className={cn("pb-1.5", compact ? "px-2" : "px-4")}>
        {cats.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onCat(item.id)}
            className={cn(
              "h-7 shrink-0 rounded-[2px] px-2.5 text-[12px]",
              cat === item.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </ChipScroll>
      {marketChips ? (
        <div className={cn("flex gap-1 pb-1.5", compact ? "px-2" : "px-4")}>
          {(
            [
              { id: "all", label: "All" },
              { id: "otc", label: "OTC" },
              { id: "real", label: "Market" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOtc(item.id)}
              className={cn(
                "h-7 shrink-0 rounded-[2px] px-2.5 text-[12px]",
                otc === item.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : otcOn ? (
        <div className={cn("flex gap-1 pb-1.5", compact ? "px-2" : "px-4")}>
          <button
            type="button"
            onClick={() => onOtc(otc === "otc" ? "all" : "otc")}
            className={cn(
              "h-7 shrink-0 rounded-[2px] px-2.5 text-[12px]",
              otc === "otc"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            OTC
          </button>
        </div>
      ) : null}
      <div className={cn("flex gap-1 pb-2", compact ? "px-2" : "px-4")}>
        {PAYOUTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPayout(item.id)}
            className={cn(
              "h-7 shrink-0 rounded-[2px] px-2.5 text-[12px]",
              payout === item.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className={cn(
          "text-muted-foreground flex h-7 items-center text-[10px] uppercase",
          compact ? "px-2" : "px-4",
        )}
      >
        <button
          type="button"
          onClick={() => onSort("symbol")}
          className={cn(
            "flex items-center gap-0.5",
            sort === "symbol" ? "text-foreground" : "hover:text-foreground",
          )}
        >
          Pair
          <SortIcon active={sort === "symbol"} dir={dir} />
        </button>
        <button
          type="button"
          onClick={() => onSort("payout")}
          className={cn(
            "ml-auto flex items-center gap-0.5",
            sort === "payout" ? "text-foreground" : "hover:text-foreground",
          )}
        >
          {compact ? "%" : "Payout"}
          <SortIcon active={sort === "payout"} dir={dir} />
        </button>
      </div>
    </div>
  );
}

function ChipScroll({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const sync = () => {
      const max = node.scrollWidth - node.clientWidth;
      setMore({
        left: node.scrollLeft > 2,
        right: max - node.scrollLeft > 2,
      });
    };
    sync();
    node.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [children]);

  function move(dir: -1 | 1) {
    scroller.current?.scrollBy({ left: dir * 120, behavior: "smooth" });
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      {more.left ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute left-0 z-10 flex h-7 w-6 items-center justify-center bg-gradient-to-r from-[#0e1116] via-[#0e1116] to-transparent"
          onClick={() => move(-1)}
        >
          <ChevronLeft className="size-3.5" />
        </button>
      ) : null}
      <div ref={scroller} className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {children}
      </div>
      {more.right ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute right-0 z-10 flex h-7 w-6 items-center justify-center bg-gradient-to-l from-[#0e1116] via-[#0e1116] to-transparent"
          onClick={() => move(1)}
        >
          <ChevronRight className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return <ArrowDown className="size-2.5 opacity-40" />;
  }
  return dir === "asc" ? (
    <ArrowUp className="text-primary size-2.5" />
  ) : (
    <ArrowDown className="text-primary size-2.5" />
  );
}

export function PairRow({
  pair,
  active,
  quote,
  onClick,
}: {
  pair: BinaryPair;
  active: boolean;
  quote?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-full items-center justify-between px-4 text-[13px] lg:h-8 lg:px-2 lg:text-[12px]",
        active
          ? "bg-secondary text-foreground shadow-[inset_2px_0_0_0_#80f6bc]"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            pair.scheduled_until === 0 ? "bg-up" : "bg-down",
          )}
        />
        <PairMark symbol={pair.symbol} className="size-5 text-[8px]" />
        <span className="truncate">{pair.symbol}</span>
        {pair.is_otc ? (
          <span className="text-primary text-[10px]">OTC</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {quote != null ? (
          <span className="text-foreground tabular-nums">
            {price(quote, pair.digits)}
          </span>
        ) : null}
        <span className="text-up w-8 text-right">{pair.payout}%</span>
      </span>
    </button>
  );
}


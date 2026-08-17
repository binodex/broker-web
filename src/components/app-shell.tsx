"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChartLine,
  Clock,
  LogOut,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { HistoryTable } from "@/components/history-table";
import { PayModal } from "@/components/pay-modal";
import { TradeRoom } from "@/components/trade-room";
import { Button } from "@/components/ui/button";
import { levelLabel, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";
import type { AccountMode } from "@/lib/types";

const NAV = [
  { href: "/app/trade", label: "Trade", icon: ChartLine },
  { href: "/app/history", label: "History", icon: Clock },
] as const;

type AppView = (typeof NAV)[number]["href"];
type PayMode = "deposit" | "withdraw";

function viewOf(path: string): AppView {
  if (path.startsWith("/app/history")) return "/app/history";
  return "/app/trade";
}

export function AppShell() {
  const nextPath = usePathname();
  const [path, setPath] = useState(nextPath);
  const [seen, setSeen] = useState<AppView[]>([viewOf(nextPath)]);
  const [pay, setPay] = useState<PayMode | null>(null);
  const { session, mode, setMode, logout, reload } = useSession();
  const user = session?.user;
  const balance = user ? user[mode] : null;
  const pathRef = useRef(path);
  pathRef.current = path;
  const view = viewOf(path);

  const go = useCallback((href: AppView) => {
    if (href === pathRef.current) return;
    window.history.pushState(null, "", href);
    pathRef.current = href;
    setPath(href);
    setSeen((current) =>
      current.includes(href) ? current : [...current, href],
    );
  }, []);

  useEffect(() => {
    const next = nextPath === "/app" || nextPath === "/app/" ? "/app/trade" : nextPath;
    if (next !== nextPath && typeof window !== "undefined") {
      window.history.replaceState(null, "", next);
    }
    setPath(next);
    setSeen((current) => {
      const view = viewOf(next);
      return current.includes(view) ? current : [...current, view];
    });
  }, [nextPath]);

  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname;
      pathRef.current = next;
      setPath(next);
      setSeen((current) => {
        const nextView = viewOf(next);
        return current.includes(nextView) ? current : [...current, nextView];
      });
    };
    const onNav = (event: Event) => {
      const href = (event as CustomEvent<string>).detail;
      if (typeof href === "string") go(href as AppView);
    };
    const onPay = (event: Event) => {
      const next = (event as CustomEvent<PayMode>).detail;
      if (next === "deposit" || next === "withdraw") setPay(next);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("broker-navigate", onNav);
    window.addEventListener("broker-pay", onPay);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("broker-navigate", onNav);
      window.removeEventListener("broker-pay", onPay);
    };
  }, [go]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="bg-sidebar flex h-12 shrink-0 items-center gap-2 border-b border-white/6 px-2 pt-[env(safe-area-inset-top)] md:h-11 md:px-3 md:pt-0">
        <button
          type="button"
          onClick={() => go("/app/trade")}
          className="flex items-center gap-2 px-1"
        >
          <BrandMark className="size-7 md:size-6" />
          <span className="hidden text-[13px] font-semibold tracking-tight sm:inline">
            Broker Desk
          </span>
        </button>
        <nav className="hidden items-center md:flex">
          {NAV.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => go(item.href)}
              className={cn(
                "flex h-10 items-center gap-1.5 px-3 text-[13px]",
                view === item.href
                  ? "text-foreground shadow-[inset_0_-2px_0_0_#80f6bc]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {user ? (
            <span className="text-muted-foreground hidden text-[11px] lg:inline">
              #{user.id} · {levelLabel(user.level.code)}
            </span>
          ) : null}
          <div className="flex h-7 overflow-hidden rounded-md border border-white/10 md:h-6">
            {(["demo", "real"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setMode(item as AccountMode)}
                className={cn(
                  "px-2 text-[11px] uppercase",
                  mode === item
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="text-[13px] tabular-nums">
            {balance ? money(balance.available) : "—"}
            <span className="text-muted-foreground ml-1 hidden text-[11px] sm:inline">
              USD
            </span>
          </span>
          <Button
            size="icon-xs"
            className="size-8 rounded-[4px] md:hidden"
            onClick={() => setPay("deposit")}
            title="Deposit"
          >
            <ArrowDownToLine className="size-4" />
          </Button>
          <Button
            size="icon-xs"
            variant="outline"
            className="size-8 rounded-[4px] md:hidden"
            onClick={() => setPay("withdraw")}
            title="Withdraw"
          >
            <ArrowUpFromLine className="size-4" />
          </Button>
          <Button
            size="xs"
            className="hidden h-6 rounded-[2px] md:inline-flex"
            onClick={() => setPay("deposit")}
          >
            <ArrowDownToLine />
            Deposit
          </Button>
          <Button
            size="xs"
            variant="outline"
            className="hidden h-6 rounded-[2px] md:inline-flex"
            onClick={() => setPay("withdraw")}
          >
            <ArrowUpFromLine />
            Withdraw
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            className="size-8 rounded-[4px] md:size-6"
            onClick={() => void logout()}
            title="Sign out"
          >
            <LogOut className="size-4 md:size-3.5" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {seen.includes("/app/trade") ? (
          <div className={cn("h-full", view === "/app/trade" ? "" : "hidden")}>
            <TradeRoom />
          </div>
        ) : null}
        {seen.includes("/app/history") ? (
          <div className={cn("h-full overflow-auto", view === "/app/history" ? "" : "hidden")}>
            <HistoryTable />
          </div>
        ) : null}
      </div>

      <nav className="bg-sidebar/95 fixed inset-x-0 bottom-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.href;
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => go(item.href)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.2 : 1.7} />
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => void logout()}
          className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium"
        >
          <LogOut className="size-5" strokeWidth={1.7} />
          Sign out
        </button>
      </nav>

      <PayModal
        mode={pay}
        onClose={() => setPay(null)}
        onCredited={() => {
          void reload();
        }}
      />
    </div>
  );
}

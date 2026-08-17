"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/session-provider";
import type { ClosedTrade, OpenTrade } from "@/lib/types";

type Via = {
  kind: "terminal" | "api" | "platform";
  label: string;
  hint: string;
  href: string | null;
};

export function viaOf(
  trade: OpenTrade | ClosedTrade,
  clientId: string,
  platformUrl: string,
): Via | null {
  const sourceId = trade.broker_client_id;
  if (sourceId && sourceId === clientId) {
    return {
      kind: "terminal",
      label: "Broker Desk",
      hint: "Desk",
      href: "/app/trade",
    };
  }
  if (sourceId || trade.source === "api") {
    return {
      kind: "api",
      label: "Broker API",
      hint: "API",
      href: null,
    };
  }
  if (trade.source === "platform") {
    return {
      kind: "platform",
      label: "Binodex",
      hint: "Platform",
      href: platformUrl || "https://binodex.app",
    };
  }
  return null;
}

export function TradeSource({
  trade,
  compact,
}: {
  trade: OpenTrade | ClosedTrade;
  compact?: boolean;
}) {
  const { session } = useSession();
  const via = viaOf(
    trade,
    session?.client_id ?? "",
    session?.platform_url ?? "",
  );
  if (!via) return null;
  const className = cn(
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] uppercase",
    via.kind === "terminal" && "bg-primary/12 text-primary",
    via.kind === "api" && "bg-secondary text-foreground",
    via.kind === "platform" && "bg-[#80f6bc]/12 text-[#80f6bc]",
  );
  const body = (
    <>
      <span>{compact ? via.hint : via.label}</span>
      {via.href ? <ExternalLink className="size-2.5" /> : null}
    </>
  );
  if (!via.href) {
    return <span className={className}>{body}</span>;
  }
  if (!via.href.startsWith("http")) {
    return (
      <button
        type="button"
        className={className}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("broker-navigate", { detail: via.href }),
          )
        }
      >
        {body}
      </button>
    );
  }
  return (
    <a
      href={via.href}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {body}
    </a>
  );
}

export function TerminalJump() {
  const { session } = useSession();
  const platform = session?.platform_url || "https://binodex.app";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("broker-navigate", { detail: "/app/trade" }),
          )
        }
        className="bg-primary/12 text-primary inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px]"
      >
        Broker Desk
        <span className="text-primary/60">desk</span>
      </button>
      <a
        href={platform}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-7 items-center gap-1 rounded-md bg-[#80f6bc]/12 px-2 text-[11px] text-[#80f6bc]"
      >
        Binodex
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

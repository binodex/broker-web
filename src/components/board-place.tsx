"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function BoardPlace({
  title,
  text,
  pulse,
  icon: Icon,
}: {
  title: string;
  text?: string;
  pulse?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex h-full min-h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      {Icon ? (
        <Icon
          className={cn(
            "size-8",
            pulse ? "board-place-icon" : "text-muted-foreground",
          )}
          strokeWidth={1.4}
        />
      ) : null}
      {pulse ? (
        <div className="relative h-px w-[min(160px,44%)] overflow-hidden">
          <div className="board-place-scan absolute inset-y-0 w-1/3" />
        </div>
      ) : null}
      {!Icon && !pulse ? (
        <div className="relative h-px w-[min(220px,56%)] overflow-hidden">
          <div className="absolute inset-y-0 w-1/3 bg-[#80f6bc]" />
        </div>
      ) : null}
      <p className="text-[14px] font-medium tracking-[-0.02em]">{title}</p>
      {text ? (
        <p className="text-muted-foreground max-w-[32ch] text-[12px] leading-relaxed">
          {text}
        </p>
      ) : null}
    </div>
  );
}

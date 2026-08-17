"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function IosSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "bg-card border-border fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-lg border-t outline-none",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4",
          )}
        >
          <div className="flex justify-center pt-2">
            <div className="bg-muted-foreground/40 h-1 w-10 rounded-full" />
          </div>
          <div className="flex h-11 shrink-0 items-center justify-between px-4">
            <DialogPrimitive.Title className="text-[15px] font-medium">
              {title}
            </DialogPrimitive.Title>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-primary h-11 text-[15px]"
            >
              Done
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-[max(12px,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function IosRow({
  onClick,
  active,
  compact,
  children,
}: {
  onClick?: () => void;
  active?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  const className = cn(
    "flex w-full items-center gap-2 px-4 text-left",
    compact ? "h-9" : "h-10",
    active ? "bg-secondary" : "",
    onClick ? "hover:bg-secondary/70" : "",
  );
  if (!onClick) {
    return <div className={className}>{children}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

export function IosGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("divide-y", className)}>{children}</div>;
}

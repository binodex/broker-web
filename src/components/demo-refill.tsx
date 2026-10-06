"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import type { BrokerDemoTopup, BrokerErrorBody } from "@/lib/types";

const REFILL_THRESHOLD = 10;

export function DemoRefill() {
  const { session, mode, patchBalance } = useSession();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const demo = session?.user.demo;

  if (
    unavailable ||
    mode !== "demo" ||
    !demo ||
    demo.total > REFILL_THRESHOLD
  ) {
    return null;
  }

  const refill = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/user/demo-topup", { method: "POST" });
      if (res.status === 404) {
        setUnavailable(true);
        toast.error("Demo refill is not available yet");
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | (BrokerDemoTopup & BrokerErrorBody)
        | null;
      if (res.ok && body?.demo) {
        patchBalance("demo", body.demo);
        toast.success("Demo balance refilled to 10 000 USD");
        return;
      }
      const details = body?.error?.details as
        | { code?: string; retry_after?: number }
        | undefined;
      if (details?.code === "DEMO_TOPUP_COOLDOWN") {
        const minutes = Math.max(1, Math.ceil((details.retry_after ?? 0) / 60));
        toast.error(`Refill is available again in ${minutes} min`);
        return;
      }
      toast.error(body?.error?.message ?? "Could not refill the demo balance");
    } catch {
      toast.error("Could not refill the demo balance");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="icon-xs"
        variant="outline"
        className="size-8 rounded-[4px] md:hidden"
        onClick={() => void refill()}
        disabled={busy}
        title="Refill demo balance to 10 000 USD"
      >
        <RotateCcw className="size-4" />
      </Button>
      <Button
        size="xs"
        variant="outline"
        className="hidden h-6 rounded-[2px] md:inline-flex"
        onClick={() => void refill()}
        disabled={busy}
        title="Refill demo balance to 10 000 USD"
      >
        <RotateCcw />
        Refill
      </Button>
    </>
  );
}

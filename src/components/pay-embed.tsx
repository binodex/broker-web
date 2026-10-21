"use client";

import * as PayWidget from "@binopartner/pay-sdk/react";
import { useSession } from "@/components/session-provider";

interface PayEmbedProps {
  mode: "deposit" | "withdraw";
  onClose: () => void;
  onCredited?: () => void;
}

const NOTICE =
  "text-muted-foreground absolute inset-x-0 top-5 z-10 text-center text-sm";

export function PayEmbed({ mode, onClose, onCredited }: PayEmbedProps) {
  const { session } = useSession();

  if (!session?.client_id) {
    return (
      <div className="relative" style={{ minHeight: 720 }}>
        <div className={NOTICE}>Opening widget…</div>
      </div>
    );
  }

  return (
    <PayWidget.Root
      mode={mode}
      sessionEndpoint="/api/widget-session"
      clientId={session.client_id}
      platformUrl={session.platform_url}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCredited={() => onCredited?.()}
    >
      <div className="relative">
        <PayWidget.Loader className={NOTICE}>Opening widget…</PayWidget.Loader>
        <PayWidget.Status className={NOTICE} />
        <PayWidget.Frame title={mode === "deposit" ? "Deposit" : "Withdraw"} />
      </div>
    </PayWidget.Root>
  );
}

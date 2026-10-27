"use client";

import * as Pay from "@binopartner/pay-sdk/elements";
import "@binopartner/pay-sdk/elements.css";
import * as PayWidget from "@binopartner/pay-sdk/react";
import { useTheme } from "next-themes";
import { useSession } from "@/components/session-provider";

interface PayEmbedProps {
  mode: "deposit" | "withdraw";
  onClose: () => void;
  onCredited?: () => void;
}

const NOTICE =
  "text-muted-foreground absolute inset-x-0 top-5 z-10 text-center text-sm";

const ELEMENTS_ENABLED = ["1", "true"].includes(
  process.env.NEXT_PUBLIC_PAY_ELEMENTS ?? "",
);

export function PayEmbed(props: PayEmbedProps) {
  const { session } = useSession();

  if (!session?.client_id) {
    return (
      <div className="relative" style={{ minHeight: 720 }}>
        <div className={NOTICE}>Opening widget…</div>
      </div>
    );
  }

  return ELEMENTS_ENABLED ? (
    <PayElements
      {...props}
      clientId={session.client_id}
      platformUrl={session.platform_url}
    />
  ) : (
    <PayIframe
      {...props}
      clientId={session.client_id}
      platformUrl={session.platform_url}
    />
  );
}

interface PayTargetProps extends PayEmbedProps {
  clientId: string;
  platformUrl: string;
}

function PayIframe({
  mode,
  onClose,
  onCredited,
  clientId,
  platformUrl,
}: PayTargetProps) {
  return (
    <PayWidget.Root
      mode={mode}
      sessionEndpoint="/api/widget-session"
      clientId={clientId}
      platformUrl={platformUrl}
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

function PayElements({
  mode,
  onClose,
  onCredited,
  clientId,
  platformUrl,
}: PayTargetProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Pay.Root
      mode={mode}
      sessionEndpoint="/api/widget-session"
      clientId={clientId}
      platformUrl={platformUrl}
      fallback="iframe"
      appearance={{
        theme: resolvedTheme === "light" ? "light" : "dark",
        variables: { "font-family": "inherit", "radius-md": "12px" },
      }}
      className="min-h-[520px]"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onEvent={(event) => {
        if (event.type === "deposit.credited") onCredited?.();
      }}
    >
      {mode === "deposit" ? <Pay.DepositForm /> : <Pay.WithdrawForm />}
    </Pay.Root>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";
import type { WidgetSession } from "@/lib/types";

interface PayEmbedProps {
  mode: "deposit" | "withdraw";
  onCredited?: () => void;
}

interface Frame {
  src: string;
  origin: string;
}

const SESSION_REUSE_MS = 45_000;

export function PayEmbed({ mode, onCredited }: PayEmbedProps) {
  const { session } = useSession();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingRef = useRef<{ id: string; mintedAt: number } | null>(null);
  const [height, setHeight] = useState(720);
  const [status, setStatus] = useState("Opening widget…");
  const [frame, setFrame] = useState<Frame | null>(null);
  const platformUrl = session?.platform_url ?? "";
  const clientId = session?.client_id ?? "";

  const mint = useCallback(async (): Promise<WidgetSession | null> => {
    try {
      const res = await fetch("/api/widget-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok || typeof data?.session !== "string") {
        setStatus(data?.error?.message ?? "Could not create widget session");
        return null;
      }
      return data as WidgetSession;
    } catch {
      setStatus("Could not create widget session");
      return null;
    }
  }, [mode]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void mint().then((data) => {
      if (cancelled || !data) return;
      const src =
        data.widget_url ??
        `${platformUrl}/embed/pay?mode=${mode}&client_id=${encodeURIComponent(clientId)}`;
      pendingRef.current = { id: data.session, mintedAt: Date.now() };
      setFrame({ src, origin: data.widget_origin ?? originOf(src) });
      setStatus("");
    });
    return () => {
      cancelled = true;
    };
  }, [mint, mode, platformUrl, clientId]);

  const sendInit = useCallback(
    async (reuse: boolean) => {
      const target = iframeRef.current?.contentWindow;
      if (!target || !frame) return;
      const pending = pendingRef.current;
      pendingRef.current = null;
      const fresh =
        reuse && pending && Date.now() - pending.mintedAt < SESSION_REUSE_MS
          ? pending.id
          : ((await mint())?.session ?? null);
      if (!fresh) return;
      target.postMessage(
        { type: "binodex-embed:init", session: fresh },
        frame.origin,
      );
    },
    [frame, mint],
  );

  useEffect(() => {
    if (!frame) return;
    const onMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      if (event.origin !== frame.origin) return;
      const type = (event.data as { type?: string } | null)?.type;
      if (type === "binodex-embed:ready") void sendInit(true);
      if (type === "binodex-embed:reauth-required") void sendInit(false);
      if (type === "binodex-embed:close") {
        window.dispatchEvent(new Event("broker-embed-close"));
      }
      if (type === "binodex-embed:credited") {
        onCredited?.();
      }
      if (
        type === "binodex-embed:resize" &&
        typeof (event.data as { height?: number }).height === "number"
      ) {
        setHeight(
          Math.max(
            520,
            Math.min(900, (event.data as { height: number }).height),
          ),
        );
      }
      if (type === "binodex-embed:error") {
        setStatus(
          String(
            (event.data as { message?: string }).message ?? "Widget error",
          ),
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frame, sendInit, onCredited]);

  return (
    <div className="relative" style={{ minHeight: height }}>
      {status ? (
        <p className="text-muted-foreground absolute inset-x-0 top-5 z-10 text-center text-sm">
          {status}
        </p>
      ) : null}
      {frame ? (
        <iframe
          ref={iframeRef}
          title={mode === "deposit" ? "Deposit" : "Withdraw"}
          src={frame.src}
          allow="payment *; clipboard-write *"
          className="w-full border-0 bg-transparent"
          style={{ height }}
        />
      ) : null}
    </div>
  );
}

function originOf(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

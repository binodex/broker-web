"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-provider";

interface PayEmbedProps {
  mode: "deposit" | "withdraw";
  onCredited?: () => void;
}

export function PayEmbed({ mode, onCredited }: PayEmbedProps) {
  const { session } = useSession();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);
  const [status, setStatus] = useState("Opening widget…");
  const embedUrl = session?.platform_url ?? "";
  const clientId = session?.client_id ?? "";
  const embedOrigin = originOf(embedUrl);

  const mintAndInit = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !embedOrigin) return;
    setStatus("Creating session…");
    const res = await fetch("/api/widget-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (!res.ok || typeof data.session !== "string") {
      setStatus(data?.error?.message ?? "Could not create widget session");
      return;
    }
    iframe.contentWindow.postMessage(
      { type: "binodex-embed:init", session: data.session },
      embedOrigin,
    );
    setStatus("");
  }, [mode, embedOrigin]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      if (embedOrigin && event.origin !== embedOrigin) return;
      const type = (event.data as { type?: string } | null)?.type;
      if (
        type === "binodex-embed:ready" ||
        type === "binodex-embed:reauth-required"
      ) {
        void mintAndInit();
      }
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
          Math.max(520, Math.min(900, (event.data as { height: number }).height)),
        );
      }
      if (type === "binodex-embed:error") {
        setStatus(
          String((event.data as { message?: string }).message ?? "Widget error"),
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mintAndInit, onCredited, embedOrigin]);

  const src = `${embedUrl}/embed/pay?mode=${mode}&client_id=${encodeURIComponent(clientId)}`;

  return (
    <div className="relative">
      {status ? (
        <p className="text-muted-foreground absolute inset-x-0 top-5 z-10 text-center text-sm">
          {status}
        </p>
      ) : null}
      <iframe
        ref={iframeRef}
        title={mode === "deposit" ? "Deposit" : "Withdraw"}
        src={src}
        allow="payment *; clipboard-write *"
        className="w-full border-0 bg-transparent"
        style={{ height }}
      />
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

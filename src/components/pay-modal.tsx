"use client";

import { useEffect } from "react";
import { PayEmbed } from "@/components/pay-embed";

interface PayModalProps {
  mode: "deposit" | "withdraw" | null;
  onClose: () => void;
  onCredited?: () => void;
}

export function PayModal({ mode, onClose, onCredited }: PayModalProps) {
  useEffect(() => {
    if (!mode) return;
    const onEmbedClose = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("broker-embed-close", onEmbedClose);
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("broker-embed-close", onEmbedClose);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [mode, onClose]);

  if (!mode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-[560px]">
        <PayEmbed key={mode} mode={mode} onCredited={onCredited} />
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { io, type Socket } from "socket.io-client";
import { decodeBrokerPayload } from "@/lib/decode";
import { money } from "@/lib/format";
import type {
  AccountMode,
  BinaryPair,
  BrokerBalance,
  BrokerUser,
  ClosedTrade,
  OpenTrade,
  TradeAction,
} from "@/lib/types";

export type OpenTradeResult =
  | { ok: true; trade?: OpenTrade }
  | { ok: false; error: string };

interface FailItem {
  message: string;
  field?: string;
}

export interface BrokerSocketState {
  connected: boolean;
  authenticating: boolean;
  error: string | null;
  assets: BinaryPair[];
  prices: Record<number, { price: number; timestamp: number }>;
  openTrades: OpenTrade[];
  lastClosed: ClosedTrade[];
}

const empty: BrokerSocketState = {
  connected: false,
  authenticating: false,
  error: null,
  assets: [],
  prices: {},
  openTrades: [],
  lastClosed: [],
};

function asAssets(value: unknown): BinaryPair[] {
  return Array.isArray(value) ? (value as BinaryPair[]) : [];
}

function mergeAssets(list: BinaryPair[], patch: unknown): BinaryPair[] {
  if (!Array.isArray(patch)) return list;
  const next = [...list];
  for (const row of patch as Array<Record<string, unknown>>) {
    const id = Number(row.asset_id ?? row.id);
    const index = next.findIndex((item) => item.id === id);
    if (index < 0) continue;
    next[index] = {
      ...next[index],
      payout:
        typeof row.payout === "number" ? row.payout : next[index].payout,
      scheduled_until:
        typeof row.scheduled_until === "number"
          ? row.scheduled_until
          : next[index].scheduled_until,
    };
  }
  return next;
}

export function useBrokerSocket(input: {
  enabled: boolean;
  userId: number | null;
  token: string | null;
  wsUrl: string;
  mode: AccountMode;
  pairIds: number[];
  onUser: (user: BrokerUser) => void;
  onBalance: (mode: AccountMode, balance: BrokerBalance) => void;
}) {
  const [state, setState] = useState<BrokerSocketState>(empty);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!input.enabled || !input.userId || !input.token || !input.wsUrl) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (!input.enabled || !input.userId) setState(empty);
      return;
    }

    const socket = io(input.wsUrl, {
      transports: ["websocket"],
      autoConnect: true,
    });
    socketRef.current = socket;
    setState((current) => ({
      ...current,
      authenticating: true,
      error: null,
    }));

    const onDecoded = (event: string, handler: (data: unknown) => void) => {
      socket.on(event, (payload: unknown) => {
        handler(decodeBrokerPayload(payload));
      });
    };

    socket.on("connect", () => {
      setState((current) => ({ ...current, connected: true }));
      socket.emit("user.auth", {
        id: inputRef.current.userId,
        token: inputRef.current.token,
      });
      const ids = inputRef.current.pairIds.slice(0, 40);
      if (ids.length) {
        socket.emit("price.subscribe", { assets: ids });
      }
    });

    socket.on("disconnect", () => {
      setState((current) => ({
        ...current,
        connected: false,
        authenticating: false,
      }));
    });

    onDecoded("user.auth.success", () => {
      setState((current) => ({
        ...current,
        authenticating: false,
        error: null,
      }));
    });

    onDecoded("user.auth.error", (data) => {
      const message =
        data && typeof data === "object" && "message" in data
          ? String((data as { message: string }).message)
          : "Socket auth failed";
      setState((current) => ({
        ...current,
        authenticating: false,
        error: message,
      }));
    });

    onDecoded("user.disconnect_token_expired", () => {
      void fetch("/api/auth/refresh", { method: "POST" }).then(() => {
        window.location.reload();
      });
    });

    onDecoded("user.data", (data) => {
      if (data && typeof data === "object") {
        inputRef.current.onUser(data as BrokerUser);
      }
    });

    onDecoded("common.assets_list", (data) => {
      const assets = asAssets(data);
      setState((current) => ({ ...current, assets }));
      const ids = (
        inputRef.current.pairIds.length
          ? inputRef.current.pairIds
          : assets.map((item) => item.id)
      ).slice(0, 40);
      if (ids.length) {
        socket.emit("price.subscribe", { assets: ids });
      }
    });

    onDecoded("common.assets_update", (data) => {
      setState((current) => ({
        ...current,
        assets: mergeAssets(current.assets, data),
      }));
    });

    onDecoded("price.update", (data) => {
      if (!Array.isArray(data) || data.length < 3) return;
      const [assetId, price, timestamp] = data as [number, number, number];
      setState((current) => ({
        ...current,
        prices: {
          ...current.prices,
          [assetId]: { price, timestamp },
        },
      }));
    });

    const onOpen = (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const trade = data as OpenTrade;
      toast.success("Trade opened", {
        description: `${trade.action === "up" ? "Up" : "Down"} · ${money(trade.amount)}`,
      });
      setState((current) => ({
        ...current,
        openTrades: [
          trade,
          ...current.openTrades.filter((item) => item.id !== trade.id),
        ],
      }));
    };

    const onFail = (data: unknown) => {
      const items = Array.isArray(data) ? (data as FailItem[]) : [];
      const message = items[0]?.message ?? "Could not open trade";
      toast.error(message);
      setState((current) => ({ ...current, error: message }));
    };

    const onClose = (mode: AccountMode) => (data: unknown) => {
      const trades =
        data && typeof data === "object" && "trades" in data
          ? ((data as { trades: ClosedTrade[] }).trades ?? [])
          : [];
      setState((current) => {
        const closedIds = new Set(trades.map((item) => item.id));
        return {
          ...current,
          openTrades: current.openTrades.filter(
            (item) => !closedIds.has(item.id),
          ),
          lastClosed: [...trades, ...current.lastClosed].slice(0, 20),
        };
      });
      void mode;
    };

    const onBalance = (mode: AccountMode) => (data: unknown) => {
      if (data && typeof data === "object") {
        inputRef.current.onBalance(mode, data as BrokerBalance);
      }
    };

    onDecoded("user.demo.open_trade.success", onOpen);
    onDecoded("user.real.open_trade.success", onOpen);
    onDecoded("user.demo.open_trade.fail", onFail);
    onDecoded("user.real.open_trade.fail", onFail);
    onDecoded("user.demo.close_trade.success", onClose("demo"));
    onDecoded("user.real.close_trade.success", onClose("real"));
    onDecoded("user.demo.update_balance", onBalance("demo"));
    onDecoded("user.real.update_balance", onBalance("real"));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [input.enabled, input.userId, input.token, input.wsUrl]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !input.pairIds.length) return;
    socket.emit("price.subscribe", { assets: input.pairIds.slice(0, 40) });
  }, [input.pairIds]);

  const openTrade = useCallback(
    async (payload: {
      asset_id: number;
      amount: number;
      action: TradeAction;
      duration: number;
    }): Promise<OpenTradeResult> => {
      const socket = socketRef.current;
      if (socket?.connected) {
        setState((current) => ({ ...current, error: null }));
        socket.emit(`user.${inputRef.current.mode}.open_trade`, payload);
        return { ok: true };
      }
      setState((current) => ({ ...current, error: null }));
      try {
        const res = await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            is_demo: inputRef.current.mode === "demo",
          }),
        });
        const data = (await res.json()) as OpenTrade & {
          error?: { message?: string };
        };
        if (!res.ok) {
          const message = data.error?.message ?? "Could not open trade";
          toast.error(message);
          setState((current) => ({
            ...current,
            error: message,
          }));
          return { ok: false, error: message };
        }
        const trade = data as OpenTrade;
        toast.success("Trade opened", {
          description: `${payload.action === "up" ? "Up" : "Down"} · ${money(payload.amount)}`,
        });
        setState((current) => ({
          ...current,
          openTrades: [
            trade,
            ...current.openTrades.filter((item) => item.id !== trade.id),
          ],
        }));
        const userRes = await fetch("/api/user", { cache: "no-store" });
        if (userRes.ok) {
          inputRef.current.onUser((await userRes.json()) as BrokerUser);
        }
        return { ok: true, trade };
      } catch {
        const message = "Could not open trade";
        toast.error(message);
        setState((current) => ({
          ...current,
          error: message,
        }));
        return { ok: false, error: message };
      }
    },
    [],
  );

  const notePrice = useCallback(
    (assetId: number, value: number, timestamp = Date.now()) => {
      setState((current) => ({
        ...current,
        prices: {
          ...current.prices,
          [assetId]: { price: value, timestamp },
        },
      }));
    },
    [],
  );

  const clearError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return useMemo(
    () => ({ ...state, openTrade, notePrice, clearError }),
    [state, openTrade, notePrice, clearError],
  );
}

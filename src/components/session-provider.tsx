"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useBrokerSocket } from "@/hooks/use-broker-socket";
import type {
  AccountMode,
  BinaryPair,
  BrokerBalance,
  BrokerUser,
  SessionPayload,
} from "@/lib/types";

interface SessionContextValue {
  loading: boolean;
  session: SessionPayload | null;
  mode: AccountMode;
  setMode: (mode: AccountMode) => void;
  setUser: (user: BrokerUser) => void;
  patchBalance: (side: AccountMode, balance: BrokerBalance) => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  pairs: BinaryPair[];
  live: ReturnType<typeof useBrokerSocket>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function readSession(): Promise<SessionPayload | null> {
  const res = await fetch("/api/session", { cache: "no-store" });
  if (res.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
    if (!refreshed.ok) return null;
    const retry = await fetch("/api/session", { cache: "no-store" });
    if (!retry.ok) return null;
    return (await retry.json()) as SessionPayload;
  }
  if (!res.ok) return null;
  return (await res.json()) as SessionPayload;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [mode, setMode] = useState<AccountMode>("demo");
  const [pairs, setPairs] = useState<BinaryPair[]>([]);

  const reload = useCallback(async () => {
    const next = await readSession();
    setSession(next);
  }, []);

  useEffect(() => {
    let alive = true;
    readSession()
      .then((next) => {
        if (alive) setSession(next);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/pairs/binary")
      .then(async (res) => (res.ok ? await res.json() : []))
      .then((data) => {
        const rows = Array.isArray(data)
          ? (data as BinaryPair[])
          : Array.isArray((data as { pairs?: BinaryPair[] })?.pairs)
            ? ((data as { pairs: BinaryPair[] }).pairs)
            : [];
        if (alive) setPairs(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    window.location.href = "/";
  }, []);

  const setUser = useCallback((user: BrokerUser) => {
    setSession((current) => (current ? { ...current, user } : current));
  }, []);

  const patchBalance = useCallback(
    (side: AccountMode, balance: BrokerBalance) => {
      setSession((current) =>
        current
          ? { ...current, user: { ...current.user, [side]: balance } }
          : current,
      );
    },
    [],
  );

  const pairIds = useMemo(() => pairs.map((item) => item.id), [pairs]);

  const live = useBrokerSocket({
    enabled: Boolean(session),
    userId: session?.user.id ?? null,
    token: session?.access_token ?? null,
    wsUrl: session?.ws_url ?? "",
    mode,
    pairIds,
    onUser: setUser,
    onBalance: patchBalance,
  });

  const value = useMemo(
    () => ({
      loading,
      session,
      mode,
      setMode,
      setUser,
      patchBalance,
      reload,
      logout,
      pairs,
      live,
    }),
    [
      loading,
      session,
      mode,
      setUser,
      patchBalance,
      reload,
      logout,
      pairs,
      live,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession outside provider");
  }
  return value;
}

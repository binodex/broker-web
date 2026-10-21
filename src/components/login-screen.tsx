"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/brand-mark";
import { LoginStage } from "@/components/login-stage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "oauth") {
      setError("Sign-in did not complete. Try again.");
    }
  }, []);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not send the code");
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Invalid code");
        return;
      }
      window.location.href = "/app/trade";
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#05070b]">
      <div className="relative flex min-h-dvh min-w-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="relative flex min-h-[48dvh] min-w-0 flex-1 flex-col px-8 pt-[max(2rem,env(safe-area-inset-top))] pb-8 lg:min-h-dvh lg:px-12 lg:py-10">
          <LoginStage />
          <BrandLockup caption="Broker Desk" className="relative z-10" />
          <div className="absolute inset-0 z-10 flex items-center px-10 lg:px-16">
            <div className="max-w-[26rem]">
              <h1 className="text-[2.5rem] leading-[0.92] font-semibold tracking-[-0.04em] lg:text-6xl">
                Broker desk
              </h1>
              <p className="text-foreground/80 mt-4 text-[13px] leading-relaxed lg:mt-5 lg:text-[15px]">
                Balances, deposits, and binary trades. Same market, your desk.
              </p>
            </div>
          </div>
          <p className="text-foreground/45 relative z-10 mt-auto hidden px-2 text-[11px] lg:block lg:px-4">
            Binodex · partner terminal
          </p>
        </section>
        <section className="flex min-w-0 flex-col justify-end lg:h-dvh lg:justify-center lg:border-l lg:border-white/8 lg:bg-[#0b0e11]">
          <form
            onSubmit={sent ? login : sendCode}
            className="grid w-full gap-4 rounded-t-2xl border-t border-white/10 bg-[#0b0e11] px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:rounded-none lg:border-0 lg:px-8 lg:py-0"
          >
            <div className="lg:hidden">
              <p className="text-[15px] font-semibold tracking-tight">Sign in</p>
              <p className="text-foreground/55 mt-1 text-[12px]">
                Binodex account or email code
              </p>
            </div>
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold tracking-tight">Sign in</h2>
              <p className="text-foreground/55 mt-1 text-[13px]">
                Binodex account or email code
              </p>
            </div>
            <Button
              asChild
              className="h-12 w-full rounded-[4px] text-[14px] font-semibold lg:h-11"
            >
              <a href="/api/auth/oauth/start" className="inline-flex items-center gap-2">
                <BrandMark className="size-5" title="" />
                Sign in with Binodex
              </a>
            </Button>
            <div className="text-foreground/45 flex items-center gap-3 text-[11px]">
              <span className="bg-white/10 h-px flex-1" />
              or email code
              <span className="bg-white/10 h-px flex-1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="trader@partner.com"
                autoComplete="email"
                className="h-12 rounded-[4px] lg:h-11"
              />
            </div>
            {sent ? (
              <div className="grid gap-1.5">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  className="h-12 rounded-[4px] tracking-[0.35em] lg:h-11"
                />
              </div>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              disabled={busy}
              variant="outline"
              className="h-12 rounded-[4px] lg:h-11"
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {sent ? "Sign in" : "Send code"}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

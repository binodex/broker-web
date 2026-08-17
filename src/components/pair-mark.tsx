"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const FX = new Set([
  "AED",
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "HUF",
  "ILS",
  "INR",
  "JPY",
  "KRW",
  "MXN",
  "NOK",
  "NZD",
  "PLN",
  "RUB",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "TWD",
  "UAH",
  "USD",
  "ZAR",
]);

const QUOTES = ["USDT", "USDC", "BUSD", "FDUSD", "USD", "EUR", "BTC", "ETH"];

function assetKey(symbol: string) {
  return symbol
    .replace(/\s+OTC$/i, "")
    .replace(/-OTC$/i, "")
    .replace(/^I:/, "")
    .replace("/", "");
}

function coinKeys(symbol: string) {
  const full = assetKey(symbol).toUpperCase();
  const keys = [full];
  for (const quote of QUOTES) {
    if (full.endsWith(quote) && full.length > quote.length) {
      keys.unshift(full.slice(0, -quote.length));
      break;
    }
  }
  return [...new Set(keys)];
}

function splitForex(symbol: string) {
  const clean = symbol
    .replace(/\s+OTC$/i, "")
    .replace(/-OTC$/i, "")
    .replace(/^I:/, "");
  let base = "";
  let quote = "";
  if (clean.includes("/")) {
    const parts = clean.split("/");
    if (parts.length !== 2) return null;
    [base, quote] = parts;
  } else if (/^[A-Za-z]{6}$/.test(clean)) {
    base = clean.slice(0, 3);
    quote = clean.slice(3);
  } else {
    return null;
  }
  base = base.toUpperCase();
  quote = quote.toUpperCase();
  if (!FX.has(base) || !FX.has(quote)) return null;
  return { base, quote };
}

function initials(symbol: string) {
  const clean = assetKey(symbol);
  return clean.slice(0, 3).toUpperCase();
}

export function PairMark({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const forex = splitForex(symbol);
  if (forex) {
    return (
      <span className={cn("relative inline-block size-7 shrink-0", className)}>
        <img
          alt=""
          src={`/pair-icons/currencies/${forex.base}.svg`}
          className="absolute top-0 left-0 size-[72%] rounded-full object-cover"
        />
        <img
          alt=""
          src={`/pair-icons/currencies/${forex.quote}.svg`}
          className="border-background absolute top-0 right-0 size-[72%] rounded-full border object-cover"
        />
      </span>
    );
  }

  return <CoinMark symbol={symbol} className={className} />;
}

function CoinMark({
  symbol,
  className,
}: {
  symbol: string;
  className?: string;
}) {
  const variants = coinKeys(symbol).flatMap((key) => [`${key}.svg`, `${key}.png`]);
  const [step, setStep] = useState(0);
  if (step >= variants.length || symbol.startsWith("#")) {
    return (
      <span
        className={cn(
          "bg-secondary text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-[3px] font-mono text-[9px] font-semibold",
          className,
        )}
      >
        {initials(symbol)}
      </span>
    );
  }
  return (
    <img
      alt=""
      src={`/pair-icons/${variants[step]}`}
      className={cn("size-7 shrink-0 rounded-[3px] object-cover", className)}
      onError={() => setStep((current) => current + 1)}
    />
  );
}

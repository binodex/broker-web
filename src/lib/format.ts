export function money(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function quoteDigits(apiDigits: number, value?: number) {
  if (apiDigits > 0) return Math.min(8, apiDigits);
  if (value == null || !Number.isFinite(value) || value === 0) return 5;
  const abs = Math.abs(value);
  if (abs >= 100) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 5;
  if (abs >= 0.0001) return 6;
  return 8;
}

export function price(value: number, digits = 5) {
  const d = quoteDigits(digits, value);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function when(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(ms);
}

export function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function levelLabel(code: string) {
  const map: Record<string, string> = {
    demo: "Demo",
    member: "Member",
    standard: "Standard",
    pro: "Pro",
    expert: "Expert",
    diamond: "Diamond",
  };
  return map[code] ?? code;
}

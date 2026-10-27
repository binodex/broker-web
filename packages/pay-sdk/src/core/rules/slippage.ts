export const acceptSlippagePct = (shownPct: string | number): number | null => {
  const pct = Number(shownPct);
  if (!Number.isFinite(pct) || pct < 0) return null;
  // One display unit above the rounded percent clears the server's bps-precision gate.
  return Math.min(100, Number((pct + 0.01).toFixed(2)));
};

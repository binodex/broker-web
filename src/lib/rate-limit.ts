const buckets = new Map<string, number[]>()

function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export function visitorRateLimit(
  request: Request,
  key: string,
  max: number,
  windowMs: number,
): Response | null {
  const id = `${key}:${clientIp(request)}`;
  const now = Date.now();
  const times = (buckets.get(id) ?? []).filter((stamp) => now - stamp < windowMs);
  if (times.length >= max) {
    buckets.set(id, times);
    return Response.json(
      {
        error: {
          message: "Too many requests",
          details: { field: "rate_limit" },
        },
      },
      { status: 429 },
    );
  }
  times.push(now);
  buckets.set(id, times);
  return null;
}

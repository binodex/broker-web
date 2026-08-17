import { brokerFetch, jsonError } from "@/lib/broker";
import { visitorRateLimit } from "@/lib/rate-limit";
import type { Candle } from "@/lib/types";

export async function GET(request: Request) {
  const limited = visitorRateLimit(request, "chart", 60, 60_000);
  if (limited) return limited;
  try {
    const url = new URL(request.url);
    const assetId = url.searchParams.get("asset_id");
    const interval = url.searchParams.get("interval") ?? "1m";
    const limit = url.searchParams.get("limit") ?? "800";
    const startTime = url.searchParams.get("start_time");
    if (!assetId) {
      return Response.json(
        { error: { message: "asset_id is required" } },
        { status: 400 },
      );
    }
    const params = new URLSearchParams({
      asset_id: assetId,
      interval,
      limit,
      start_time: startTime ?? String(Date.now() - 300 * 60_000),
    });
    const data = await brokerFetch<Candle[]>(`/broker/chart?${params}`);
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

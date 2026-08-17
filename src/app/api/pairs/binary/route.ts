import { brokerFetch, jsonError } from "@/lib/broker";
import { visitorRateLimit } from "@/lib/rate-limit";
import type { BinaryPair } from "@/lib/types";

export async function GET(request: Request) {
  const limited = visitorRateLimit(request, "pairs-binary", 30, 60_000);
  if (limited) return limited;
  try {
    const data = await brokerFetch<BinaryPair[]>("/broker/pairs/binary");
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

import { brokerFetch, jsonError } from "@/lib/broker";
import { getAccessToken } from "@/lib/session";
import type { ClosedTrade, OpenTrade } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return Response.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }
    const url = new URL(request.url);
    const params = new URLSearchParams();
    for (const key of ["status", "is_demo", "limit", "offset"]) {
      const value = url.searchParams.get(key);
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    const data = await brokerFetch<{ trades: Array<OpenTrade | ClosedTrade> }>(
      `/broker/user/trades${qs ? `?${qs}` : ""}`,
      { token },
    );
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = await getAccessToken();
    if (!token) {
      return Response.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }
    const body = await request.json();
    const data = await brokerFetch<OpenTrade>("/broker/user/trades", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

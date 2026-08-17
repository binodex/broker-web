import { brokerFetch, jsonError } from "@/lib/broker";
import { requestPublicOrigin } from "@/lib/request-origin";
import { getAccessToken } from "@/lib/session";

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
    const mode = body?.mode === "withdraw" ? "withdraw" : "deposit";
    const origin = requestPublicOrigin(request);
    const data = await brokerFetch<{ session: string; expires_in: number }>(
      "/broker/widget-sessions",
      {
        method: "POST",
        token,
        body: JSON.stringify({ origin, mode }),
      },
    );
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

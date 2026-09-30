import { brokerFetch, jsonError } from "@/lib/broker";
import { requestClientIp, requestPublicOrigin } from "@/lib/request-origin";
import { getAccessToken } from "@/lib/session";
import type { WidgetSession } from "@/lib/types";

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
    const userIp = requestClientIp(request);
    const data = await brokerFetch<WidgetSession>("/broker/widget-sessions", {
      method: "POST",
      token,
      body: JSON.stringify({
        origin,
        mode,
        ...(userIp ? { user_ip: userIp } : {}),
      }),
    });
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

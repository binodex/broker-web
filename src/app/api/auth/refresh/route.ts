import { brokerFetch, jsonError } from "@/lib/broker";
import { getRefreshToken, setAuthCookies } from "@/lib/session";
import type { TokenPair } from "@/lib/types";

export async function POST() {
  try {
    const refresh = await getRefreshToken();
    if (!refresh) {
      return Response.json(
        { error: { message: "No refresh token" } },
        { status: 401 },
      );
    }
    const data = await brokerFetch<TokenPair>("/broker/user-auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refresh }),
    });
    await setAuthCookies(data.access_token, data.refresh_token);
    return Response.json({ ok: true, expires_in: data.expires_in });
  } catch (error) {
    return jsonError(error);
  }
}

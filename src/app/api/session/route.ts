import { brokerFetch, jsonError } from "@/lib/broker";
import { brokerServerEnv } from "@/lib/env";
import { getAccessToken, getProfileJson } from "@/lib/session";
import type { BrokerAuthUser, BrokerUser, SessionPayload } from "@/lib/types";

export async function GET() {
  try {
    const token = await getAccessToken();
    if (!token) {
      return Response.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }
    const env = brokerServerEnv();
    const user = await brokerFetch<BrokerUser>("/broker/user", { token });
    let profile: BrokerAuthUser | null = null;
    const raw = await getProfileJson();
    if (raw) {
      try {
        profile = JSON.parse(raw) as BrokerAuthUser;
      } catch {
        profile = null;
      }
    }
    const payload: SessionPayload = {
      access_token: token,
      user,
      profile,
      client_id: env.clientId,
      ws_url: env.wsUrl,
      platform_url: env.platformUrl,
    };
    return Response.json(payload);
  } catch (error) {
    return jsonError(error);
  }
}

import { brokerFetch, jsonError } from "@/lib/broker";
import { getAccessToken } from "@/lib/session";
import type { BrokerUser } from "@/lib/types";

export async function GET() {
  try {
    const token = await getAccessToken();
    if (!token) {
      return Response.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }
    const user = await brokerFetch<BrokerUser>("/broker/user", { token });
    return Response.json(user);
  } catch (error) {
    return jsonError(error);
  }
}

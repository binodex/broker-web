import { brokerFetch, jsonError } from "@/lib/broker";
import { getAccessToken } from "@/lib/session";
import type { BrokerDemoTopup } from "@/lib/types";

export async function POST() {
  try {
    const token = await getAccessToken();
    if (!token) {
      return Response.json(
        { error: { message: "Unauthorized" } },
        { status: 401 },
      );
    }
    const data = await brokerFetch<BrokerDemoTopup>(
      "/broker/user/demo/topup",
      { method: "POST", token },
    );
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

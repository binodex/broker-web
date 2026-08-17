import { brokerFetch, jsonError, notConfiguredResponse } from "@/lib/broker";
import { brokerServerEnv } from "@/lib/env";
import { visitorRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = visitorRateLimit(request, "auth-send-code", 5, 5 * 60_000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!email) {
      return Response.json(
        { error: { message: "Email is required" } },
        { status: 400 },
      );
    }
    const env = brokerServerEnv();
    if (!env.clientSecret) {
      return notConfiguredResponse();
    }
    const data = await brokerFetch<{ status: boolean }>(
      "/broker/user-auth/email/send-code",
      {
        method: "POST",
        body: JSON.stringify({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          email,
        }),
      },
    );
    return Response.json(data);
  } catch (error) {
    return jsonError(error);
  }
}

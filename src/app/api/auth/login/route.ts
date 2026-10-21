import { brokerFetch, jsonError, notConfiguredResponse } from "@/lib/broker";
import { brokerServerEnv } from "@/lib/env";
import { visitorRateLimit } from "@/lib/rate-limit";
import { setAuthCookies } from "@/lib/session";
import type { LoginResponse } from "@/lib/types";

export async function POST(request: Request) {
  const limited = visitorRateLimit(request, "auth-login", 10, 5 * 60_000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const code = String(body?.code ?? "").trim();
    if (!email || !code) {
      return Response.json(
        { error: { message: "Email and code are required" } },
        { status: 400 },
      );
    }
    const env = brokerServerEnv();
    if (!env.clientSecret) {
      return notConfiguredResponse();
    }
    const data = await brokerFetch<LoginResponse>(
      "/broker/user-auth/email/login",
      {
        method: "POST",
        body: JSON.stringify({
          client_id: env.clientId,
          client_secret: env.clientSecret,
          email,
          code,
          ...(typeof body?.partner_code === "string" && body.partner_code
            ? { partner_code: body.partner_code }
            : {}),
        }),
      },
    );
    await setAuthCookies(
      data.access_token,
      data.refresh_token,
      JSON.stringify(data.user),
    );
    return Response.json({ ok: true, user: data.user });
  } catch (error) {
    return jsonError(error);
  }
}

import { brokerFetch } from "@/lib/broker";
import { brokerServerEnv } from "@/lib/env";
import { requestPublicOrigin, requestRedirectUri } from "@/lib/request-origin";
import { setAuthCookies, takeOAuthState } from "@/lib/session";
import type { LoginResponse } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const env = brokerServerEnv();
  const origin = requestPublicOrigin(request);
  const redirectUri = requestRedirectUri(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = await takeOAuthState();
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/?error=oauth", origin));
  }
  try {
    const data = await brokerFetch<LoginResponse>("/broker/oauth/token", {
      method: "POST",
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: redirectUri,
      }),
    });
    await setAuthCookies(
      data.access_token,
      data.refresh_token,
      JSON.stringify(data.user),
    );
    return NextResponse.redirect(new URL("/app", origin));
  } catch {
    return NextResponse.redirect(new URL("/?error=oauth", origin));
  }
}

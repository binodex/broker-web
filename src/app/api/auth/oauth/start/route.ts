import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { notConfiguredResponse } from "@/lib/broker";
import { brokerServerEnv } from "@/lib/env";
import { requestRedirectUri } from "@/lib/request-origin";
import { setOAuthState } from "@/lib/session";

export async function GET(request: Request) {
  const env = brokerServerEnv();
  if (!env.clientSecret) {
    return notConfiguredResponse();
  }
  const state = randomBytes(16).toString("base64url");
  await setOAuthState(state);
  const redirectUri = requestRedirectUri(request);
  const url = new URL("/oauth/authorize", env.platformUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

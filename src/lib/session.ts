import { cookies } from "next/headers";

const ACCESS = "broker_access";
const REFRESH = "broker_refresh";
const PROFILE = "broker_profile";
const OAUTH_STATE = "broker_oauth_state";

function cookieSecure() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  profileJson?: string,
) {
  const jar = await cookies();
  jar.set(ACCESS, accessToken, cookieOptions(60 * 60));
  jar.set(REFRESH, refreshToken, cookieOptions(60 * 60 * 24 * 90));
  if (profileJson) {
    jar.set(PROFILE, profileJson, cookieOptions(60 * 60 * 24 * 7));
  }
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
  jar.delete(PROFILE);
}

export async function getAccessToken() {
  return (await cookies()).get(ACCESS)?.value ?? null;
}

export async function getRefreshToken() {
  return (await cookies()).get(REFRESH)?.value ?? null;
}

export async function getProfileJson() {
  return (await cookies()).get(PROFILE)?.value ?? null;
}

export async function setOAuthState(state: string) {
  const jar = await cookies();
  jar.set(OAUTH_STATE, state, cookieOptions(600));
}

export async function takeOAuthState() {
  const jar = await cookies();
  const value = jar.get(OAUTH_STATE)?.value ?? null;
  jar.delete(OAUTH_STATE);
  return value;
}

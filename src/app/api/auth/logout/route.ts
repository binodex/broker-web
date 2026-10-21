import { clearAuthCookies } from "@/lib/session";

export async function POST() {
  await clearAuthCookies();
  return Response.json({ ok: true });
}

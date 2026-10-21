import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requestPublicOrigin } from "@/lib/request-origin";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("broker_access")?.value;
  const { pathname } = request.nextUrl;
  const origin = requestPublicOrigin(request);

  if (pathname.startsWith("/app") && !token) {
    return NextResponse.redirect(new URL("/", origin));
  }
  if (pathname === "/" && token) {
    return NextResponse.redirect(new URL("/app/trade", origin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/app/:path*"],
};

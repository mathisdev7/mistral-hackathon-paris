import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";

// Routes that require a logged-in session
const PROTECTED = ["/", "/chat", "/memory", "/settings"];
// Routes only for guests (redirect to / if already logged in)
const GUEST_ONLY = ["/sign-in"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await auth.api.getSession({ headers: request.headers });

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isGuestOnly = GUEST_ONLY.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (isGuestOnly && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/chat/:path*", "/sign-in", "/memory", "/settings"],
};

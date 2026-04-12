import { NextResponse, type NextRequest } from "next/server";

/**
 * Hide debug routes on production deployments unless explicitly enabled.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/test-db")) {
    const enabled =
      process.env.NODE_ENV === "development" ||
      process.env.ENABLE_TEST_DB === "true";
    if (!enabled) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/test-db", "/test-db/:path*"],
};

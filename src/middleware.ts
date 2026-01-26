import { type NextRequest, NextResponse } from "next/server";
import { handleNhostMiddleware } from "./lib/nhost/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip middleware for public routes and static files
  if (
    path.startsWith("/_next") ||
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/verify") ||
    path.includes(".") // Static files
  ) {
    return NextResponse.next();
  }

  // Use Nhost's handleNhostMiddleware for authentication
  return handleNhostMiddleware(request, () => {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sign-in, sign-up, forgot-password, verify (auth pages)
     */
    "/((?!_next/static|_next/image|favicon.ico|sign-in|sign-up|forgot-password|verify).*)",
  ],
  runtime: "nodejs",
};

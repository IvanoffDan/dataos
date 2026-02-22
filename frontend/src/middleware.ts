import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";
  const path = req.nextUrl.pathname.replace(/^\/api/, "");
  const target = new URL(path + req.nextUrl.search, backendUrl);
  return NextResponse.rewrite(target);
}

export const config = {
  matcher: "/api/:path*",
};

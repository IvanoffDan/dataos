import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

const SKIP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-encoding",
  "content-length",
]);

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api/, "");
  const url = new URL(path + req.nextUrl.search, BACKEND_URL);

  const headers = new Headers(req.headers);
  headers.delete("host");

  // Buffer body — fetch re-sends on 307/308 redirects, ReadableStreams are single-use
  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body,
    redirect: "follow",
  });

  // Build response headers as tuples to preserve multiple set-cookie values
  const resHeaders: [string, string][] = [];
  upstream.headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== "set-cookie") {
      resHeaders.push([key, value]);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    resHeaders.push(["set-cookie", cookie]);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export const config = {
  matcher: "/api/:path*",
};

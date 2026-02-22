import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "content-encoding",
  "content-length",
]);

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const target = new URL(path.join("/"), BACKEND_URL);
  req.nextUrl.searchParams.forEach((value, key) =>
    target.searchParams.set(key, value)
  );

  const reqHeaders = new Headers(req.headers);
  reqHeaders.delete("host");

  // Buffer body — fetch re-sends on 307/308 redirects, ReadableStreams are single-use
  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  const res = await fetch(target, {
    method: req.method,
    headers: reqHeaders,
    body,
    redirect: "follow",
  });

  // Build response headers, skipping hop-by-hop and stale encoding headers
  const resHeaders = new NextResponse().headers;
  res.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      resHeaders.append(key, value);
    }
  });

  // Explicitly forward set-cookie headers (getSetCookie preserves individual values)
  if (typeof res.headers.getSetCookie === "function") {
    resHeaders.delete("set-cookie");
    for (const cookie of res.headers.getSetCookie()) {
      resHeaders.append("set-cookie", cookie);
    }
  }

  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};

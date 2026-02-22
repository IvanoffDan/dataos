import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const target = new URL(path.join("/"), BACKEND_URL);
  req.nextUrl.searchParams.forEach((value, key) =>
    target.searchParams.set(key, value)
  );

  const headers = new Headers(req.headers);
  headers.delete("host");

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.body,
    // @ts-expect-error duplex is required for streaming request bodies
    duplex: "half",
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };

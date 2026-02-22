export function api(path: string, init?: RequestInit): Promise<Response> {
  const normalized = path.replace(/\/+$/, "") || path;
  return fetch(normalized, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

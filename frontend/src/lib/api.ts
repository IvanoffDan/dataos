export const api = (path: string, init?: RequestInit): Promise<Response> => {
  const normalized = path.replace(/\/+$/, "") || path;
  return fetch(normalized, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
};

export const jsonOrThrow = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
};

export const apiFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await api(path, init);
  return jsonOrThrow<T>(res);
};

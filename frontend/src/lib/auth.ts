import { api } from "./api";

export async function login(username: string, password: string) {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  return res.json();
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST" });
}

export async function getMe() {
  const res = await api("/api/auth/me");
  if (!res.ok) return null;
  return res.json();
}

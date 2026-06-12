const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

let authToken: string | null = null;

export function setToken(t: string | null) {
  authToken = t;
}

export function getToken() {
  return authToken;
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any } = {},
): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const detail =
      typeof data?.detail === "string" ? data.detail : "Something went wrong";
    throw new Error(detail);
  }
  return data as T;
}

export function wsUrl(): string {
  const proto = BASE!.startsWith("https") ? "wss" : "ws";
  const host = BASE!.replace(/^https?:\/\//, "");
  return `${proto}://${host}/api/ws?token=${authToken}`;
}

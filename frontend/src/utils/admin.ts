import { api } from "@/src/api/client";

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  verified: boolean;
  role: string;
  country: string | null;
  created_at: string;
  suspended?: boolean;
  failed_attempts?: number;
  locked_until?: string | null;
  suspicious?: boolean;
  suspicious_reasons?: string[];
};

export type AdminStats = {
  total_users: number;
  verified_users: number;
  signups_24h: number;
  logins_24h: number;
  failed_logins_24h: number;
  lockouts_24h: number;
  open_reports: number;
  screenshots_7d: number;
  failed_verifications_7d: number;
  active_sessions: number;
};

export type AdminReport = {
  id: string;
  reporter_id: string;
  reporter_username: string;
  target_id: string;
  target_username: string;
  category: string;
  reason: string;
  status: string;
  created_at: string;
};

export type SecurityEvent = {
  id: string;
  event: string;
  user_id: string | null;
  email: string | null;
  ip: string | null;
  success: boolean;
  reason: string | null;
  created_at: string;
};

export const adminApi = {
  me: () => api<{ id: string; username: string; role: string }>("/admin/me"),
  stats: () => api<AdminStats>("/admin/stats"),
  users: (q = "", reveal = false, reason = "") => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (reveal) {
      params.set("reveal", "true");
      params.set("reason", reason);
    }
    const qs = params.toString();
    return api<AdminUser[]>(`/admin/users${qs ? `?${qs}` : ""}`);
  },
  userDetail: (id: string, reveal = false, reason = "") => {
    const params = new URLSearchParams();
    if (reveal) {
      params.set("reveal", "true");
      params.set("reason", reason);
    }
    const qs = params.toString();
    return api<any>(`/admin/users/${id}${qs ? `?${qs}` : ""}`);
  },
  reports: (status = "open") =>
    api<AdminReport[]>(`/admin/reports?status_filter=${status}`),
  resolveReport: (id: string, action: string, notes = "") =>
    api(`/admin/reports/${id}/resolve`, {
      method: "POST",
      body: { action, notes },
    }),
  securityEvents: (event = "", reveal = false, reason = "") => {
    const params = new URLSearchParams();
    if (event) params.set("event", event);
    if (reveal) {
      params.set("reveal", "true");
      params.set("reason", reason);
    }
    const qs = params.toString();
    return api<SecurityEvent[]>(`/admin/security-events${qs ? `?${qs}` : ""}`);
  },
  screenshotEvents: () => api<any[]>("/admin/screenshot-events"),
  auditLog: () => api<any[]>("/admin/audit-log"),
  setRole: (user_id: string, role: string) =>
    api("/admin/roles", { method: "POST", body: { user_id, role } }),
  suspend: (user_id: string, notes: string) =>
    api(`/admin/users/${user_id}/suspend`, {
      method: "POST",
      body: { action: "block_user", notes },
    }),
  unsuspend: (user_id: string) =>
    api(`/admin/users/${user_id}/unsuspend`, { method: "POST" }),

  // Oversight
  activity: (limit = 100, since?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (since) params.set("since", since);
    return api<{ events: any[] }>(`/admin/activity?${params}`);
  },
  dossier: (userId: string, reveal = false, reason = "") => {
    const params = new URLSearchParams();
    if (reveal) {
      params.set("reveal", "true");
      params.set("reason", reason);
    }
    const qs = params.toString();
    return api<any>(`/admin/users/${userId}/dossier${qs ? `?${qs}` : ""}`);
  },
  geoipLookup: (ip: string) =>
    api<any>(`/admin/geoip-lookup?ip=${encodeURIComponent(ip)}`),

  // App version
  getAppVersion: () => api<any>("/admin/app-version"),
  setAppVersion: (payload: any) =>
    api<any>("/admin/app-version", { method: "POST", body: payload }),
};

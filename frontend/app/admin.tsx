import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Toast, useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, SP } from "@/src/theme";
import {
  AdminReport,
  AdminStats,
  AdminUser,
  SecurityEvent,
  adminApi,
} from "@/src/utils/admin";

type Tab = "overview" | "users" | "activity" | "dossier" | "reports" | "security" | "screenshots" | "audit" | "appversion";

export default function AdminCRM() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");

  // Web-only gate
  useEffect(() => {
    if (Platform.OS !== "web") {
      router.replace("/");
      return;
    }
  }, [router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.onSurface} />
      </View>
    );
  }
  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={styles.gateTitle}>Admin CRM</Text>
        <Text style={styles.gateText}>Please log in with a staff account.</Text>
        <Pressable style={styles.cta} onPress={() => router.replace("/auth")}>
          <Text style={styles.ctaText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }
  if (!["admin", "manager", "supervisor"].includes(user.role)) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={42} color={C.muted} />
        <Text style={styles.gateTitle}>Staff access required</Text>
        <Text style={styles.gateText}>
          This area is restricted to admin / manager / supervisor accounts.
        </Text>
        <Pressable style={styles.cta} onPress={() => router.replace("/")}>
          <Text style={styles.ctaText}>Back to app</Text>
        </Pressable>
      </View>
    );
  }

  const canReveal = ["admin", "manager"].includes(user.role);
  const isAdmin = user.role === "admin";

  const TABS: { key: Tab; label: string; icon: any; visible: boolean }[] = [
    { key: "overview", label: "Overview", icon: "speedometer-outline", visible: true },
    { key: "activity", label: "Activity Feed", icon: "pulse-outline", visible: isAdmin },
    { key: "users", label: "Users", icon: "people-outline", visible: true },
    { key: "dossier", label: "User Dossier", icon: "id-card-outline", visible: isAdmin },
    { key: "reports", label: "Reports", icon: "flag-outline", visible: true },
    { key: "security", label: "Security Events", icon: "shield-outline", visible: true },
    { key: "screenshots", label: "Screenshots", icon: "camera-outline", visible: true },
    { key: "audit", label: "Audit Log", icon: "document-text-outline", visible: isAdmin },
    { key: "appversion", label: "App Version", icon: "cloud-upload-outline", visible: isAdmin },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="admin-screen">
      <View style={styles.topbar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SP.md }}>
          <View style={styles.logoSq}>
            <Ionicons name="shield-checkmark" size={18} color={C.onInverse} />
          </View>
          <View>
            <Text style={styles.title}>Swag Chat CRM</Text>
            <Text style={styles.subtitle}>
              @{user.username} · {user.role.toUpperCase()} · PII masked by
              default
            </Text>
          </View>
        </View>
        <Pressable
          testID="admin-back-app"
          style={styles.backToApp}
          onPress={() => router.replace("/")}
        >
          <Ionicons name="arrow-back-outline" size={16} color={C.onSurface} />
          <Text style={styles.backToAppText}>Back to app</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Sidebar */}
        <View style={styles.sidebar}>
          {TABS.filter((t) => t.visible).map((t) => (
            <Pressable
              key={t.key}
              testID={`admin-tab-${t.key}`}
              onPress={() => setTab(t.key)}
              style={[
                styles.sideItem,
                tab === t.key && styles.sideItemActive,
              ]}
            >
              <Ionicons
                name={t.icon}
                size={18}
                color={tab === t.key ? C.onInverse : C.onSurface}
              />
              <Text
                style={[
                  styles.sideItemText,
                  tab === t.key && { color: C.onInverse },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Main */}
        <ScrollView style={styles.main} contentContainerStyle={{ padding: SP.xl }}>
          {tab === "overview" && <OverviewPanel toast={toast} />}
          {tab === "activity" && isAdmin && <ActivityPanel toast={toast} />}
          {tab === "users" && (
            <UsersPanel canReveal={canReveal} isAdmin={isAdmin} toast={toast} />
          )}
          {tab === "dossier" && isAdmin && <DossierPanel toast={toast} />}
          {tab === "reports" && <ReportsPanel isAdmin={isAdmin} toast={toast} />}
          {tab === "security" && (
            <SecurityPanel canReveal={canReveal} toast={toast} />
          )}
          {tab === "screenshots" && <ScreenshotsPanel toast={toast} />}
          {tab === "audit" && isAdmin && <AuditPanel toast={toast} />}
          {tab === "appversion" && isAdmin && <AppVersionPanel toast={toast} />}
        </ScrollView>
      </View>
      <Toast message={toast.message} />
    </View>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function OverviewPanel({ toast }: { toast: any }) {
  const [s, setS] = useState<AdminStats | null>(null);
  const load = useCallback(() => {
    adminApi.stats().then(setS).catch((e) => toast.show(e.message));
  }, [toast]);
  useEffect(load, [load]);
  if (!s) return <ActivityIndicator color={C.onSurface} />;
  return (
    <View>
      <Text style={styles.h1}>Overview</Text>
      <Text style={styles.lead}>
        Live operational health of Swag Chat. All counters update on refresh.
      </Text>
      <View style={styles.grid}>
        <StatCard label="Total users" value={s.total_users} />
        <StatCard label="Verified users" value={s.verified_users} hint="KYC passed" />
        <StatCard label="Sign-ups (24h)" value={s.signups_24h} />
        <StatCard label="Logins (24h)" value={s.logins_24h} />
        <StatCard label="Failed logins (24h)" value={s.failed_logins_24h} />
        <StatCard label="Lockouts (24h)" value={s.lockouts_24h} hint="5 fails → 15-min lock" />
        <StatCard label="Open reports" value={s.open_reports} />
        <StatCard label="Screenshots (7d)" value={s.screenshots_7d} />
        <StatCard label="Failed verifications (7d)" value={s.failed_verifications_7d} />
        <StatCard label="Active sessions" value={s.active_sessions} hint="WebSocket connections" />
      </View>
      <Pressable style={styles.smallBtn} onPress={load} testID="admin-refresh-stats">
        <Ionicons name="refresh" size={14} color={C.onSurface} />
        <Text style={styles.smallBtnText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

function RevealBar({
  onReveal,
  shown,
  setShown,
  reason,
  setReason,
}: any) {
  return (
    <View style={styles.revealBar}>
      <Ionicons
        name={shown ? "eye" : "eye-off-outline"}
        size={16}
        color={C.mutedDark}
      />
      <Text style={styles.revealLabel}>
        PII {shown ? "REVEALED" : "masked"}
      </Text>
      <TextInput
        testID="admin-reveal-reason"
        style={styles.revealInput}
        placeholder="Reason (min 4 chars) to reveal PII"
        placeholderTextColor={C.muted}
        value={reason}
        onChangeText={setReason}
      />
      <Pressable
        testID="admin-reveal-toggle"
        style={styles.revealBtn}
        onPress={() => {
          if (shown) {
            setShown(false);
          } else {
            if (reason.trim().length < 4) {
              return;
            }
            setShown(true);
            onReveal?.();
          }
        }}
      >
        <Text style={styles.revealBtnText}>{shown ? "Hide" : "Reveal"}</Text>
      </Pressable>
    </View>
  );
}

function UsersPanel({
  canReveal,
  isAdmin,
  toast,
}: {
  canReveal: boolean;
  isAdmin: boolean;
  toast: any;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<AdminUser[] | null>(null);
  const [shown, setShown] = useState(false);
  const [reason, setReason] = useState("");
  const load = useCallback(() => {
    adminApi
      .users(q, shown && canReveal, reason)
      .then(setData)
      .catch((e) => toast.show(e.message));
  }, [q, shown, canReveal, reason, toast]);
  useEffect(load, [load]);

  const setRole = async (uid: string, role: string) => {
    try {
      await adminApi.setRole(uid, role);
      toast.show("Role updated");
      load();
    } catch (e: any) {
      toast.show(e.message);
    }
  };
  const suspend = async (uid: string) => {
    const notes = prompt("Reason for suspension?") || "";
    if (!notes) return;
    try {
      await adminApi.suspend(uid, notes);
      toast.show("Suspended");
      load();
    } catch (e: any) {
      toast.show(e.message);
    }
  };
  const unsuspend = async (uid: string) => {
    try {
      await adminApi.unsuspend(uid);
      toast.show("Unsuspended");
      load();
    } catch (e: any) {
      toast.show(e.message);
    }
  };

  return (
    <View>
      <Text style={styles.h1}>Users</Text>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={C.muted} />
        <TextInput
          testID="admin-user-search"
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Search by username or email…"
          placeholderTextColor={C.muted}
          onSubmitEditing={load}
        />
        <Pressable style={styles.smallBtn} onPress={load}>
          <Text style={styles.smallBtnText}>Go</Text>
        </Pressable>
      </View>
      {canReveal && (
        <RevealBar
          onReveal={load}
          shown={shown}
          setShown={(v: boolean) => {
            setShown(v);
            setTimeout(load, 0);
          }}
          reason={reason}
          setReason={setReason}
        />
      )}
      {!data ? (
        <ActivityIndicator color={C.onSurface} />
      ) : (
        <View>
          {data.map((u) => (
            <View key={u.id} style={styles.userRow} testID={`admin-user-${u.username}`}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.userName}>@{u.username}</Text>
                  {u.verified && (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>verified</Text>
                    </View>
                  )}
                  <View style={[styles.tag, styles.tagRole]}>
                    <Text style={[styles.tagText, { color: C.onInverse }]}>{u.role}</Text>
                  </View>
                  {u.suspended && (
                    <View style={[styles.tag, styles.tagSus]}>
                      <Text style={styles.tagText}>suspended</Text>
                    </View>
                  )}
                  {u.suspicious && (
                    <View style={[styles.tag, styles.tagWarn]}>
                      <Text style={styles.tagText}>
                        ⚠️ {u.suspicious_reasons?.join(", ")}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.userMeta}>
                  {u.email} · {u.country || "—"} · joined{" "}
                  {new Date(u.created_at).toLocaleDateString()}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: SP.sm }}>
                {isAdmin && u.role !== "admin" && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() =>
                      setRole(
                        u.id,
                        u.role === "user"
                          ? "supervisor"
                          : u.role === "supervisor"
                            ? "manager"
                            : u.role === "manager"
                              ? "admin"
                              : "user",
                      )
                    }
                  >
                    <Text style={styles.actionText}>Promote</Text>
                  </Pressable>
                )}
                {isAdmin && u.role !== "user" && u.role !== "admin" && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => setRole(u.id, "user")}
                  >
                    <Text style={styles.actionText}>Reset role</Text>
                  </Pressable>
                )}
                {!u.suspended ? (
                  <Pressable
                    testID={`admin-suspend-${u.username}`}
                    style={[styles.actionBtn, styles.actionDanger]}
                    onPress={() => suspend(u.id)}
                  >
                    <Text style={[styles.actionText, { color: "#fff" }]}>Suspend</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => unsuspend(u.id)}
                  >
                    <Text style={styles.actionText}>Unsuspend</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ReportsPanel({ isAdmin, toast }: { isAdmin: boolean; toast: any }) {
  const [statusF, setStatusF] = useState("open");
  const [data, setData] = useState<AdminReport[] | null>(null);
  const load = useCallback(() => {
    adminApi.reports(statusF).then(setData).catch((e) => toast.show(e.message));
  }, [statusF, toast]);
  useEffect(load, [load]);

  const resolve = async (r: AdminReport, action: string) => {
    const notes = prompt(`Notes for ${action}?`) || "";
    try {
      await adminApi.resolveReport(r.id, action, notes);
      toast.show("Resolved");
      load();
    } catch (e: any) {
      toast.show(e.message);
    }
  };

  return (
    <View>
      <Text style={styles.h1}>Reports</Text>
      <View style={{ flexDirection: "row", gap: SP.sm, marginBottom: SP.md }}>
        {["open", "resolved", "actioned_block", "all"].map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, statusF === s && styles.chipOn]}
            onPress={() => setStatusF(s)}
          >
            <Text style={[styles.chipText, statusF === s && { color: C.onInverse }]}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
      {!data ? (
        <ActivityIndicator color={C.onSurface} />
      ) : data.length === 0 ? (
        <Text style={styles.muted}>No reports.</Text>
      ) : (
        data.map((r) => (
          <View key={r.id} style={styles.reportRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>
                @{r.reporter_username} → @{r.target_username}
              </Text>
              <Text style={styles.userMeta}>
                {r.category.toUpperCase()} · {new Date(r.created_at).toLocaleString()}
              </Text>
              <Text style={styles.reportReason}>“{r.reason}”</Text>
              <Text style={styles.userMeta}>Status: {r.status}</Text>
            </View>
            {r.status === "open" && (
              <View style={{ flexDirection: "row", gap: SP.sm }}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => resolve(r, "dismiss")}
                >
                  <Text style={styles.actionText}>Dismiss</Text>
                </Pressable>
                {isAdmin && (
                  <Pressable
                    testID={`admin-report-block-${r.id}`}
                    style={[styles.actionBtn, styles.actionDanger]}
                    onPress={() => resolve(r, "block_user")}
                  >
                    <Text style={[styles.actionText, { color: "#fff" }]}>
                      Suspend reported user
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

function SecurityPanel({ canReveal, toast }: { canReveal: boolean; toast: any }) {
  const [evt, setEvt] = useState("");
  const [data, setData] = useState<SecurityEvent[] | null>(null);
  const [shown, setShown] = useState(false);
  const [reason, setReason] = useState("");
  const load = useCallback(() => {
    adminApi
      .securityEvents(evt, shown && canReveal, reason)
      .then(setData)
      .catch((e) => toast.show(e.message));
  }, [evt, shown, canReveal, reason, toast]);
  useEffect(load, [load]);

  return (
    <View>
      <Text style={styles.h1}>Security Events</Text>
      <View style={{ flexDirection: "row", gap: SP.sm, marginBottom: SP.md, flexWrap: "wrap" }}>
        {["", "login_success", "login_failed", "login_blocked", "signup", "account_deleted"].map((s) => (
          <Pressable
            key={s || "all"}
            style={[styles.chip, evt === s && styles.chipOn]}
            onPress={() => setEvt(s)}
          >
            <Text style={[styles.chipText, evt === s && { color: C.onInverse }]}>
              {s || "all"}
            </Text>
          </Pressable>
        ))}
      </View>
      {canReveal && (
        <RevealBar
          shown={shown}
          setShown={(v: boolean) => {
            setShown(v);
            setTimeout(load, 0);
          }}
          reason={reason}
          setReason={setReason}
        />
      )}
      {!data ? (
        <ActivityIndicator color={C.onSurface} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => (
            <View style={styles.evtRow}>
              <Text style={styles.evtType}>{item.event}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.userMeta}>
                  {item.email || "—"} · {item.ip || "—"}
                </Text>
                <Text style={styles.userMeta}>
                  {item.reason || ""} · {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: item.success ? "#4ade80" : "#f87171" },
                ]}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

function ScreenshotsPanel({ toast }: { toast: any }) {
  const [data, setData] = useState<any[] | null>(null);
  useEffect(() => {
    adminApi
      .screenshotEvents()
      .then(setData)
      .catch((e) => toast.show(e.message));
  }, [toast]);
  if (!data) return <ActivityIndicator color={C.onSurface} />;
  return (
    <View>
      <Text style={styles.h1}>Screenshot Events</Text>
      <Text style={styles.lead}>
        Every detected screenshot attempt across the app, reported to the
        affected user when in a chat.
      </Text>
      {data.length === 0 ? (
        <Text style={styles.muted}>No screenshot attempts recorded yet.</Text>
      ) : (
        data.map((e) => (
          <View key={e.id} style={styles.evtRow}>
            <Text style={styles.evtType}>{e.context}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.userMeta}>
                by @{e.username} {e.chat_with ? `→ chat with ${e.chat_with}` : ""}
              </Text>
              <Text style={styles.userMeta}>
                {new Date(e.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function AuditPanel({ toast }: { toast: any }) {
  const [data, setData] = useState<any[] | null>(null);
  useEffect(() => {
    adminApi.auditLog().then(setData).catch((e) => toast.show(e.message));
  }, [toast]);
  if (!data) return <ActivityIndicator color={C.onSurface} />;
  return (
    <View>
      <Text style={styles.h1}>Admin Audit Log</Text>
      <Text style={styles.lead}>
        Every staff action (PII reveal, role change, suspension) is logged
        immutably with actor, target, reason and timestamp.
      </Text>
      {data.length === 0 ? (
        <Text style={styles.muted}>No admin actions yet.</Text>
      ) : (
        data.map((a) => (
          <View key={a.id} style={styles.evtRow}>
            <Text style={styles.evtType}>{a.action}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.userMeta}>
                by @{a.actor_username} ({a.actor_role}) · target{" "}
                {a.target_kind || "—"}:{a.target_id || "—"}
              </Text>
              <Text style={styles.userMeta}>
                {a.reason ? `reason: ${a.reason} · ` : ""}
                {new Date(a.created_at).toLocaleString()}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.xl, gap: SP.md },
  gateTitle: { fontSize: 22, fontWeight: "800", color: C.onSurface },
  gateText: { fontSize: 14, color: C.muted, textAlign: "center", maxWidth: 360, lineHeight: 20 },
  cta: {
    height: 46,
    paddingHorizontal: SP.xxl,
    borderRadius: R.pill,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: C.onInverse, fontWeight: "700" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  logoSq: {
    width: 36,
    height: 36,
    borderRadius: R.md,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: C.onSurface },
  subtitle: { fontSize: 11, color: C.muted, marginTop: 2 },
  backToApp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SP.lg,
    height: 36,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  backToAppText: { fontSize: 13, fontWeight: "700", color: C.onSurface },
  body: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: 240,
    borderRightWidth: 1,
    borderRightColor: C.divider,
    paddingVertical: SP.md,
  },
  sideItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    marginHorizontal: SP.md,
    borderRadius: R.md,
  },
  sideItemActive: { backgroundColor: C.inverse },
  sideItemText: { fontSize: 14, color: C.onSurface, fontWeight: "600" },
  main: { flex: 1 },
  h1: { fontSize: 24, fontWeight: "800", color: C.onSurface, marginBottom: SP.sm },
  lead: { fontSize: 13, color: C.muted, marginBottom: SP.xl, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SP.md, marginBottom: SP.xl },
  statCard: {
    width: 200,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    padding: SP.lg,
  },
  statLabel: { fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700" },
  statValue: { fontSize: 32, fontWeight: "800", color: C.onSurface, marginTop: 4 },
  statHint: { fontSize: 11, color: C.muted, marginTop: 2 },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: SP.lg,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
    alignSelf: "flex-start",
  },
  smallBtnText: { color: C.onSurface, fontSize: 13, fontWeight: "700" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    marginBottom: SP.md,
  },
  searchInput: { flex: 1, height: 40, color: C.onSurface, fontSize: 14, outlineWidth: 0 } as any,
  revealBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    backgroundColor: C.surface2,
    padding: SP.md,
    borderRadius: R.md,
    marginBottom: SP.md,
  },
  revealLabel: { fontSize: 11, fontWeight: "700", color: C.mutedDark, textTransform: "uppercase", letterSpacing: 0.5 },
  revealInput: { flex: 1, height: 32, paddingHorizontal: SP.sm, fontSize: 12, color: C.onSurface, backgroundColor: C.surface, borderRadius: R.sm, outlineWidth: 0 } as any,
  revealBtn: { paddingHorizontal: SP.lg, height: 32, borderRadius: R.pill, backgroundColor: C.inverse, alignItems: "center", justifyContent: "center" },
  revealBtnText: { color: C.onInverse, fontWeight: "700", fontSize: 12 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    gap: SP.md,
  },
  userName: { fontSize: 14, fontWeight: "700", color: C.onSurface },
  userMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.surface3 },
  tagText: { fontSize: 10, fontWeight: "700", color: C.onSurface, textTransform: "uppercase" },
  tagRole: { backgroundColor: C.inverse },
  tagSus: { backgroundColor: "#fde2e2" },
  tagWarn: { backgroundColor: "#fff4cc" },
  actionBtn: {
    paddingHorizontal: SP.md,
    height: 32,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDanger: { backgroundColor: C.inverse, borderColor: C.inverse },
  actionText: { fontSize: 12, fontWeight: "700", color: C.onSurface },
  chip: {
    paddingHorizontal: SP.md,
    height: 30,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: C.inverse, borderColor: C.inverse },
  chipText: { fontSize: 12, fontWeight: "600", color: C.onSurface },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    gap: SP.md,
  },
  reportReason: { fontSize: 13, color: C.onSurface2, marginTop: 4, fontStyle: "italic" },
  evtRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    gap: SP.md,
  },
  evtType: {
    fontSize: 11,
    fontWeight: "700",
    color: C.onSurface,
    backgroundColor: C.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    minWidth: 110,
    textAlign: "center",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  muted: { fontSize: 13, color: C.muted, padding: SP.md },
});



/* =========================================================================
   New oversight panels: Activity, Dossier, App Version
   ========================================================================= */

function ActivityPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [events, setEvents] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "signup" | "login_success" | "login_failed" | "verification" | "status" | "report">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.activity(200);
      setEvents(r.events);
    } catch (e: any) {
      toast.show(e.message || "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const shown = (events || []).filter((e) => filter === "all" || e.kind === filter);
  const iconFor = (k: string) =>
    k === "signup" ? "person-add-outline"
    : k === "login_success" ? "log-in-outline"
    : k === "login_failed" ? "alert-circle-outline"
    : k === "verification" ? "shield-checkmark-outline"
    : k === "status" ? "image-outline"
    : k === "report" ? "flag-outline"
    : k === "account_deleted" ? "trash-outline"
    : "ellipse-outline";

  return (
    <View>
      <View style={panelStyles.headerRow}>
        <Text style={panelStyles.h1}>Live Activity Feed</Text>
        <Pressable onPress={load} style={panelStyles.refreshBtn}>
          <Ionicons name="refresh" size={16} color={C.onSurface} />
          <Text style={panelStyles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <View style={panelStyles.filterRow}>
        {(["all", "signup", "login_success", "login_failed", "verification", "status", "report"] as const).map((k) => (
          <Pressable key={k} onPress={() => setFilter(k)}
                     style={[panelStyles.filterChip, filter === k && panelStyles.filterChipActive]}>
            <Text style={[panelStyles.filterText, filter === k && { color: C.onInverse }]}>{k}</Text>
          </Pressable>
        ))}
      </View>
      {loading && !events ? (
        <ActivityIndicator color={C.onSurface} style={{ marginTop: 32 }} />
      ) : shown.length === 0 ? (
        <Text style={panelStyles.empty}>No activity matches that filter.</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {shown.map((e, i) => (
            <View key={i} style={panelStyles.eventRow}>
              <View style={panelStyles.eventIcon}>
                <Ionicons name={iconFor(e.kind) as any} size={16} color={C.onSurface} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={panelStyles.eventTitle}>
                  {e.kind} · @{e.username || "—"}
                  {e.reported_username ? ` → @${e.reported_username}` : ""}
                </Text>
                <Text style={panelStyles.eventMeta}>
                  {new Date(e.at).toLocaleString()}
                  {e.ip ? ` · ${e.ip}` : ""}
                  {e.success === false ? " · FAILED" : ""}
                  {e.country ? ` · ${e.country}` : ""}
                  {e.face_match != null ? ` · face_match=${e.face_match}` : ""}
                  {e.status_type ? ` · type=${e.status_type}` : ""}
                  {e.category ? ` · ${e.category}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DossierPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminUser[]>([]);
  const [dossier, setDossier] = useState<any | null>(null);
  const [revealReason, setRevealReason] = useState("");
  const [loading, setLoading] = useState(false);

  const doSearch = async () => {
    if (!search.trim()) return;
    try {
      const r = await adminApi.users(search.trim(), false);
      setResults(r);
    } catch (e: any) {
      toast.show(e.message);
    }
  };

  const openDossier = async (uid: string, reveal = false) => {
    if (reveal && (!revealReason || revealReason.length < 4)) {
      toast.show("Provide a reason (>=4 chars) before revealing PII");
      return;
    }
    setLoading(true);
    try {
      const d = await adminApi.dossier(uid, reveal, revealReason);
      setDossier(d);
    } catch (e: any) {
      toast.show(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (dossier) {
    const u = dossier.user;
    const st = dossier.stats;
    return (
      <View>
        <Pressable onPress={() => setDossier(null)} style={panelStyles.backLink}>
          <Ionicons name="arrow-back" size={14} color={C.onSurface} />
          <Text style={panelStyles.backLinkText}>Back to search</Text>
        </Pressable>
        <View style={panelStyles.dossierHero}>
          {dossier.profile_image_base64 ? (
            <img
              src={`data:image/jpeg;base64,${dossier.profile_image_base64}`}
              style={{ width: 80, height: 80, borderRadius: 40, objectFit: "cover" }}
              alt="profile"
            />
          ) : (
            <View style={panelStyles.avatarPh}><Text style={{ color: C.onInverse, fontSize: 28, fontWeight: "800" }}>{u.username?.slice(0, 2).toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={panelStyles.h1}>@{u.username}</Text>
            <Text style={panelStyles.eventMeta}>
              {u.email || "email hidden"} · role={u.role} · verified={String(u.verified)}
              {u.suspended ? " · SUSPENDED" : ""}
            </Text>
            <Text style={panelStyles.eventMeta}>
              joined {new Date(u.created_at).toLocaleDateString()}
              {u.last_login_at ? ` · last login ${new Date(u.last_login_at).toLocaleString()}` : ""}
            </Text>
            {u.last_login_geo && (
              <Text style={panelStyles.eventMeta}>
                from {u.last_login_geo.city || "—"}, {u.last_login_geo.country || "—"} · {u.last_login_geo.isp || "—"}
              </Text>
            )}
          </View>
        </View>

        {!dossier.revealed && (
          <View style={panelStyles.revealBox}>
            <Text style={panelStyles.revealHint}>
              Email, IPs, verification photos, and uploaded media are hidden by default.
              Reveal requires an audit-logged reason.
            </Text>
            <TextInput
              value={revealReason}
              onChangeText={setRevealReason}
              placeholder="Reason (e.g. CSAM investigation case #123)"
              placeholderTextColor={C.muted}
              style={panelStyles.revealInput}
            />
            <Pressable
              onPress={() => openDossier(u.id, true)}
              style={panelStyles.revealBtn}
              testID="dossier-reveal"
            >
              <Ionicons name="eye" size={14} color={C.onInverse} />
              <Text style={panelStyles.revealBtnText}>Reveal PII (audited)</Text>
            </Pressable>
          </View>
        )}

        <View style={panelStyles.statsGrid}>
          <Stat label="Friends" value={st.friends} />
          <Stat label="Sent" value={st.messages_sent} />
          <Stat label="Received" value={st.messages_received} />
          <Stat label="Statuses" value={st.statuses_count} />
          <Stat label="Verif attempts" value={st.verification_attempts} />
          <Stat label="Reports against" value={st.reports_against_count} />
        </View>

        <Text style={panelStyles.h2}>Verification documents ({dossier.verifications.length})</Text>
        {dossier.verifications.length === 0 && <Text style={panelStyles.empty}>No verification submitted.</Text>}
        <View style={panelStyles.verifGrid}>
          {dossier.verifications.map((v: any) => (
            <View key={v.id || v.created_at} style={panelStyles.verifCard}>
              <Text style={panelStyles.verifTitle}>
                {v.country || "?"} · {v.id_type || "?"} · {v.verified ? "PASS" : "FAIL"}
              </Text>
              <Text style={panelStyles.verifMeta}>
                {new Date(v.created_at).toLocaleString()}
                {v.face_match != null ? ` · match=${v.face_match}` : ""}
              </Text>
              {dossier.revealed && v.id_image_base64 && (
                <View style={panelStyles.verifImgs}>
                  <img src={`data:image/jpeg;base64,${v.id_image_base64}`} style={{ width: "100%", borderRadius: 6 }} alt="ID" />
                  <Text style={panelStyles.verifCaption}>ID document</Text>
                </View>
              )}
              {dossier.revealed && v.selfie_base64 && (
                <View style={panelStyles.verifImgs}>
                  <img src={`data:image/jpeg;base64,${v.selfie_base64}`} style={{ width: "100%", borderRadius: 6 }} alt="selfie" />
                  <Text style={panelStyles.verifCaption}>Selfie</Text>
                </View>
              )}
              {v.ai_reason && <Text style={panelStyles.verifMeta}>AI: {v.ai_reason}</Text>}
            </View>
          ))}
        </View>

        <Text style={panelStyles.h2}>Recent uploads ({dossier.media_messages.length})</Text>
        {dossier.media_messages.length === 0 ? (
          <Text style={panelStyles.empty}>No uploads.</Text>
        ) : (
          <View style={panelStyles.mediaGrid}>
            {dossier.media_messages.map((m: any) => (
              <View key={m.id} style={panelStyles.mediaCard}>
                <Text style={panelStyles.verifTitle}>{m.type.toUpperCase()}</Text>
                {dossier.revealed && m.image_base64 && (
                  <img src={`data:image/jpeg;base64,${m.image_base64}`} style={{ width: "100%", borderRadius: 6 }} alt="upload" />
                )}
                {m.document_name && <Text style={panelStyles.verifMeta}>{m.document_name} ({m.document_mime})</Text>}
                <Text style={panelStyles.verifMeta}>{new Date(m.created_at).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={panelStyles.h2}>Recent security events ({dossier.security_events.length})</Text>
        {dossier.security_events.slice(0, 20).map((e: any, i: number) => (
          <View key={i} style={panelStyles.eventRow}>
            <View style={panelStyles.eventIcon}>
              <Ionicons name="shield-outline" size={14} color={C.onSurface} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={panelStyles.eventTitle}>{e.event} {e.success === false ? "FAILED" : ""}</Text>
              <Text style={panelStyles.eventMeta}>
                {new Date(e.created_at).toLocaleString()} · {e.ip || "—"} · {e.user_agent?.slice(0, 60) || "—"}
              </Text>
            </View>
          </View>
        ))}

        <Text style={panelStyles.h2}>Reports against ({dossier.reports_against.length})</Text>
        {dossier.reports_against.slice(0, 10).map((r: any) => (
          <View key={r.id} style={panelStyles.eventRow}>
            <View style={panelStyles.eventIcon}>
              <Ionicons name="flag-outline" size={14} color={C.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={panelStyles.eventTitle}>{r.category} · {r.status}</Text>
              <Text style={panelStyles.eventMeta}>{r.reason}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View>
      <Text style={panelStyles.h1}>User Dossier</Text>
      <Text style={panelStyles.help}>
        Look up any user to see their full account, IP history, location, verification documents,
        uploaded photos/videos/documents, and audit trail. Sensitive fields require an audited reason.
      </Text>
      <View style={panelStyles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by username..."
          placeholderTextColor={C.muted}
          onSubmitEditing={doSearch}
          style={panelStyles.searchInput}
          testID="dossier-search"
        />
        <Pressable onPress={doSearch} style={panelStyles.searchBtn}>
          <Text style={panelStyles.searchBtnText}>Search</Text>
        </Pressable>
      </View>
      {loading && <ActivityIndicator color={C.onSurface} style={{ marginTop: 24 }} />}
      {results.map((u) => (
        <Pressable key={u.id} style={panelStyles.userCard} onPress={() => openDossier(u.id)}>
          <View style={{ flex: 1 }}>
            <Text style={panelStyles.eventTitle}>@{u.username}</Text>
            <Text style={panelStyles.eventMeta}>
              role={u.role} · verified={String(u.verified)}
              {u.last_login_geo ? ` · ${u.last_login_geo.city || "—"}, ${u.last_login_geo.country || "—"}` : ""}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </Pressable>
      ))}
    </View>
  );
}

function AppVersionPanel({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [doc, setDoc] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    current_version: "",
    min_supported_version: "",
    force_update: false,
    message: "",
    release_notes: "",
    ios_url: "",
    android_url: "",
  });

  useEffect(() => {
    adminApi.getAppVersion().then((d) => {
      setDoc(d);
      setForm({
        current_version: d.current_version || "1.0.0",
        min_supported_version: d.min_supported_version || "1.0.0",
        force_update: !!d.force_update,
        message: d.message || "",
        release_notes: d.release_notes || "",
        ios_url: d.ios_url || "",
        android_url: d.android_url || "",
      });
    }).catch((e) => toast.show(e.message));
  }, [toast]);

  const save = async () => {
    setBusy(true);
    try {
      const d = await adminApi.setAppVersion(form);
      setDoc(d);
      toast.show(`✅ Version policy updated. Active clients will see the prompt on their next launch.`);
    } catch (e: any) {
      toast.show(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={panelStyles.h1}>App Version & Update Push</Text>
      <Text style={panelStyles.help}>
        Set the version policy that every installed Swag Chat client checks on launch.
        Mark <Text style={{ fontWeight: "800" }}>Force update</Text> to block usage of older versions
        until they update. Optional release notes are shown inside the update dialog.
      </Text>

      {doc && (
        <View style={panelStyles.appVerCard}>
          <Text style={panelStyles.eventMeta}>
            Last updated {doc.updated_at ? new Date(doc.updated_at).toLocaleString() : "—"} by {doc.updated_by || "—"}
          </Text>
        </View>
      )}

      <View style={panelStyles.formGrid}>
        <Field label="Current version (latest released)" value={form.current_version}
               onChange={(v) => setForm({ ...form, current_version: v })} placeholder="1.2.0" />
        <Field label="Minimum supported version" value={form.min_supported_version}
               onChange={(v) => setForm({ ...form, min_supported_version: v })} placeholder="1.0.0" />
        <Field label="iOS store URL" value={form.ios_url}
               onChange={(v) => setForm({ ...form, ios_url: v })} placeholder="https://apps.apple.com/..." />
        <Field label="Android store URL" value={form.android_url}
               onChange={(v) => setForm({ ...form, android_url: v })} placeholder="https://play.google.com/..." />
      </View>
      <Field label="Update prompt message" value={form.message}
             onChange={(v) => setForm({ ...form, message: v })}
             placeholder="A new Swag Chat is here — update to keep your messages flowing."
             multiline />
      <Field label="Release notes (shown inside update dialog)" value={form.release_notes}
             onChange={(v) => setForm({ ...form, release_notes: v })}
             placeholder="• Voice messages now have waveforms\n• Faster chat sync"
             multiline />
      <Pressable
        onPress={() => setForm({ ...form, force_update: !form.force_update })}
        style={panelStyles.toggleRow}
      >
        <View style={[panelStyles.toggleBox, form.force_update && panelStyles.toggleBoxOn]}>
          {form.force_update && <Ionicons name="checkmark" size={14} color={C.onInverse} />}
        </View>
        <Text style={panelStyles.toggleLabel}>Force update — block usage of older versions</Text>
      </Pressable>
      <Pressable
        onPress={save}
        disabled={busy}
        style={[panelStyles.saveBtn, busy && { opacity: 0.6 }]}
        testID="appversion-save"
      >
        {busy ? <ActivityIndicator color={C.onInverse} /> : <Text style={panelStyles.saveBtnText}>Publish policy → all clients</Text>}
      </Pressable>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={panelStyles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        multiline={!!multiline}
        style={[panelStyles.field, multiline && { minHeight: 64, textAlignVertical: "top" }]}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={panelStyles.statTile}>
      <Text style={panelStyles.statValue}>{value ?? 0}</Text>
      <Text style={panelStyles.statLabel}>{label}</Text>
    </View>
  );
}

const panelStyles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "800", color: C.onSurface, marginBottom: 8 },
  h2: { fontSize: 14, fontWeight: "800", color: C.onSurface, marginTop: 24, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.6 },
  help: { fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 19 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderWidth: 1, borderColor: C.border, borderRadius: R.sm },
  refreshText: { fontSize: 12, color: C.onSurface, fontWeight: "600" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.inverse, borderColor: C.inverse },
  filterText: { fontSize: 11, fontWeight: "700", color: C.onSurface, letterSpacing: 0.4 },
  empty: { color: C.muted, fontSize: 13, padding: 16, textAlign: "center" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: R.md, backgroundColor: C.surface },
  eventIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: "center", justifyContent: "center" },
  eventTitle: { fontSize: 13, fontWeight: "700", color: C.onSurface },
  eventMeta: { fontSize: 11, color: C.muted, marginTop: 2, fontVariant: ["tabular-nums"] },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, color: C.onSurface, backgroundColor: C.surface },
  searchBtn: { backgroundColor: C.inverse, borderRadius: R.md, paddingHorizontal: 16, justifyContent: "center" },
  searchBtnText: { color: C.onInverse, fontWeight: "700" },
  userCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: R.md, marginBottom: 6, backgroundColor: C.surface },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  backLinkText: { fontSize: 13, color: C.onSurface, fontWeight: "600" },
  dossierHero: { flexDirection: "row", gap: 16, padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: R.md, alignItems: "center", backgroundColor: C.surface },
  avatarPh: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.inverse, alignItems: "center", justifyContent: "center" },
  revealBox: { borderWidth: 1, borderColor: C.error, borderRadius: R.md, padding: 12, marginTop: 16, gap: 8, backgroundColor: "#FEF2F2" },
  revealHint: { fontSize: 12, color: C.mutedDark, lineHeight: 17 },
  revealInput: { borderWidth: 1, borderColor: C.border, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.onSurface, backgroundColor: C.surface },
  revealBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.error, paddingVertical: 10, borderRadius: R.sm },
  revealBtnText: { color: C.onInverse, fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  statTile: { flexBasis: "31%", borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 12, alignItems: "center", backgroundColor: C.surface },
  statValue: { fontSize: 20, fontWeight: "800", color: C.onSurface },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.6 },
  verifGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  verifCard: { flexBasis: "48%", borderWidth: 1, borderColor: C.border, borderRadius: R.md, padding: 12, backgroundColor: C.surface, gap: 6 },
  verifTitle: { fontSize: 12, fontWeight: "800", color: C.onSurface, letterSpacing: 0.4 },
  verifMeta: { fontSize: 11, color: C.muted },
  verifImgs: { marginTop: 6 },
  verifCaption: { fontSize: 10, color: C.muted, marginTop: 2, textAlign: "center" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mediaCard: { flexBasis: "23%", borderWidth: 1, borderColor: C.border, borderRadius: R.sm, padding: 8, backgroundColor: C.surface, gap: 4 },
  appVerCard: { padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: R.md, marginBottom: 16, backgroundColor: C.surface2 },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 0 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: C.onSurface, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  field: { borderWidth: 1, borderColor: C.border, borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 8, color: C.onSurface, backgroundColor: C.surface },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, marginTop: 4 },
  toggleBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  toggleBoxOn: { backgroundColor: C.inverse, borderColor: C.inverse },
  toggleLabel: { fontSize: 13, color: C.onSurface, fontWeight: "600" },
  saveBtn: { backgroundColor: C.inverse, paddingVertical: 14, borderRadius: R.md, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: C.onInverse, fontWeight: "800", letterSpacing: 0.4 },
});

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { Toast, useToast } from "@/src/components/Toast";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";

type Req = {
  id: string;
  from_id: string;
  from_username: string;
  to_id: string;
  to_username: string;
  status: string;
};

export default function RequestsScreen() {
  const insets = useSafeAreaInsets();
  const { subscribe } = useSocket();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<any>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ incoming: Req[]; outgoing: Req[] }>("/requests");
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "request:new" || msg.type === "request:accepted") load();
      }),
    [subscribe, load],
  );

  const search = async () => {
    const username = query.trim().toLowerCase().replace(/^@/, "");
    if (!username) return;
    setSearching(true);
    setFound(null);
    setSearchError(null);
    try {
      const r = await api(`/users/search?username=${encodeURIComponent(username)}`);
      setFound(r);
    } catch (e: any) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const sendRequest = async () => {
    if (!found) return;
    setBusyId("send");
    try {
      await api("/requests", { method: "POST", body: { to_username: found.username } });
      toast.show(`Request sent to @${found.username}`);
      setFound({ ...found, pending_request: true, pending_direction: "outgoing" });
      load();
    } catch (e: any) {
      toast.show(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const respond = async (req: Req, action: "accept" | "reject") => {
    setBusyId(req.id);
    try {
      await api(`/requests/${req.id}/respond`, { method: "POST", body: { action } });
      toast.show(action === "accept" ? `You're now connected with @${req.from_username}` : "Request rejected");
      load();
    } catch (e: any) {
      toast.show(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container} testID="requests-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.md }]}>
        <Text style={styles.title}>Requests</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + SP.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.onSurface} />
        }
      >
        <Text style={styles.sectionLabel}>Connect with a username</Text>
        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Text style={styles.atSign}>@</Text>
            <TextInput
              testID="request-username-input"
              style={styles.searchInput}
              placeholder="exact_username"
              placeholderTextColor={C.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={search}
              returnKeyType="search"
            />
          </View>
          <Pressable
            testID="request-search-button"
            style={styles.searchBtn}
            onPress={search}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator color={C.onInverse} size="small" />
            ) : (
              <Ionicons name="search" size={20} color={C.onInverse} />
            )}
          </Pressable>
        </View>

        {searchError && (
          <Text style={styles.searchError} testID="request-search-error">
            {searchError}
          </Text>
        )}

        {found && (
          <View style={styles.foundCard} testID="request-found-card">
            <Avatar username={found.username} size={44} />
            <View style={{ flex: 1, marginLeft: SP.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.foundName}>@{found.username}</Text>
                {found.verified && (
                  <Ionicons name="shield-checkmark" size={14} color={C.onSurface} />
                )}
              </View>
              <Text style={styles.foundSub}>
                {found.is_friend
                  ? "Already connected"
                  : found.pending_request
                    ? found.pending_direction === "outgoing"
                      ? "Request pending"
                      : "They sent you a request"
                    : "Not connected yet"}
              </Text>
            </View>
            {!found.is_friend && !found.pending_request && (
              <Pressable
                testID="request-send-button"
                style={styles.sendBtn}
                onPress={sendRequest}
                disabled={busyId === "send"}
              >
                {busyId === "send" ? (
                  <ActivityIndicator color={C.onInverse} size="small" />
                ) : (
                  <Text style={styles.sendBtnText}>Send Request</Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>Incoming</Text>
        {incoming.length === 0 ? (
          <Text style={styles.emptyText} testID="requests-incoming-empty">
            No pending requests.
          </Text>
        ) : (
          incoming.map((req) => (
            <View key={req.id} style={styles.reqRow} testID={`request-incoming-${req.from_username}`}>
              <Avatar username={req.from_username} size={44} />
              <Text style={styles.reqName}>@{req.from_username}</Text>
              <Pressable
                testID={`request-accept-${req.from_username}`}
                style={styles.acceptBtn}
                disabled={busyId === req.id}
                onPress={() => respond(req, "accept")}
              >
                <Text style={styles.acceptText}>Accept</Text>
              </Pressable>
              <Pressable
                testID={`request-reject-${req.from_username}`}
                style={styles.rejectBtn}
                disabled={busyId === req.id}
                onPress={() => respond(req, "reject")}
              >
                <Text style={styles.rejectText}>Reject</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.sectionLabel}>Sent</Text>
        {outgoing.length === 0 ? (
          <Text style={styles.emptyText}>No sent requests.</Text>
        ) : (
          outgoing.map((req) => (
            <View key={req.id} style={styles.reqRow} testID={`request-outgoing-${req.to_username}`}>
              <Avatar username={req.to_username} size={44} />
              <Text style={styles.reqName}>@{req.to_username}</Text>
              <View style={styles.pendingPill}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    paddingHorizontal: SP.xl,
    paddingBottom: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.surface,
  },
  title: { fontSize: 28, fontWeight: "800", color: C.onSurface, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: C.mutedDark,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: SP.xl,
    marginTop: SP.xl,
    marginBottom: SP.md,
  },
  searchRow: { flexDirection: "row", paddingHorizontal: SP.xl, gap: SP.md },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    height: 48,
    paddingHorizontal: SP.lg,
  },
  atSign: { fontSize: 16, color: C.muted, marginRight: 2 },
  searchInput: { flex: 1, fontSize: 16, color: C.onSurface, height: "100%" },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: R.md,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
  },
  searchError: {
    color: C.error,
    fontSize: 13,
    paddingHorizontal: SP.xl,
    marginTop: SP.md,
  },
  foundCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SP.xl,
    marginTop: SP.lg,
    padding: SP.lg,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  foundName: { fontSize: 16, fontWeight: "700", color: C.onSurface },
  foundSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  sendBtn: {
    backgroundColor: C.inverse,
    borderRadius: R.pill,
    paddingHorizontal: SP.lg,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { color: C.onInverse, fontSize: 13, fontWeight: "700" },
  emptyText: { fontSize: 14, color: C.muted, paddingHorizontal: SP.xl },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    gap: SP.md,
  },
  reqName: { flex: 1, fontSize: 15, fontWeight: "600", color: C.onSurface },
  acceptBtn: {
    backgroundColor: C.inverse,
    borderRadius: R.pill,
    paddingHorizontal: SP.lg,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: { color: C.onInverse, fontSize: 13, fontWeight: "700" },
  rejectBtn: {
    backgroundColor: C.surface3,
    borderRadius: R.pill,
    paddingHorizontal: SP.lg,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectText: { color: C.onSurface, fontSize: 13, fontWeight: "600" },
  pendingPill: {
    backgroundColor: C.surface2,
    borderRadius: R.pill,
    paddingHorizontal: SP.lg,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingText: { color: C.mutedDark, fontSize: 12, fontWeight: "600" },
});

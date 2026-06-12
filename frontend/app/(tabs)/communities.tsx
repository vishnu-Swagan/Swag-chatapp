import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";

type Group = {
  id: string;
  type: "group" | "community";
  name: string;
  description: string;
  avatar_base64?: string | null;
  member_count: number;
  is_public: boolean;
  my_role: string;
  last_message: any;
  muted: boolean;
};

function formatTime(iso?: string) {
  if (!iso) return "";
  const d = dayjs(iso);
  return d.isSame(dayjs(), "day") ? d.format("HH:mm") : d.format("DD/MM");
}

export default function CommunitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subscribe } = useSocket();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await api<Group[]>("/groups"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(
    () =>
      subscribe((msg) => {
        if (
          [
            "group:message",
            "group:updated",
            "group:member_joined",
            "group:member_left",
            "group:deleted",
            "group:removed",
          ].includes(msg.type)
        ) {
          load();
        }
      }),
    [subscribe, load],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item, index }: { item: Group; index: number }) => {
    const last = item.last_message;
    const preview = !last
      ? item.description || "No messages yet"
      : last.type === "text"
        ? `${last.sender_username ? last.sender_username + ": " : ""}${last.text}`
        : `${last.sender_username ? last.sender_username + ": " : ""}${last.type}`;
    return (
      <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 35)}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surface2 }]}
          onPress={() => router.push(`/group/${item.id}?name=${encodeURIComponent(item.name)}`)}
        >
          <Avatar username={item.name} size={52} imageBase64={item.avatar_base64} />
          <View style={styles.rowBody}>
            <View style={styles.rowTop}>
              <View style={styles.nameWrap}>
                {item.type === "community" && (
                  <Ionicons name="people-circle" size={16} color={C.brand} style={{ marginRight: 4 }} />
                )}
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              {last && <Text style={styles.time}>{formatTime(last.created_at)}</Text>}
            </View>
            <View style={styles.rowBottom}>
              <Text style={styles.preview} numberOfLines={1}>
                {preview}
              </Text>
              <Text style={styles.memberCount}>{item.member_count} members</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SP.md }]}>
        <Text style={styles.title}>Communities</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconBtn}
            onPress={() => router.push("/group/discover")}
          >
            <Ionicons name="compass-outline" size={22} color={C.onSurface} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, styles.primaryBtn]}
            onPress={() => router.push("/group/create")}
          >
            <Ionicons name="add" size={24} color={C.onInverse} />
          </Pressable>
        </View>
      </View>
      <FlatList
        data={groups || []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.onSurface} />
        }
        contentContainerStyle={groups?.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          groups === null ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="people" size={36} color={C.brand} />
              </View>
              <Text style={styles.emptyTitle}>No communities yet</Text>
              <Text style={styles.emptySub}>
                Create a community or group, or discover public ones to join.
              </Text>
              <Pressable style={styles.emptyCta} onPress={() => router.push("/group/create")}>
                <Text style={styles.emptyCtaText}>Create your first community</Text>
              </Pressable>
            </View>
          )
        }
      />
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  title: { fontSize: 28, fontWeight: "800", color: C.onSurface, letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
  },
  primaryBtn: { backgroundColor: C.inverse },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
  },
  rowBody: { flex: 1, marginLeft: SP.md },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nameWrap: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: SP.sm },
  name: { fontSize: 16, fontWeight: "700", color: C.onSurface, flex: 1 },
  time: { fontSize: 12, color: C.muted },
  rowBottom: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  preview: { flex: 1, fontSize: 14, color: C.muted, marginRight: SP.sm },
  memberCount: { fontSize: 11, color: C.brand, fontWeight: "600" },
  emptyContainer: { flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.xxl, marginTop: SP.xxxl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: C.onSurface, marginBottom: SP.sm },
  emptySub: { fontSize: 14, color: C.muted, textAlign: "center", lineHeight: 20, marginBottom: SP.xl },
  emptyCta: {
    backgroundColor: C.inverse,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    borderRadius: R.pill,
  },
  emptyCtaText: { color: C.onInverse, fontWeight: "700", fontSize: 15 },
});

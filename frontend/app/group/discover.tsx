import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { C, R, SP } from "@/src/theme";

type DiscoverGroup = {
  id: string;
  type: string;
  name: string;
  description: string;
  avatar_base64?: string | null;
  member_count: number;
  joined: boolean;
};

export default function DiscoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<DiscoverGroup[] | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const load = async () => {
    try {
      setGroups(await api<DiscoverGroup[]>("/groups/discover"));
    } catch {
      setGroups([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const join = async (g: DiscoverGroup) => {
    setJoining(g.id);
    try {
      await api(`/groups/${g.id}/join`, { method: "POST", body: {} });
      router.push(`/group/${g.id}?name=${encodeURIComponent(g.name)}`);
    } catch {}
    setJoining(null);
  };

  const renderItem = ({ item }: { item: DiscoverGroup }) => (
    <View style={styles.card}>
      <Avatar username={item.name} size={48} imageBase64={item.avatar_base64} />
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.desc} numberOfLines={2}>
          {item.description || `${item.member_count} members`}
        </Text>
        <Text style={styles.members}>{item.member_count} members</Text>
      </View>
      {item.joined ? (
        <Pressable
          style={styles.openBtn}
          onPress={() => router.push(`/group/${item.id}?name=${encodeURIComponent(item.name)}`)}
        >
          <Text style={styles.openText}>Open</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.joinBtn} onPress={() => join(item)} disabled={joining === item.id}>
          {joining === item.id ? (
            <ActivityIndicator size="small" color={C.onInverse} />
          ) : (
            <Text style={styles.joinText}>Join</Text>
          )}
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Discover</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={groups || []}
        keyExtractor={(g) => g.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: SP.lg }}
        ListEmptyComponent={
          groups === null ? (
            <ActivityIndicator color={C.onSurface} style={{ marginTop: SP.xxxl }} />
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="compass-outline" size={40} color={C.muted} />
              <Text style={styles.emptyText}>No public communities yet. Be the first to create one!</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  backBtn: { padding: SP.xs },
  headerTitle: { fontSize: 18, fontWeight: "700", color: C.onSurface },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface2,
    borderRadius: R.lg,
    padding: SP.md,
    marginBottom: SP.md,
    gap: SP.md,
  },
  cardBody: { flex: 1 },
  name: { fontSize: 16, fontWeight: "700", color: C.onSurface },
  desc: { fontSize: 13, color: C.muted, marginTop: 2 },
  members: { fontSize: 11, color: C.brand, fontWeight: "600", marginTop: 4 },
  joinBtn: {
    backgroundColor: C.inverse,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    minWidth: 64,
    alignItems: "center",
  },
  joinText: { color: C.onInverse, fontWeight: "700", fontSize: 14 },
  openBtn: {
    backgroundColor: C.surface3,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderRadius: R.pill,
    minWidth: 64,
    alignItems: "center",
  },
  openText: { color: C.onSurface, fontWeight: "700", fontSize: 14 },
  emptyWrap: { alignItems: "center", justifyContent: "center", marginTop: SP.xxxl, gap: SP.md, padding: SP.xl },
  emptyText: { color: C.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
});

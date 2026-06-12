import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Avatar from "@/src/components/Avatar";
import { Toast, useToast } from "@/src/components/Toast";
import { C, R, SP } from "@/src/theme";
import { safety, BlockedUser } from "@/src/utils/safety";

export default function BlockedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [data, setData] = useState<BlockedUser[] | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await safety.listBlocked());
    } catch (e: any) {
      toast.show(e.message || "Could not load");
      setData([]);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const unblock = async (u: BlockedUser) => {
    try {
      await safety.unblock(u.id);
      setData((p) => (p || []).filter((x) => x.id !== u.id));
      toast.show("✅ Unblocked @" + u.username);
    } catch (e: any) {
      toast.show(e.message || "Could not unblock");
    }
  };

  return (
    <View style={styles.container} testID="blocked-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Blocked Users</Text>
      </View>
      {data === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.onSurface} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={42} color={C.muted} />
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptyBody}>
            People you block won&apos;t be able to message or call you. They will
            appear here so you can unblock them anytime.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar username={item.username} size={44} />
              <View style={{ flex: 1, marginLeft: SP.md }}>
                <Text style={styles.name}>@{item.username}</Text>
              </View>
              <Pressable
                testID={`unblock-${item.username}`}
                onPress={() => unblock(item)}
                style={styles.unblockBtn}
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </Pressable>
            </View>
          )}
        />
      )}
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.sm,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.surface,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: C.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.xl, gap: SP.md },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: C.onSurface },
  emptyBody: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
  },
  name: { fontSize: 15, fontWeight: "600", color: C.onSurface },
  unblockBtn: {
    paddingHorizontal: SP.lg,
    height: 36,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  unblockText: { color: C.onSurface, fontWeight: "700", fontSize: 13 },
});

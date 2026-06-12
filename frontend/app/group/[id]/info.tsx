import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { C, R, SP } from "@/src/theme";

type Member = {
  user_id: string;
  username: string;
  verified: boolean;
  profile_image_base64?: string | null;
  role: string;
  online: boolean;
};

type GroupDetail = {
  id: string;
  type: string;
  name: string;
  description: string;
  member_count: number;
  is_public: boolean;
  join_code: string;
  my_role: string;
};

export default function GroupInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([
        api<GroupDetail>(`/groups/${id}`),
        api<Member[]>(`/groups/${id}/members`),
      ]);
      setGroup(g);
      setMembers(m);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = group?.my_role === "owner" || group?.my_role === "admin";

  const invite = async () => {
    if (!group) return;
    await Share.share({
      message: `Join "${group.name}" on Swag-Chat! Invite code: ${group.join_code}`,
    });
  };

  const leave = () => {
    Alert.alert("Leave group?", "You will no longer receive messages from this group.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/groups/${id}/leave`, { method: "POST" });
            router.replace("/(tabs)/communities");
          } catch (e: any) {
            Alert.alert("Could not leave", e.message);
          }
        },
      },
    ]);
  };

  const removeMember = (m: Member) => {
    Alert.alert(`Remove ${m.username}?`, "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/groups/${id}/members/${m.user_id}`, { method: "DELETE" });
            load();
          } catch {}
        },
      },
    ]);
  };

  if (loading || !group) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={C.onSurface} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Info</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.user_id}
        ListHeaderComponent={
          <View style={styles.topSection}>
            <Avatar username={group.name} size={96} />
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.groupMeta}>
              {group.type === "community" ? "Community" : "Group"} · {group.member_count} members
            </Text>
            {group.description ? <Text style={styles.groupDesc}>{group.description}</Text> : null}

            <Pressable style={styles.inviteBtn} onPress={invite}>
              <Ionicons name="share-social-outline" size={18} color={C.onInverse} />
              <Text style={styles.inviteText}>Invite people</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>{group.member_count} members</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <Avatar username={item.username} size={42} imageBase64={item.profile_image_base64} />
            <View style={styles.memberBody}>
              <View style={styles.memberNameRow}>
                <Text style={styles.memberName}>@{item.username}</Text>
                {item.verified && <Ionicons name="checkmark-circle" size={14} color={C.brand} />}
              </View>
              {item.role !== "member" && <Text style={styles.roleTag}>{item.role}</Text>}
            </View>
            {isAdmin && item.role !== "owner" && (
              <Pressable onPress={() => removeMember(item)} style={styles.kickBtn}>
                <Ionicons name="remove-circle-outline" size={22} color={C.error} />
              </Pressable>
            )}
          </View>
        )}
        ListFooterComponent={
          <Pressable style={styles.leaveBtn} onPress={leave}>
            <Ionicons name="exit-outline" size={20} color={C.error} />
            <Text style={styles.leaveText}>Leave group</Text>
          </Pressable>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + SP.xl }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  center: { alignItems: "center", justifyContent: "center" },
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
  topSection: { alignItems: "center", paddingVertical: SP.xl, paddingHorizontal: SP.xl },
  groupName: { fontSize: 22, fontWeight: "800", color: C.onSurface, marginTop: SP.md },
  groupMeta: { fontSize: 13, color: C.brand, fontWeight: "600", marginTop: 4 },
  groupDesc: { fontSize: 14, color: C.muted, textAlign: "center", marginTop: SP.md, lineHeight: 20 },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.inverse,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
    borderRadius: R.pill,
    marginTop: SP.lg,
  },
  inviteText: { color: C.onInverse, fontWeight: "700", fontSize: 15 },
  sectionTitle: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "700",
    color: C.mutedDark,
    marginTop: SP.xl,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.xl,
    paddingVertical: SP.sm,
    gap: SP.md,
  },
  memberBody: { flex: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  memberName: { fontSize: 15, fontWeight: "600", color: C.onSurface },
  roleTag: { fontSize: 11, color: C.brand, fontWeight: "700", textTransform: "capitalize", marginTop: 2 },
  kickBtn: { padding: SP.xs },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: SP.xl,
    paddingVertical: SP.md,
  },
  leaveText: { color: C.error, fontWeight: "700", fontSize: 15 },
});

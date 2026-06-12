import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import StatusStrip, { StatusOwner } from "@/src/components/StatusStrip";
import { useSocket } from "@/src/context/SocketContext";
import { C, SP } from "@/src/theme";

type Chat = {
  friend: { id: string; username: string; verified: boolean; profile_image_base64?: string | null };
  last_message: any;
  unread: number;
  since: string;
  online: boolean;
};

function formatTime(iso: string) {
  const d = dayjs(iso);
  return d.isSame(dayjs(), "day") ? d.format("HH:mm") : d.format("DD/MM");
}

export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subscribe } = useSocket();
  const { t } = useTranslation();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [statusFeed, setStatusFeed] = useState<StatusOwner[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setChats(await api<Chat[]>("/chats"));
    } catch {}
    try {
      const r = await api<{ items: StatusOwner[] }>("/status/feed");
      setStatusFeed(r.items || []);
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
          ["message:new", "messages:read", "request:accepted"].includes(msg.type)
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

  const renderItem = ({ item, index }: { item: Chat; index: number }) => {
    const last = item.last_message;
    const preview = !last
      ? "Say hi 👋"
      : last.type === "image"
        ? `📷 ${t("chats.photo")}`
        : last.text;
    return (
      <Animated.View entering={FadeInDown.duration(280).delay(Math.min(index, 8) * 35)}>
      <Pressable
        testID={`chat-row-${item.friend.username}`}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surface2 }]}
        onPress={() =>
          router.push(`/chat/${item.friend.id}?username=${item.friend.username}`)
        }
      >
        <View>
          <Avatar username={item.friend.username} size={52} imageBase64={item.friend.profile_image_base64} />
          {item.online && <View style={styles.onlineDot} />}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>
              @{item.friend.username}
            </Text>
            {last && <Text style={styles.time}>{formatTime(last.created_at)}</Text>}
          </View>
          <View style={styles.rowBottom}>
            <Text
              style={[styles.preview, item.unread > 0 && styles.previewUnread]}
              numberOfLines={1}
            >
              {preview}
            </Text>
            {item.unread > 0 && (
              <View style={styles.badge} testID={`chat-unread-badge-${item.friend.username}`}>
                <Text style={styles.badgeText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container} testID="chats-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.md }]}>
        <Text style={styles.title}>{t("chats.title")}</Text>
      </View>
      <FlatList
        data={chats || []}
        keyExtractor={(item) => item.friend.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <StatusStrip
            items={statusFeed}
            myItem={statusFeed.find((it) => it.is_self) || null}
            onAddStatus={() => router.push("/status/compose")}
            onOpen={(it) =>
              router.push({ pathname: "/status/viewer", params: { owner: JSON.stringify(it) } })
            }
          />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.onSurface} />
        }
        contentContainerStyle={chats?.length === 0 && styles.emptyContainer}
        ListEmptyComponent={
          chats === null ? (
            <View style={styles.emptyWrap}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.skeletonRow}>
                  <View style={styles.skeletonCircle} />
                  <View style={styles.skeletonLines}>
                    <View style={styles.skeletonLine} />
                    <View style={[styles.skeletonLine, { width: "55%" }]} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyWrap} testID="chats-empty-state">
              <View style={styles.emptyIcon}>
                <Ionicons name="lock-closed" size={36} color={C.onSurface} />
              </View>
              <Text style={styles.emptyTitle}>{t("chats.title")}</Text>
              <Text style={styles.emptySub}>
                {t("chats.empty")}
              </Text>
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
  },
  title: { fontSize: 28, fontWeight: "800", color: C.onSurface, letterSpacing: -0.5 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.xl,
    paddingVertical: SP.md,
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: C.inverse,
    borderWidth: 2,
    borderColor: C.surface,
  },
  rowBody: { flex: 1, marginLeft: SP.md },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "700", color: C.onSurface, flex: 1, marginRight: SP.sm },
  time: { fontSize: 12, color: C.muted },
  rowBottom: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  preview: { flex: 1, fontSize: 14, color: C.muted, marginRight: SP.sm },
  previewUnread: { color: C.onSurface, fontWeight: "600" },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: C.onInverse, fontSize: 11, fontWeight: "700" },
  emptyContainer: { flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.xxl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.surface3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: C.onSurface },
  emptySub: { fontSize: 14, color: C.muted, textAlign: "center", marginTop: SP.sm, lineHeight: 20 },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: SP.lg,
  },
  skeletonCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.surface2 },
  skeletonLines: { flex: 1, marginLeft: SP.md, gap: SP.sm },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: C.surface2, width: "80%" },
});

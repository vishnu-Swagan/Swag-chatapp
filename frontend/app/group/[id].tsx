import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { useAuth } from "@/src/context/AuthContext";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";

type GroupMsg = {
  id: string;
  sender_id: string;
  sender_username?: string;
  sender_image?: string | null;
  type: string;
  text?: string;
  created_at: string;
};

export default function GroupChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { subscribe } = useSocket();
  const { user } = useAuth();
  const myId = user?.id;
  const [messages, setMessages] = useState<GroupMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const msgs = await api<GroupMsg[]>(`/groups/${id}/messages`);
      setMessages(msgs);
      api(`/groups/${id}/read`, { method: "POST" }).catch(() => {});
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === "group:message" && msg.message?.group_id === id) {
          setMessages((prev) => [...prev, msg.message]);
        }
      }),
    [subscribe, id],
  );

  useEffect(() => {
    if (messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      const msg = await api<GroupMsg>(`/groups/${id}/messages`, {
        method: "POST",
        body: { type: "text", text: body },
      });
      setMessages((prev) => [...prev, msg]);
    } catch {
      setText(body);
    }
    setSending(false);
  };

  const renderItem = ({ item }: { item: GroupMsg }) => {
    const mine = item.sender_id === myId;
    return (
      <View style={[styles.msgRow, mine && styles.msgRowMine]}>
        {!mine && (
          <Avatar username={item.sender_username || "?"} size={28} imageBase64={item.sender_image} />
        )}
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {!mine && <Text style={styles.senderName}>{item.sender_username}</Text>}
          <Text style={[styles.msgText, mine && styles.msgTextMine]}>{item.text}</Text>
          <Text style={[styles.msgTime, mine && styles.msgTimeMine]}>
            {dayjs(item.created_at).format("HH:mm")}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.onSurface} />
        </Pressable>
        <Pressable
          style={styles.headerCenter}
          onPress={() => router.push(`/group/${id}/info?name=${encodeURIComponent(name || "")}`)}
        >
          <Avatar username={name || "?"} size={36} />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/group/${id}/info?name=${encodeURIComponent(name || "")}`)}
          style={styles.backBtn}
        >
          <Ionicons name="information-circle-outline" size={24} color={C.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={C.onSurface} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No messages yet. Say hello! 👋</Text>
            </View>
          }
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.bottom}
      >
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + SP.sm }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={C.muted}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={18} color={C.onInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.md,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    gap: SP.sm,
  },
  backBtn: { padding: SP.xs },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: SP.sm },
  headerTitle: { fontSize: 17, fontWeight: "700", color: C.onSurface, flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: SP.md, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: SP.xxxl },
  emptyText: { color: C.muted, fontSize: 14 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: SP.sm, gap: 6 },
  msgRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "78%", paddingHorizontal: SP.md, paddingVertical: SP.sm, borderRadius: R.lg },
  bubbleOther: { backgroundColor: C.surface2, borderBottomLeftRadius: 5 },
  bubbleMine: { backgroundColor: C.inverse, borderBottomRightRadius: 5 },
  senderName: { fontSize: 12, fontWeight: "700", color: C.brand, marginBottom: 2 },
  msgText: { fontSize: 15, color: C.onSurface, lineHeight: 20 },
  msgTextMine: { color: C.onInverse },
  msgTime: { fontSize: 10, color: C.muted, marginTop: 3, alignSelf: "flex-end" },
  msgTimeMine: { color: "rgba(255,255,255,0.6)" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: SP.md,
    paddingTop: SP.sm,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    gap: SP.sm,
  },
  input: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: R.lg,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    fontSize: 16,
    color: C.onSurface,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});

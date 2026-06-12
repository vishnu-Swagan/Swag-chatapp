import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import Avatar from "./Avatar";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, SP } from "@/src/theme";

export type StatusOwner = {
  user: { id: string; username: string; profile_image_base64?: string | null };
  is_self: boolean;
  has_unseen: boolean;
  statuses: any[];
};

type Props = {
  items: StatusOwner[];
  myItem: StatusOwner | null;
  onAddStatus: () => void;
  onOpen: (item: StatusOwner) => void;
};

/** Horizontal status ring strip (WhatsApp-style) shown at the top of Chats. */
export default function StatusStrip({ items, myItem, onAddStatus, onOpen }: Props) {
  const { user } = useAuth();
  // "My status" tile is always first. If we already have a status, show its ring with seen state.
  const others = items.filter((it) => !it.is_self);
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Pressable style={styles.tile} onPress={myItem ? () => onOpen(myItem) : onAddStatus} testID="status-my-tile">
          <View style={styles.ringPlain}>
            <Avatar
              username={myItem?.user.username || user?.username || "me"}
              size={56}
              imageBase64={myItem?.user.profile_image_base64 || user?.profile_image_base64 || null}
            />
            <View style={styles.addBadge}>
              <Ionicons name="add" size={14} color={C.onInverse} />
            </View>
          </View>
          <Text style={styles.label} numberOfLines={1}>My status</Text>
        </Pressable>
        {others.map((it) => (
          <Pressable
            key={it.user.id}
            style={styles.tile}
            onPress={() => onOpen(it)}
            testID={`status-tile-${it.user.username}`}
          >
            <View style={[styles.ring, it.has_unseen ? styles.ringUnseen : styles.ringSeen]}>
              <Avatar
                username={it.user.username}
                size={56}
                imageBase64={it.user.profile_image_base64 || null}
              />
            </View>
            <Text style={styles.label} numberOfLines={1}>@{it.user.username}</Text>
          </Pressable>
        ))}
        {others.length === 0 && !myItem && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>Share a moment with your friends — your status disappears in 24 hours.</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: C.divider, backgroundColor: C.surface },
  scroll: { paddingVertical: SP.md, paddingHorizontal: SP.md, gap: SP.md, alignItems: "flex-start" },
  tile: { alignItems: "center", width: 72 },
  ring: { padding: 3, borderRadius: 999 },
  ringPlain: { padding: 0, borderRadius: 999, position: "relative" },
  ringUnseen: { borderWidth: 2.5, borderColor: C.inverse },
  ringSeen: { borderWidth: 2, borderColor: C.border },
  addBadge: {
    position: "absolute", right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.inverse, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.surface,
  },
  label: { fontSize: 11, color: C.onSurface, fontWeight: "600", marginTop: 4, maxWidth: 72 },
  hint: { padding: SP.md, maxWidth: 220 },
  hintText: { fontSize: 12, color: C.muted, lineHeight: 17 },
});

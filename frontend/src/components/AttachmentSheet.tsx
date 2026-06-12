import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";

import { C, R, SP } from "@/src/theme";

export type AttachKind = "image" | "camera" | "video" | "document" | "location";

export default function AttachmentSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (kind: AttachKind) => void;
}) {
  const items: { kind: AttachKind; icon: any; label: string; color: string }[] = [
    { kind: "camera", icon: "camera", label: "Camera", color: "#2BB673" },
    { kind: "image", icon: "image", label: "Photo", color: "#7B61FF" },
    { kind: "video", icon: "videocam", label: "Video", color: "#E63946" },
    { kind: "document", icon: "document", label: "Document", color: "#3A86FF" },
    { kind: "location", icon: "location", label: "Location", color: "#FB8500" },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Share</Text>
          <View style={styles.grid}>
            {items.map((it) => (
              <Pressable
                key={it.kind}
                onPress={() => { onPick(it.kind); onClose(); }}
                style={({ pressed }) => [styles.item, pressed && { opacity: 0.55 }]}
                testID={`attach-${it.kind}`}
              >
                <View style={[styles.iconWrap, { backgroundColor: it.color }]}>
                  <Ionicons name={it.icon} size={26} color="#FFFFFF" />
                </View>
                <Text style={styles.itemLabel}>{it.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: SP.xl, paddingTop: SP.md, paddingBottom: SP.xxl,
  },
  handle: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: SP.md },
  title: { fontSize: 16, fontWeight: "800", color: C.onSurface, marginBottom: SP.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SP.lg },
  item: { alignItems: "center", width: 76 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: SP.sm,
  },
  itemLabel: { fontSize: 12, color: C.onSurface, fontWeight: "600" },
});

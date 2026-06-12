import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

import { C, R, SP } from "@/src/theme";

const EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

export default function ReactionPicker({
  visible,
  onPick,
  onClose,
  mine,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
  mine?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Animated.View
          entering={ZoomIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[styles.bar, mine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}
        >
          {EMOJIS.map((e, i) => (
            <Animated.View key={e} entering={FadeIn.delay(i * 25).duration(180)}>
              <Pressable
                onPress={() => onPick(e)}
                style={({ pressed }) => [styles.emoji, pressed && { transform: [{ scale: 1.25 }] }]}
                testID={`reaction-${e}`}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.18)", justifyContent: "center", padding: SP.xl },
  bar: {
    flexDirection: "row", gap: 4,
    backgroundColor: C.surface, borderRadius: R.pill,
    paddingHorizontal: SP.sm, paddingVertical: SP.sm,
    borderWidth: 1, borderColor: C.border,
    ...Platform.select({
      web: { boxShadow: "0 10px 40px rgba(0,0,0,0.12)" },
      default: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
    }),
  },
  emoji: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 24 },
});

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { C, R, SP } from "@/src/theme";

type Props = {
  name: string;
  mime?: string | null;
  size?: number | null;
  base64?: string | null;
  mine?: boolean;
};

function prettySize(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentBubble({ name, mime, size, base64, mine }: Props) {
  const fg = mine ? "#FFFFFF" : C.onSurface;
  const dim = mine ? "rgba(255,255,255,0.75)" : C.muted;

  const open = async () => {
    if (!base64) return;
    try {
      if (Platform.OS === "web") {
        const dataUri = `data:${mime || "application/octet-stream"};base64,${base64}`;
        const a = document.createElement("a");
        a.href = dataUri;
        a.download = name;
        a.click();
      } else {
        const FS = await import("expo-file-system");
        const Sharing = await import("expo-sharing").catch(() => null);
        const uri = (FS as any).cacheDirectory + name;
        await (FS as any).writeAsStringAsync(uri, base64, { encoding: "base64" });
        if (Sharing && (await (Sharing as any).isAvailableAsync())) {
          await (Sharing as any).shareAsync(uri);
        }
      }
    } catch (e) {
      console.warn("doc open fail", e);
    }
  };

  const ext = (name.split(".").pop() || "").slice(0, 4).toUpperCase();

  return (
    <Pressable onPress={open} style={styles.row} testID="document-bubble">
      <View style={[styles.icon, { borderColor: dim }]}>
        <Ionicons name="document" size={22} color={fg} />
        {ext && <Text style={[styles.ext, { color: fg }]}>{ext}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: fg }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.meta, { color: dim }]}>{prettySize(size)}</Text>
      </View>
      <Ionicons name="download-outline" size={18} color={fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SP.md, minWidth: 220, paddingVertical: 6 },
  icon: {
    width: 44, height: 44, borderRadius: R.sm, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  ext: { fontSize: 8, fontWeight: "800", marginTop: -2 },
  name: { fontSize: 13, fontWeight: "700" },
  meta: { fontSize: 11, marginTop: 2 },
});

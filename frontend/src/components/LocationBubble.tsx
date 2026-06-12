import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { C, R, SP } from "@/src/theme";

type Props = {
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  mine?: boolean;
};

export default function LocationBubble({ latitude, longitude, label, mine }: Props) {
  if (latitude == null || longitude == null) return null;

  const lat = latitude.toFixed(5);
  const lng = longitude.toFixed(5);
  // OSM static map image (free, no key)
  const mapUri =
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=320x180&markers=${lat},${lng},red-pushpin`;

  const openMaps = () => {
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${lat},${lng}`,
      default: `https://www.google.com/maps/?q=${lat},${lng}`,
    }) as string;
    Linking.openURL(url).catch(() => {});
  };

  const fg = mine ? "#FFFFFF" : C.onSurface;

  return (
    <Pressable onPress={openMaps} style={styles.wrap} testID="location-bubble">
      <Image source={{ uri: mapUri }} style={styles.map} contentFit="cover" />
      <View style={styles.row}>
        <Ionicons name="location" size={16} color={fg} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
            {label || "Shared location"}
          </Text>
          <Text style={[styles.coords, { color: mine ? "rgba(255,255,255,0.7)" : C.muted }]}>
            {lat}, {lng}
          </Text>
        </View>
        <Ionicons name="open-outline" size={16} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 240, borderRadius: R.md, overflow: "hidden" },
  map: { width: "100%", height: 130, backgroundColor: C.surface3 },
  row: { flexDirection: "row", alignItems: "center", gap: SP.sm, paddingHorizontal: SP.md, paddingVertical: SP.sm },
  label: { fontSize: 13, fontWeight: "700" },
  coords: { fontSize: 11, marginTop: 1, fontVariant: ["tabular-nums"] },
});

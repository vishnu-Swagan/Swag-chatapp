import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "@/src/theme";

export default function Avatar({
  username,
  size = 48,
  inverse = false,
  imageBase64,
}: {
  username: string;
  size?: number;
  inverse?: boolean;
  imageBase64?: string | null;
}) {
  const initials = (username || "?").slice(0, 2).toUpperCase();
  const radius = size / 2;
  if (imageBase64) {
    const uri = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: C.surface3 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: inverse ? C.inverse : C.surface3,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { fontSize: size * 0.36, color: inverse ? C.onInverse : C.onSurface3 },
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  text: { fontWeight: "700", letterSpacing: 0.5 },
});

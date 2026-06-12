import React, { useCallback } from "react";
import { Platform, StyleSheet, View, ViewStyle } from "react-native";

import { C } from "@/src/theme";

// Renders a WebRTC MediaStream. Web-only (uses a DOM <video> element through
// react-native-web's createElement escape hatch). On native it renders a
// black placeholder — calls require a development build there.
export default function RTCVideo({
  stream,
  muted = false,
  mirror = false,
  style,
}: {
  stream: any;
  muted?: boolean;
  mirror?: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const attach = useCallback(
    (el: any) => {
      if (el && stream && el.srcObject !== stream) {
        el.srcObject = stream;
      }
    },
    [stream],
  );

  if (Platform.OS !== "web" || !stream) {
    return <View style={[styles.placeholder, style as any]} />;
  }

  return React.createElement("video", {
    ref: attach,
    autoPlay: true,
    playsInline: true,
    muted,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      backgroundColor: "#000",
      transform: mirror ? "scaleX(-1)" : undefined,
      ...StyleSheet.flatten(style as any),
    },
  });
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: C.inverse,
  },
});

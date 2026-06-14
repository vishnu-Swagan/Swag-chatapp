import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Avatar from "@/src/components/Avatar";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";

// Web incoming-call overlay: driven by our WebSocket signaling (SocketContext).
// Pairs with the manual-WebRTC call screen on web.
export default function IncomingCallOverlay() {
  const { incomingCall, clearIncomingCall, send } = useSocket();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (!incomingCall) return null;

  const accept = () => {
    send({ type: "call:accept", to: incomingCall.from.id });
    const { from, video } = incomingCall;
    clearIncomingCall();
    router.push(
      `/call/${from.id}?video=${video ? 1 : 0}&role=callee&username=${from.username}`,
    );
  };

  const decline = () => {
    send({ type: "call:reject", to: incomingCall.from.id });
    clearIncomingCall();
  };

  return (
    <View
      testID="incoming-call-overlay"
      style={[styles.wrap, { top: insets.top + SP.md }]}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <Avatar username={incomingCall.from.username} size={44} inverse />
          <View style={styles.info}>
            <Text style={styles.name}>@{incomingCall.from.username}</Text>
            <Text style={styles.sub}>
              Incoming {incomingCall.video ? "video" : "voice"} call…
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            testID="incoming-call-decline-button"
            onPress={decline}
            style={[styles.btn, styles.decline]}
          >
            <Ionicons name="close" size={18} color={C.onSurface} />
            <Text style={styles.declineText}>Decline</Text>
          </Pressable>
          <Pressable
            testID="incoming-call-accept-button"
            onPress={accept}
            style={[styles.btn, styles.accept]}
          >
            <Ionicons
              name={incomingCall.video ? "videocam" : "call"}
              size={18}
              color={C.onInverse}
            />
            <Text style={styles.acceptText}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: SP.lg,
    right: SP.lg,
    zIndex: 2000,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.borderStrong,
    padding: SP.lg,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: { flexDirection: "row", alignItems: "center" },
  info: { marginLeft: SP.md, flex: 1 },
  name: { fontSize: 16, fontWeight: "700", color: C.onSurface },
  sub: { fontSize: 13, color: C.muted, marginTop: 2 },
  actions: {
    flexDirection: "row",
    marginTop: SP.lg,
    gap: SP.md,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    gap: SP.sm,
    height: 44,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  decline: { backgroundColor: C.surface3 },
  declineText: { color: C.onSurface, fontWeight: "600" },
  accept: { backgroundColor: C.inverse },
  acceptText: { color: C.onInverse, fontWeight: "600" },
});

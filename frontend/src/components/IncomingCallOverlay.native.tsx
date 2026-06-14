import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CallingState, useCalls } from "@stream-io/video-react-native-sdk";

import Avatar from "@/src/components/Avatar";
import { C, R, SP } from "@/src/theme";

// Native incoming-call overlay: driven by Stream's ringing state (useCalls).
// Same Swag visual design as the web overlay. Accept joins the Stream call and
// navigates to the call screen; decline rejects it.
export default function IncomingCallOverlay() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const calls = useCalls();

  const incoming = calls.find(
    (c) => !c.isCreatedByMe && c.state.callingState === CallingState.RINGING,
  );

  if (!incoming) return null;

  const caller = incoming.state.createdBy;
  const username = caller?.name || caller?.id || "unknown";
  const callerId = caller?.id || "";
  const isVideo = !!(incoming.state.custom as any)?.video;

  const accept = async () => {
    try {
      await incoming.join();
      router.push(
        `/call/${callerId}?video=${isVideo ? 1 : 0}&role=callee&username=${username}`,
      );
    } catch {
      // If join fails, leave it ringing — the caller will time out.
    }
  };

  const decline = async () => {
    try {
      await incoming.leave({ reject: true });
    } catch {}
  };

  return (
    <View
      testID="incoming-call-overlay"
      style={[styles.wrap, { top: insets.top + SP.md }]}
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <Avatar username={username} size={44} inverse />
          <View style={styles.info}>
            <Text style={styles.name}>@{username}</Text>
            <Text style={styles.sub}>
              Incoming {isVideo ? "video" : "voice"} call…
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
              name={isVideo ? "videocam" : "call"}
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

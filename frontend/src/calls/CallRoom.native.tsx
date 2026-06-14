import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Call,
  CallingState,
  ParticipantView,
  StreamCall,
  useCall,
  useCallStateHooks,
  useStreamVideoClient,
} from "@stream-io/video-react-native-sdk";

import Avatar from "@/src/components/Avatar";
import { makeCallId } from "@/src/calls/callId";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, SP } from "@/src/theme";

// Native call screen: Stream Video. Custom Swag UI (control bar + PiP) driven by
// Stream hooks — not the prebuilt CallContent. Caller creates+rings the call;
// callee joins the same deterministic call id. Web uses manual WebRTC instead
// (CallRoom.web.tsx).
export default function CallRoom() {
  const { id, video, role, username } = useLocalSearchParams<{
    id: string;
    video: string;
    role: string;
    username: string;
  }>();
  const friendId = id as string;
  const isVideo = video === "1";
  const isCaller = role === "caller";
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuth();
  const client = useStreamVideoClient();

  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !user?.id) return;
    const callId = makeCallId(user.id, friendId);
    const c = client.call("default", callId);
    let cancelled = false;

    (async () => {
      try {
        if (isCaller) {
          await c.getOrCreate({
            ring: true,
            data: {
              members: [{ user_id: user.id }, { user_id: friendId }],
              custom: { video: isVideo },
            },
          });
        }
        // The callee may have already joined from the incoming-call overlay.
        if (
          c.state.callingState !== CallingState.JOINED &&
          c.state.callingState !== CallingState.JOINING
        ) {
          await c.join();
        }
        // Audio call = mic on, camera off. Video call = both on.
        await c.microphone.enable();
        if (isVideo) {
          await c.camera.enable();
        } else {
          await c.camera.disable();
        }
        if (!cancelled) setCall(c);
      } catch {
        if (!cancelled) {
          setError("Could not connect the call");
          setTimeout(() => router.back(), 1500);
        }
      }
    })();

    return () => {
      cancelled = true;
      c.leave().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, user?.id, friendId, isCaller, isVideo]);

  if (!call) {
    return (
      <View style={[styles.container, styles.centerAll]} testID="call-room-screen">
        <Avatar username={(username as string) || "?"} size={104} inverse />
        <Text style={styles.calleeName}>@{username}</Text>
        <Text style={styles.statusText} testID="call-status-text">
          {error || (isCaller ? "Calling…" : "Connecting…")}
        </Text>
      </View>
    );
  }

  return (
    <StreamCall call={call}>
      <InCall
        isVideo={isVideo}
        username={(username as string) || "?"}
        insets={insets}
        onLeft={() => router.back()}
      />
    </StreamCall>
  );
}

function InCall({
  isVideo,
  username,
  insets,
  onLeft,
}: {
  isVideo: boolean;
  username: string;
  insets: { top: number; bottom: number };
  onLeft: () => void;
}) {
  const call = useCall();
  const { useCallCallingState, useParticipants, useMicrophoneState, useCameraState } =
    useCallStateHooks();
  const callingState = useCallCallingState();
  const participants = useParticipants();
  const { isMute: micMuted } = useMicrophoneState();
  const { isMute: camMuted } = useCameraState();

  const [seconds, setSeconds] = useState(0);
  const leftRef = useRef(false);

  const localParticipant = participants.find((p) => p.isLocalParticipant);
  const remoteParticipant = participants.find((p) => !p.isLocalParticipant);
  const connected = callingState === CallingState.JOINED && !!remoteParticipant;

  // Timer starts once the remote side is connected.
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  // If the call ends (remote hangs up / rejected), pop the screen.
  useEffect(() => {
    if (leftRef.current) return;
    if (callingState === CallingState.LEFT || callingState === CallingState.IDLE) {
      leftRef.current = true;
      onLeft();
    }
  }, [callingState, onLeft]);

  const leave = useCallback(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    try {
      await call?.leave();
    } catch {}
    onLeft();
  }, [call, onLeft]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const statusText = connected
    ? fmt(seconds)
    : callingState === CallingState.RINGING
      ? "Calling…"
      : "Connecting…";

  return (
    <View style={styles.container} testID="call-room-screen">
      {isVideo && remoteParticipant ? (
        <ParticipantView
          participant={remoteParticipant}
          trackType="videoTrack"
          style={styles.remoteVideo}
        />
      ) : (
        <View style={[styles.centerAll, { flex: 1 }]}>
          <Avatar username={username} size={104} inverse />
          <Text style={styles.calleeName}>@{username}</Text>
          <Text style={styles.statusText} testID="call-status-text">
            {statusText}
          </Text>
        </View>
      )}

      {isVideo && remoteParticipant && (
        <View style={[styles.statusOverlay, { top: insets.top + SP.md }]}>
          <Text style={styles.overlayName}>@{username}</Text>
          <Text style={styles.overlayTime}>{statusText}</Text>
        </View>
      )}

      {isVideo && localParticipant && (
        <View style={[styles.pip, { top: insets.top + SP.md }]}>
          <ParticipantView
            participant={localParticipant}
            trackType="videoTrack"
            style={styles.pipVideo}
          />
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + SP.lg }]}>
        <Pressable
          testID="call-mute-button"
          style={[styles.ctrlBtn, micMuted && styles.ctrlActive]}
          onPress={() => call?.microphone.toggle()}
        >
          <Ionicons
            name={micMuted ? "mic-off" : "mic"}
            size={24}
            color={micMuted ? C.onSurface : C.onInverse}
          />
        </Pressable>
        {isVideo && (
          <Pressable
            testID="call-camera-toggle-button"
            style={[styles.ctrlBtn, camMuted && styles.ctrlActive]}
            onPress={() => call?.camera.toggle()}
          >
            <Ionicons
              name={camMuted ? "videocam-off" : "videocam"}
              size={24}
              color={camMuted ? C.onSurface : C.onInverse}
            />
          </Pressable>
        )}
        <Pressable testID="call-end-button" style={styles.endBtn} onPress={leave}>
          <Ionicons
            name="call"
            size={22}
            color={C.onInverse}
            style={{ transform: [{ rotate: "135deg" }] }}
          />
          <Text style={styles.endText}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centerAll: { alignItems: "center", justifyContent: "center", padding: SP.xxl },
  calleeName: { color: "#FFF", fontSize: 24, fontWeight: "800", marginTop: SP.lg },
  statusText: { color: "rgba(255,255,255,0.7)", fontSize: 15, marginTop: SP.sm },
  remoteVideo: { flex: 1 },
  statusOverlay: {
    position: "absolute",
    left: SP.lg,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: R.md,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
  },
  overlayName: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  overlayTime: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  pip: {
    position: "absolute",
    right: SP.lg,
    width: 110,
    height: 150,
    borderRadius: R.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  pipVideo: { width: 110, height: 150 },
  controls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: SP.lg,
    paddingTop: SP.lg,
  },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlActive: { backgroundColor: "#FFF" },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: R.pill,
    paddingHorizontal: SP.xl,
    height: 56,
  },
  endText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
});

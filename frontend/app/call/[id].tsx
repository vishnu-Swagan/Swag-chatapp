import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Avatar from "@/src/components/Avatar";
import RTCVideo from "@/src/components/RTCVideo";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";

const ICE_SERVERS = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ],
};

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
  const { send, subscribe } = useSocket();

  const [phase, setPhase] = useState<"calling" | "connecting" | "connected" | "ended">(
    isCaller ? "calling" : "connecting",
  );
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<any>(null);
  const localRef = useRef<any>(null);
  const mediaPromise = useRef<Promise<any> | null>(null);
  const pendingIce = useRef<any[]>([]);
  const endedRef = useRef(false);

  const cleanup = useCallback(() => {
    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;
    try {
      localRef.current?.getTracks()?.forEach((t: any) => t.stop());
    } catch {}
    localRef.current = null;
  }, []);

  const leave = useCallback(
    (notify: boolean, reason?: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      if (notify) send({ type: "call:end", to: friendId });
      cleanup();
      setPhase("ended");
      if (reason) {
        setEndReason(reason);
        setTimeout(() => router.back(), 1200);
      } else {
        router.back();
      }
    },
    [send, friendId, cleanup, router],
  );

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingIce.current;
    pendingIce.current = [];
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
  }, []);

  const createPC = useCallback(
    (stream: any) => {
      const pc = new (window as any).RTCPeerConnection(ICE_SERVERS);
      stream.getTracks().forEach((t: any) => pc.addTrack(t, stream));
      pc.onicecandidate = (e: any) => {
        if (e.candidate) send({ type: "rtc:ice", to: friendId, payload: e.candidate });
      };
      pc.ontrack = (e: any) => {
        setRemoteStream(e.streams[0]);
        setPhase("connected");
      };
      pcRef.current = pc;
      return pc;
    },
    [send, friendId],
  );

  // Timer
  useEffect(() => {
    if (phase !== "connected") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    mediaPromise.current = (navigator as any).mediaDevices
      .getUserMedia({ audio: true, video: isVideo })
      .then((s: any) => {
        localRef.current = s;
        setLocalStream(s);
        return s;
      })
      .catch(() => {
        setEndReason("Could not access camera/microphone");
        setTimeout(() => leave(true), 1500);
        return null;
      });

    if (isCaller) {
      send({ type: "call:request", to: friendId, video: isVideo });
    }

    const unsub = subscribe(async (msg) => {
      if (msg.type === "call:unavailable") {
        setEndReason("User is offline");
        setTimeout(() => leave(false), 1500);
        return;
      }
      if (msg.from?.id !== friendId) return;
      switch (msg.type) {
        case "call:accept": {
          const s = await mediaPromise.current;
          if (!s) return;
          const pc = createPC(s);
          setPhase("connecting");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "rtc:offer", to: friendId, payload: offer });
          break;
        }
        case "rtc:offer": {
          const s = await mediaPromise.current;
          if (!s) return;
          const pc = createPC(s);
          await pc.setRemoteDescription(msg.payload);
          await flushIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "rtc:answer", to: friendId, payload: answer });
          break;
        }
        case "rtc:answer":
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(msg.payload);
            await flushIce();
          }
          break;
        case "rtc:ice":
          if (pcRef.current?.remoteDescription) {
            try {
              await pcRef.current.addIceCandidate(msg.payload);
            } catch {}
          } else {
            pendingIce.current.push(msg.payload);
          }
          break;
        case "call:reject":
          setEndReason("Call declined");
          cleanup();
          setTimeout(() => leave(false), 1200);
          break;
        case "call:end":
          setEndReason("Call ended");
          cleanup();
          setTimeout(() => leave(false), 800);
          break;
      }
    });

    return () => {
      unsub();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    const s = localRef.current;
    if (!s) return;
    s.getAudioTracks().forEach((t: any) => (t.enabled = muted));
    setMuted(!muted);
  };

  const toggleCam = () => {
    const s = localRef.current;
    if (!s) return;
    s.getVideoTracks().forEach((t: any) => (t.enabled = camOff));
    setCamOff(!camOff);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ---------- Native (Expo Go) — calls need a dev build ----------
  if (Platform.OS !== "web") {
    return (
      <View style={[styles.container, styles.centerAll]} testID="call-native-notice">
        <Avatar username={(username as string) || "?"} size={88} inverse />
        <Text style={styles.calleeName}>@{username}</Text>
        <Text style={styles.nativeNote}>
          Voice & video calls use WebRTC and require a development build on
          mobile. Try the call from the web preview for now.
        </Text>
        <Pressable
          testID="call-end-button"
          style={[styles.endBtn, { marginTop: SP.xxl }]}
          onPress={() => leave(true)}
        >
          <Ionicons name="call" size={22} color={C.onInverse} style={{ transform: [{ rotate: "135deg" }] }} />
          <Text style={styles.endText}>End</Text>
        </Pressable>
      </View>
    );
  }

  const statusText =
    endReason ||
    (phase === "calling"
      ? "Calling…"
      : phase === "connecting"
        ? "Connecting…"
        : fmt(seconds));

  return (
    <View style={styles.container} testID="call-room-screen">
      {isVideo && remoteStream ? (
        <RTCVideo stream={remoteStream} style={styles.remoteVideo} />
      ) : (
        <View style={[styles.centerAll, { flex: 1 }]}>
          <Avatar username={(username as string) || "?"} size={104} inverse />
          <Text style={styles.calleeName}>@{username}</Text>
          <Text style={styles.statusText} testID="call-status-text">
            {statusText}
          </Text>
          {!isVideo && remoteStream && (
            <RTCVideo stream={remoteStream} style={styles.hiddenAudio} />
          )}
        </View>
      )}

      {isVideo && remoteStream && (
        <View style={[styles.statusOverlay, { top: insets.top + SP.md }]}>
          <Text style={styles.overlayName}>@{username}</Text>
          <Text style={styles.overlayTime}>{statusText}</Text>
        </View>
      )}

      {isVideo && localStream && (
        <View style={[styles.pip, { top: insets.top + SP.md }]}>
          <RTCVideo stream={localStream} muted mirror style={styles.pipVideo} />
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + SP.lg }]}>
        <Pressable
          testID="call-mute-button"
          style={[styles.ctrlBtn, muted && styles.ctrlActive]}
          onPress={toggleMute}
        >
          <Ionicons name={muted ? "mic-off" : "mic"} size={24} color={muted ? C.onSurface : C.onInverse} />
        </Pressable>
        {isVideo && (
          <Pressable
            testID="call-camera-toggle-button"
            style={[styles.ctrlBtn, camOff && styles.ctrlActive]}
            onPress={toggleCam}
          >
            <Ionicons
              name={camOff ? "videocam-off" : "videocam"}
              size={24}
              color={camOff ? C.onSurface : C.onInverse}
            />
          </Pressable>
        )}
        <Pressable testID="call-end-button" style={styles.endBtn} onPress={() => leave(true)}>
          <Ionicons name="call" size={22} color={C.onInverse} style={{ transform: [{ rotate: "135deg" }] }} />
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
  nativeNote: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    textAlign: "center",
    marginTop: SP.lg,
    lineHeight: 20,
  },
  remoteVideo: { flex: 1 },
  hiddenAudio: { width: 1, height: 1, opacity: 0 },
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

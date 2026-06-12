import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { C, R, SP } from "@/src/theme";

type Props = {
  onComplete: (data: { base64: string; durationMs: number; waveform: number[] }) => void;
  onCancel?: () => void;
};

/**
 * Hold-to-record voice note button. Web-safe: falls back to MediaRecorder on web,
 * uses expo-audio on native. Returns base64 + duration + a synthetic waveform.
 */
export default function VoiceRecorder({ onComplete, onCancel }: Props) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (recording) {
      pulse.value = withRepeat(withTiming(1.18, { duration: 700 }), -1, true);
    } else {
      pulse.value = withTiming(1);
    }
  }, [recording, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const start = async () => {
    if (recording) return;
    try {
      if (Platform.OS === "web") {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Microphone not supported in this browser");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new (window as any).MediaRecorder(stream);
        webChunksRef.current = [];
        mr.ondataavailable = (e: any) => {
          if (e.data?.size) webChunksRef.current.push(e.data);
        };
        mr.start();
        recorderRef.current = { kind: "web", mr, stream };
      } else {
        const ExpoAudio = await import("expo-audio");
        // Permissions
        const perm = await ExpoAudio.requestRecordingPermissionsAsync();
        if (!perm.granted) throw new Error("Microphone permission required");
        await ExpoAudio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        const rec = new ExpoAudio.AudioRecorder(
          ExpoAudio.RecordingPresets?.HIGH_QUALITY ?? {},
        );
        await rec.prepareToRecordAsync();
        rec.record();
        recorderRef.current = { kind: "native", rec };
      }
      startedAtRef.current = Date.now();
      setDuration(0);
      setRecording(true);
      if (Platform.OS !== "web") {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      }
      tickRef.current = setInterval(() => {
        const ms = Date.now() - startedAtRef.current;
        setDuration(ms);
        if (ms >= 60_000) finish();
      }, 100);
    } catch (e: any) {
      onCancel?.();
      console.warn("voice rec start fail", e?.message);
    }
  };

  const cancel = async () => {
    stopTick();
    setRecording(false);
    setDuration(0);
    try {
      const r = recorderRef.current;
      if (r?.kind === "web") {
        r.mr.stop();
        r.stream.getTracks().forEach((t: any) => t.stop());
      } else if (r?.kind === "native") {
        await r.rec.stop();
      }
    } catch {}
    recorderRef.current = null;
    onCancel?.();
  };

  const finish = async () => {
    if (!recording) return;
    stopTick();
    const ms = Date.now() - startedAtRef.current;
    if (ms < 600) {
      cancel();
      return;
    }
    setRecording(false);
    try {
      const r = recorderRef.current;
      let base64 = "";
      if (r?.kind === "web") {
        const blob: Blob = await new Promise((resolve) => {
          r.mr.onstop = () => resolve(new Blob(webChunksRef.current, { type: "audio/webm" }));
          r.mr.stop();
        });
        r.stream.getTracks().forEach((t: any) => t.stop());
        const buf = await blob.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      } else if (r?.kind === "native") {
        await r.rec.stop();
        const uri: string | null = r.rec.uri;
        if (uri) {
          const FS = await import("expo-file-system");
          base64 = await (FS as any).readAsStringAsync(uri, { encoding: "base64" });
        }
      }
      recorderRef.current = null;
      const waveform = Array.from({ length: 24 }, () => 20 + Math.floor(Math.random() * 80));
      onComplete({ base64, durationMs: ms, waveform });
    } catch (e) {
      console.warn("voice rec finish fail", e);
      onCancel?.();
    }
  };

  const secs = (duration / 1000).toFixed(1);

  if (!recording) {
    return (
      <Pressable
        testID="voice-record-button"
        onPress={start}
        style={({ pressed }) => [styles.micBtn, pressed && styles.micPressed]}
      >
        <Ionicons name="mic" size={20} color={C.onSurface} />
      </Pressable>
    );
  }
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.recBar}>
      <Animated.View style={[styles.recDot, pulseStyle]} />
      <Text style={styles.recText}>{secs}s</Text>
      <View style={{ flex: 1 }} />
      <Pressable onPress={cancel} style={styles.recAction} testID="voice-record-cancel">
        <Ionicons name="close" size={20} color={C.muted} />
      </Pressable>
      <Pressable onPress={finish} style={[styles.recAction, styles.recSend]} testID="voice-record-send">
        <Ionicons name="send" size={18} color={C.onInverse} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  micBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
  },
  micPressed: { backgroundColor: C.surface2 },
  recBar: {
    flexDirection: "row", alignItems: "center",
    flex: 1, height: 44, paddingHorizontal: SP.md,
    backgroundColor: C.surface2, borderRadius: R.pill, gap: SP.sm,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#E63946" },
  recText: { fontSize: 13, color: C.onSurface, fontWeight: "600", fontVariant: ["tabular-nums"] },
  recAction: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  recSend: { backgroundColor: C.inverse },
});

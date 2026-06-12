import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { C, R, SP } from "@/src/theme";

type Props = {
  base64?: string | null;
  durationMs?: number | null;
  waveform?: number[] | null;
  mine?: boolean;
};

function fmtSecs(ms?: number | null) {
  if (!ms) return "0:00";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function VoiceBubble({ base64, durationMs, waveform, mine }: Props) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const playerRef = useRef<any>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => {
    try {
      playerRef.current?.remove?.();
      audioElRef.current?.pause?.();
    } catch {}
  }, []);

  const toggle = async () => {
    if (!base64) return;
    if (playing) {
      try {
        if (Platform.OS === "web") audioElRef.current?.pause?.();
        else playerRef.current?.pause?.();
      } catch {}
      setPlaying(false);
      return;
    }
    try {
      if (Platform.OS === "web") {
        if (!audioElRef.current) {
          const audio = new Audio(`data:audio/webm;base64,${base64}`);
          audio.ontimeupdate = () => {
            const d = audio.duration || (durationMs || 0) / 1000;
            setProgress(d ? audio.currentTime / d : 0);
          };
          audio.onended = () => { setPlaying(false); setProgress(0); };
          audioElRef.current = audio;
        }
        await audioElRef.current.play();
      } else {
        const ExpoAudio = await import("expo-audio");
        const FS = await import("expo-file-system");
        const uri = (FS as any).cacheDirectory + `voice-${Date.now()}.m4a`;
        await (FS as any).writeAsStringAsync(uri, base64, { encoding: "base64" });
        const player = ExpoAudio.createAudioPlayer({ uri });
        playerRef.current = player;
        player.addListener("playbackStatusUpdate" as any, (s: any) => {
          const d = s.duration || (durationMs || 0) / 1000;
          if (d) setProgress((s.currentTime || 0) / d);
          if (s.didJustFinish) { setPlaying(false); setProgress(0); }
        });
        await player.play();
      }
      setPlaying(true);
    } catch (e) {
      console.warn("voice play fail", e);
    }
  };

  const wf = waveform && waveform.length ? waveform : Array.from({ length: 22 }, (_, i) => 25 + ((i * 13) % 60));
  const filled = Math.floor(progress * wf.length);
  const fg = mine ? "#FFFFFF" : C.onSurface;
  const dim = mine ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.25)";

  return (
    <View style={[styles.row]} testID="voice-bubble">
      <Pressable onPress={toggle} style={[styles.playBtn, { borderColor: fg }]}>
        <Ionicons name={playing ? "pause" : "play"} size={16} color={fg} />
      </Pressable>
      <View style={styles.wave}>
        {wf.map((h, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { height: Math.max(4, Math.min(28, h * 0.32)), backgroundColor: i < filled ? fg : dim },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.dur, { color: mine ? "rgba(255,255,255,0.85)" : C.muted }]}>
        {fmtSecs(durationMs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SP.sm, paddingVertical: 4 },
  playBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  wave: { flex: 1, flexDirection: "row", alignItems: "center", height: 30, gap: 2 },
  bar: { width: 3, borderRadius: 2 },
  dur: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"], minWidth: 32, textAlign: "right" },
});

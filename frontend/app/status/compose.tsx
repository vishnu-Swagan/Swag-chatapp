import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { Toast, useToast } from "@/src/components/Toast";
import { C, R, SP } from "@/src/theme";

const BG_COLORS = [
  "#0F172A", "#7C3AED", "#DC2626", "#059669",
  "#F59E0B", "#0EA5E9", "#9333EA", "#1F2937",
];

type Mode = "text" | "image" | "video";

export default function StatusComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const initialMode = (params.mode as Mode) || "text";
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BG_COLORS[0]);
  const [base64, setBase64] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], base64: true, quality: 0.4, allowsEditing: true,
    });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    setMode("image");
    setBase64(res.assets[0].base64);
  };
  const pickVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"], videoMaxDuration: 15, quality: 0.4,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    let b64 = res.assets[0].base64 as string | undefined;
    if (!b64) {
      if (Platform.OS === "web") {
        const blob = await (await fetch(res.assets[0].uri)).blob();
        const buf = await blob.arrayBuffer();
        b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      } else {
        const FS = await import("expo-file-system");
        b64 = await (FS as any).readAsStringAsync(res.assets[0].uri, { encoding: "base64" });
      }
    }
    if (!b64) { toast.show("Could not read video"); return; }
    if (b64.length > 4_500_000) { toast.show("Video too large (max ~3.3MB)"); return; }
    setMode("video");
    setBase64(b64);
    setDurationMs(res.assets[0].duration ?? null);
  };

  const publish = async () => {
    setBusy(true);
    try {
      const body: any = { type: mode };
      if (mode === "text") {
        if (!text.trim()) { toast.show("Write something first"); setBusy(false); return; }
        body.text = text.trim();
        body.background = bg;
      } else if (mode === "image") {
        if (!base64) { toast.show("Pick a photo first"); setBusy(false); return; }
        body.image_base64 = base64;
        body.caption = caption || null;
      } else if (mode === "video") {
        if (!base64) { toast.show("Pick a video first"); setBusy(false); return; }
        body.video_base64 = base64;
        body.duration_ms = durationMs;
        body.caption = caption || null;
      }
      await api("/status", { method: "POST", body });
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Could not publish");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="status-compose-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="status-compose-back">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.title}>New status</Text>
        <Pressable
          onPress={publish}
          disabled={busy}
          style={[styles.publishBtn, busy && { opacity: 0.5 }]}
          testID="status-compose-publish"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>Share</Text>}
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {(["text", "image", "video"] as Mode[]).map((m) => (
          <Pressable
            key={m}
            style={[styles.tab, mode === m && styles.tabActive]}
            onPress={() => {
              setMode(m);
              if (m === "image" && !base64) pickImage();
              else if (m === "video" && !base64) pickVideo();
            }}
            testID={`status-mode-${m}`}
          >
            <Ionicons
              name={m === "text" ? "text" : m === "image" ? "image" : "videocam"}
              size={16}
              color={mode === m ? "#fff" : "rgba(255,255,255,0.6)"}
            />
            <Text style={[styles.tabLabel, mode === m && { color: "#fff" }]}>{m.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAvoidingView style={styles.canvas} behavior="padding">
        {mode === "text" ? (
          <Animated.View entering={FadeIn} style={[styles.textCanvas, { backgroundColor: bg }]}>
            <TextInput
              testID="status-text-input"
              style={styles.textInput}
              placeholder="Type a status..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              multiline
              value={text}
              onChangeText={setText}
              autoFocus
              maxLength={700}
            />
          </Animated.View>
        ) : base64 ? (
          <View style={styles.mediaCanvas}>
            {mode === "image" ? (
              <Image
                source={{ uri: `data:image/jpeg;base64,${base64}` }}
                style={styles.mediaPreview}
                contentFit="contain"
              />
            ) : (
              <View style={[styles.mediaPreview, { alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="videocam" size={64} color="rgba(255,255,255,0.6)" />
                <Text style={{ color: "#fff", marginTop: 8 }}>
                  Video {durationMs ? `· ${Math.round(durationMs / 1000)}s` : ""}
                </Text>
              </View>
            )}
            <TextInput
              style={styles.caption}
              placeholder="Add a caption..."
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={caption}
              onChangeText={setCaption}
              maxLength={250}
            />
          </View>
        ) : (
          <View style={[styles.canvas, { alignItems: "center", justifyContent: "center" }]}>
            <Pressable onPress={mode === "image" ? pickImage : pickVideo} style={styles.pickBtn}>
              <Ionicons name={mode === "image" ? "image" : "videocam"} size={42} color="#fff" />
              <Text style={styles.pickText}>{mode === "image" ? "Pick a photo" : "Pick a video (max 15s)"}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {mode === "text" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colors}>
          {BG_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setBg(c)}
              style={[styles.swatch, { backgroundColor: c }, bg === c && styles.swatchActive]}
              testID={`status-bg-${c}`}
            />
          ))}
        </ScrollView>
      )}
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", padding: SP.md, gap: SP.sm,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 18, fontWeight: "800", color: "#fff" },
  publishBtn: {
    paddingHorizontal: SP.lg, paddingVertical: SP.sm,
    backgroundColor: "#fff", borderRadius: 999,
  },
  publishText: { color: "#000", fontWeight: "800" },
  tabRow: { flexDirection: "row", gap: SP.sm, paddingHorizontal: SP.lg, marginBottom: SP.md },
  tab: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: SP.md, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  tabActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  tabLabel: { fontSize: 11, fontWeight: "800", color: "rgba(255,255,255,0.6)", letterSpacing: 1 },
  canvas: { flex: 1, paddingHorizontal: SP.md, paddingBottom: SP.md },
  textCanvas: {
    flex: 1, borderRadius: R.lg, padding: SP.xl, alignItems: "center", justifyContent: "center",
  },
  textInput: { color: "#fff", fontSize: 28, fontWeight: "800", textAlign: "center", minHeight: 100, width: "100%" },
  mediaCanvas: { flex: 1, gap: SP.md },
  mediaPreview: { flex: 1, borderRadius: R.lg, backgroundColor: "#111" },
  caption: { backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", padding: SP.md, borderRadius: R.md },
  pickBtn: { alignItems: "center", gap: SP.sm, padding: SP.xxl, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", borderRadius: R.lg, borderStyle: "dashed" },
  pickText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  colors: { paddingHorizontal: SP.lg, paddingBottom: SP.lg, gap: SP.sm },
  swatch: { width: 28, height: 28, borderRadius: 14, marginRight: SP.sm },
  swatchActive: { borderWidth: 2, borderColor: "#fff" },
});

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, SP } from "@/src/theme";

const STORY_MS = 5000;

type StatusItem = {
  id: string; type: "text" | "image" | "video"; text?: string; background?: string;
  caption?: string; duration_ms?: number; created_at: string; seen?: boolean; viewers_count?: number;
  image_base64?: string; video_base64?: string;
};
type Owner = {
  user: { id: string; username: string; profile_image_base64?: string | null };
  is_self: boolean; statuses: StatusItem[];
};

export default function StatusViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ owner: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [owner, setOwner] = useState<Owner | null>(null);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, StatusItem>>({});
  const progress = useSharedValue(0);
  const pauseRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const parsed: Owner = JSON.parse(params.owner as string);
      setOwner(parsed);
      setIndex(0);
    } catch {
      router.back();
    }
  }, [params.owner, router]);

  const current = owner?.statuses[index];
  const full = current ? loaded[current.id] : null;

  // Lazy-load full status (with media) when index changes
  useEffect(() => {
    if (!current) return;
    if (loaded[current.id]) return;
    api<StatusItem>(`/status/${current.id}`)
      .then((s) => setLoaded((p) => ({ ...p, [current.id]: s })))
      .catch(() => {});
    if (!owner?.is_self) {
      api(`/status/${current.id}/view`, { method: "POST" }).catch(() => {});
    }
    // Reset progress
    progress.value = 0;
    progress.value = withTiming(1, { duration: STORY_MS });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => advance(1), STORY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const advance = (delta: number) => {
    if (!owner) return;
    const next = index + delta;
    if (next < 0) {
      // can't go before first — just restart
      progress.value = 0;
      progress.value = withTiming(1, { duration: STORY_MS });
      return;
    }
    if (next >= owner.statuses.length) {
      router.back();
      return;
    }
    setIndex(next);
  };

  const onDelete = async () => {
    if (!current) return;
    const doIt = async () => {
      try {
        await api(`/status/${current.id}`, { method: "DELETE" });
        if (!owner) return;
        const remaining = owner.statuses.filter((s) => s.id !== current.id);
        if (!remaining.length) { router.back(); return; }
        setOwner({ ...owner, statuses: remaining });
        setIndex(Math.min(index, remaining.length - 1));
      } catch (e: any) {
        if (Platform.OS === "web") alert(e.message);
      }
    };
    if (Platform.OS === "web") {
      if (confirm("Delete this status?")) doIt();
    } else {
      Alert.alert("Delete status?", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doIt },
      ]);
    }
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, progress.value * 100)}%`,
  }));

  if (!owner) return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  if (!current) return null;

  const item = full || current;
  const isOwner = owner.is_self;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} testID="status-viewer-screen">
      {/* Progress bars */}
      <View style={styles.progressRow}>
        {owner.statuses.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                i < index ? { width: "100%" } : i === index ? progressStyle : { width: "0%" },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Avatar
          username={owner.user.username}
          size={36}
          imageBase64={owner.user.profile_image_base64}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.user}>{isOwner ? "You" : `@${owner.user.username}`}</Text>
          <Text style={styles.time}>{relTime(item.created_at)}</Text>
        </View>
        {isOwner && (
          <Pressable onPress={onDelete} style={styles.iconBtn} testID="status-delete">
            <Ionicons name="trash-outline" size={20} color="#fff" />
          </Pressable>
        )}
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="status-viewer-close">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {/* Tap zones */}
        <Pressable style={styles.tapLeft} onPress={() => advance(-1)} />
        <Pressable style={styles.tapRight} onPress={() => advance(1)} />

        {item.type === "text" ? (
          <View style={[styles.textBg, { backgroundColor: item.background || "#0F172A" }]}>
            <Text style={styles.textBody}>{item.text}</Text>
          </View>
        ) : item.type === "image" ? (
          item.image_base64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
              style={styles.media}
              contentFit="contain"
            />
          ) : (
            <View style={[styles.media, { alignItems: "center", justifyContent: "center" }]}>
              <ActivityIndicator color="#fff" />
            </View>
          )
        ) : (
          <View style={[styles.media, { alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.5)" />
            <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
              Video preview only on native build.
            </Text>
          </View>
        )}

        {!!item.caption && (
          <View style={styles.captionWrap} pointerEvents="none">
            <Text style={styles.captionText}>{item.caption}</Text>
          </View>
        )}
      </View>

      {/* Footer: viewers count */}
      {isOwner && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + SP.md }]}>
          <Ionicons name="eye-outline" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.viewersText}>
            {item.viewers_count ?? 0} {item.viewers_count === 1 ? "view" : "views"}
          </Text>
        </View>
      )}
    </View>
  );
}

function relTime(iso?: string) {
  if (!iso) return "";
  try {
    const ts = new Date(iso).getTime();
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  } catch { return ""; }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  progressRow: { flexDirection: "row", gap: 4, paddingHorizontal: SP.md, marginTop: SP.sm },
  progressTrack: { flex: 1, height: 3, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", gap: SP.sm, paddingHorizontal: SP.md, paddingVertical: SP.md },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  user: { color: "#fff", fontWeight: "800" },
  time: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  body: { flex: 1 },
  tapLeft: { position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", zIndex: 5 },
  tapRight: { position: "absolute", right: 0, top: 0, bottom: 0, width: "70%", zIndex: 5 },
  textBg: { flex: 1, margin: SP.md, borderRadius: R.lg, padding: SP.xl, alignItems: "center", justifyContent: "center" },
  textBody: { color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "center" },
  media: { flex: 1 },
  captionWrap: { position: "absolute", bottom: SP.lg, left: SP.lg, right: SP.lg, backgroundColor: "rgba(0,0,0,0.45)", padding: SP.md, borderRadius: R.md },
  captionText: { color: "#fff", fontSize: 14 },
  footer: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingTop: SP.md },
  viewersText: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
});

import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { C, R, SP } from "@/src/theme";

type AppVersion = {
  current_version: string;
  min_supported_version: string;
  force_update: boolean;
  message?: string;
  release_notes?: string;
  ios_url?: string;
  android_url?: string;
};

function cmpVer(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/**
 * AppVersionGate fetches /api/app/version on mount and shows an update prompt
 * (dismissible OR force-blocking) when the installed version is behind.
 * It is rendered once at root layout below I18nGate.
 */
export default function AppVersionGate() {
  const [info, setInfo] = useState<AppVersion | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const installed = String(Constants.expoConfig?.version || "1.0.0");

  useEffect(() => {
    api<AppVersion>("/app/version")
      .then((v) => setInfo(v))
      .catch(() => {});
  }, []);

  if (!info) return null;
  const behindMin = cmpVer(installed, info.min_supported_version) < 0;
  const behindCurrent = cmpVer(installed, info.current_version) < 0;
  const force = info.force_update || behindMin;
  if (!behindCurrent || (dismissed && !force)) return null;

  const storeUrl = Platform.select({ ios: info.ios_url, default: info.android_url });
  const openStore = () => {
    if (storeUrl) Linking.openURL(storeUrl).catch(() => {});
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => !force && setDismissed(true)}>
      <View style={styles.scrim}>
        <Animated.View entering={FadeIn.duration(220)} style={styles.card} testID="app-version-gate">
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-download-outline" size={32} color={C.onInverse} />
          </View>
          <Text style={styles.title}>
            {force ? "Update required" : "Update available"}
          </Text>
          <Text style={styles.body}>
            {info.message
              || (force
                ? `Your version (${installed}) is no longer supported. Update to ${info.current_version} to continue.`
                : `A new version (${info.current_version}) is available. You are on ${installed}.`)}
          </Text>
          {!!info.release_notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>What's new</Text>
              <Text style={styles.notesBody}>{info.release_notes}</Text>
            </View>
          )}
          <View style={styles.actions}>
            {!force && (
              <Pressable
                onPress={() => setDismissed(true)}
                style={[styles.btn, styles.btnGhost]}
                testID="app-version-later"
              >
                <Text style={styles.btnGhostText}>Later</Text>
              </Pressable>
            )}
            <Pressable onPress={openStore} style={[styles.btn, styles.btnPrimary]} testID="app-version-update">
              <Text style={styles.btnPrimaryText}>Update now</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: SP.xl },
  card: {
    width: "100%", maxWidth: 380, backgroundColor: C.surface,
    borderRadius: R.lg, padding: SP.xl, gap: SP.md,
  },
  iconWrap: {
    alignSelf: "center", width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.inverse, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "800", color: C.onSurface, textAlign: "center" },
  body: { fontSize: 14, color: C.mutedDark, textAlign: "center", lineHeight: 20 },
  notesBox: { backgroundColor: C.surface2, borderRadius: R.md, padding: SP.md },
  notesTitle: { fontSize: 12, fontWeight: "700", color: C.onSurface, marginBottom: 4 },
  notesBody: { fontSize: 13, color: C.mutedDark, lineHeight: 18 },
  actions: { flexDirection: "row", gap: SP.sm, marginTop: SP.sm },
  btn: { flex: 1, paddingVertical: SP.md, borderRadius: R.md, alignItems: "center" },
  btnPrimary: { backgroundColor: C.inverse },
  btnPrimaryText: { color: C.onInverse, fontWeight: "800" },
  btnGhost: { borderWidth: 1, borderColor: C.border },
  btnGhostText: { color: C.onSurface, fontWeight: "700" },
});

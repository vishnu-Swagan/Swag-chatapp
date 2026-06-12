import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";

import PressableScale from "./PressableScale";
import { LANGS, LangCode, setAppLanguage } from "@/src/i18n";
import { C, R, SP } from "@/src/theme";

export default function LanguagePicker({ testID }: { testID?: string }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.language || "en").split("-")[0] as LangCode;

  return (
    <Animated.View entering={FadeIn.duration(220)} testID={testID} style={styles.wrap}>
      <Text style={styles.label}>{t("settings.language")}</Text>
      <Text style={styles.sub}>{t("settings.languageSubtitle")}</Text>
      <View style={styles.list}>
        {LANGS.map((l) => {
          const active = l.code === current;
          return (
            <PressableScale
              key={l.code}
              testID={`lang-option-${l.code}`}
              onPress={() => setAppLanguage(l.code)}
              style={[styles.row, active && styles.rowActive]}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.native, active && styles.nativeActive]}>{l.native}</Text>
                <Text style={[styles.name, active && styles.nameActive]}>{l.name}</Text>
              </View>
              {active && (
                <Animated.View entering={ZoomIn.duration(180)} exiting={FadeOut.duration(120)}>
                  <Ionicons name="checkmark-circle" size={22} color={C.onSurface} />
                </Animated.View>
              )}
            </PressableScale>
          );
        })}
      </View>
      {Platform.OS !== "web" && (
        <Text style={styles.hint}>{t("common.success")} — {t("common.ok")}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: SP.xl, gap: SP.sm },
  label: { fontSize: 18, fontWeight: "800", color: C.onSurface },
  sub: { fontSize: 13, color: C.muted, marginBottom: SP.sm },
  list: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.surface,
  },
  rowActive: { backgroundColor: C.surface2 },
  rowMain: { flex: 1 },
  native: { fontSize: 15, fontWeight: "700", color: C.onSurface },
  nativeActive: { color: C.onSurface },
  name: { fontSize: 12, color: C.muted, marginTop: 2 },
  nameActive: { color: C.mutedDark },
  hint: { fontSize: 11, color: C.muted, marginTop: SP.sm, opacity: 0 },
});

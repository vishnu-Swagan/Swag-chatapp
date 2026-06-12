import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FadeInView from "@/src/components/FadeInView";
import LanguagePicker from "@/src/components/LanguagePicker";
import { Toast, useToast } from "@/src/components/Toast";
import { C, R, SP } from "@/src/theme";
import { safety } from "@/src/utils/safety";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [dfe, setDfe] = useState(true);

  useEffect(() => {
    safety
      .getSettings()
      .then((s) => setDfe(s.delete_for_everyone_enabled))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateDfe = async (v: boolean) => {
    setDfe(v);
    try {
      await safety.patchSettings({ delete_for_everyone_enabled: v });
      toast.show(v ? "Delete-for-everyone enabled" : "Delete-for-everyone disabled");
    } catch (e: any) {
      setDfe(!v);
      toast.show(e.message || "Could not update");
    }
  };

  return (
    <View style={styles.container} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="settings-back-button">
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("profile.settings")}</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.onSurface} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SP.xxl }}>
          <FadeInView delay={40}>
            <View style={{ padding: SP.xl, gap: SP.lg }}>
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={{ flex: 1, paddingRight: SP.md }}>
                    <Text style={styles.label}>{t("chats.deleteForEveryone")}</Text>
                    <Text style={styles.help}>
                      {t("settings.dfeHelp", { defaultValue: "Long-press your sent messages to remove them from both sides within 60 minutes of sending." })}
                    </Text>
                  </View>
                  <Switch
                    testID="settings-dfe-toggle"
                    value={dfe}
                    onValueChange={updateDfe}
                    trackColor={{ false: C.surface3, true: C.inverse }}
                    thumbColor="#fff"
                  />
                </View>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="shield-checkmark-outline" size={18} color={C.mutedDark} />
                <Text style={styles.infoText}>
                  {t("settings.screenshotHelp", { defaultValue: "Screenshots are always blocked on Android and detected on iOS — your conversation partner is notified when anyone tries to capture the chat or your photos." })}
                </Text>
              </View>
            </View>
          </FadeInView>

          <FadeInView delay={120}>
            <LanguagePicker testID="settings-language-picker" />
          </FadeInView>
        </ScrollView>
      )}
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP.sm,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.surface,
  },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: C.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    backgroundColor: C.surface,
  },
  row: { flexDirection: "row", alignItems: "center", padding: SP.lg },
  label: { fontSize: 15, fontWeight: "700", color: C.onSurface },
  help: { fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 17 },
  infoBox: {
    flexDirection: "row",
    gap: SP.sm,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    padding: SP.lg,
  },
  infoText: { flex: 1, fontSize: 12, color: C.mutedDark, lineHeight: 17 },
});

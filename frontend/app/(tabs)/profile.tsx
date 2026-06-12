import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { useAuth } from "@/src/context/AuthContext";
import { useSocket } from "@/src/context/SocketContext";
import { C, R, SP } from "@/src/theme";

export default function ProfileScreen() {
  const { user, signOut, refreshMe } = useAuth();
  const { connected } = useSocket();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  if (!user) return null;
  const isStaff = ["admin", "manager", "supervisor"].includes(user.role);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  const changePhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.4,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      setUploading(true);
      await api("/profile/image", {
        method: "POST",
        body: { image_base64: res.assets[0].base64 },
      });
      await refreshMe();
    } catch (e: any) {
      if (Platform.OS === "web") alert(e.message || "Could not upload");
      else Alert.alert("Failed", e.message || "Could not upload");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    try {
      setUploading(true);
      await api("/profile/image", { method: "DELETE" });
      await refreshMe();
    } catch (e: any) {
      if (Platform.OS === "web") alert(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onAvatarPress = () => {
    if (user.profile_image_base64) {
      if (Platform.OS === "web") {
        if (confirm("Change profile photo?")) changePhoto();
      } else {
        Alert.alert("Profile photo", undefined, [
          { text: "Change photo", onPress: changePhoto },
          { text: "Remove photo", style: "destructive", onPress: removePhoto },
          { text: "Cancel", style: "cancel" },
        ]);
      }
    } else {
      changePhoto();
    }
  };

  const handleDeleteAccount = () => {
    const proceed = async () => {
      try {
        await api("/auth/account", { method: "DELETE" });
        await signOut();
        router.replace("/auth");
      } catch (e: any) {
        if (Platform.OS === "web") alert(e.message || "Failed");
        else Alert.alert("Failed", e.message || "Could not delete");
      }
    };
    if (Platform.OS === "web") {
      if (
        confirm(
          "Permanently delete your account, messages and verification records? This cannot be undone.",
        )
      )
        proceed();
    } else {
      Alert.alert(
        "Delete account?",
        "This will permanently delete your account, messages, photos and verification records. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: proceed },
        ],
      );
    }
  };

  return (
    <View style={styles.container} testID="profile-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.md }]}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + SP.xxl }}
      >
        <View style={styles.hero}>
          <Pressable onPress={onAvatarPress} testID="profile-avatar-edit" style={styles.avatarWrap}>
            <Avatar
              username={user.username}
              size={88}
              inverse
              imageBase64={user.profile_image_base64}
            />
            <View style={styles.avatarBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color={C.onInverse} />
              ) : (
                <Ionicons name="camera" size={14} color={C.onInverse} />
              )}
            </View>
          </Pressable>
          <Text style={styles.username} testID="profile-username">
            @{user.username}
          </Text>
          <View style={styles.pillRow}>
            {user.verified && (
              <View style={styles.verifiedPill} testID="profile-verified-badge">
                <Ionicons name="shield-checkmark" size={14} color={C.onInverse} />
                <Text style={styles.verifiedText}>Identity Verified</Text>
              </View>
            )}
            {isStaff && (
              <View style={styles.staffPill} testID="profile-staff-badge">
                <Ionicons name="briefcase-outline" size={12} color={C.onSurface} />
                <Text style={styles.staffText}>{user.role}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={20} color={C.mutedDark} />
            <View style={styles.infoBody}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue} testID="profile-email">
                {user.email}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="globe-outline" size={20} color={C.mutedDark} />
            <View style={styles.infoBody}>
              <Text style={styles.infoLabel}>Verification Country</Text>
              <Text style={styles.infoValue}>{user.country || "—"}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={C.mutedDark} />
            <View style={styles.infoBody}>
              <Text style={styles.infoLabel}>Member Since</Text>
              <Text style={styles.infoValue}>
                {dayjs(user.created_at).format("DD MMM YYYY")}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons
              name={connected ? "radio-outline" : "cloud-offline-outline"}
              size={20}
              color={C.mutedDark}
            />
            <View style={styles.infoBody}>
              <Text style={styles.infoLabel}>Realtime Connection</Text>
              <Text style={styles.infoValue} testID="profile-connection-status">
                {connected ? "Connected" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Safety & Privacy</Text>
        <View style={styles.card}>
          <ProfileLink
            icon="shield-checkmark-outline"
            label="Privacy & Safety Settings"
            onPress={() => router.push("/settings")}
            testID="profile-settings-link"
          />
          <View style={styles.divider} />
          <ProfileLink
            icon="ban-outline"
            label="Blocked Users"
            onPress={() => router.push("/blocked")}
            testID="profile-blocked-link"
          />
          <View style={styles.divider} />
          <ProfileLink
            icon="document-text-outline"
            label="Terms & Privacy Policy"
            onPress={() => router.push("/legal")}
            testID="profile-legal-link"
          />
        </View>

        {isStaff && Platform.OS === "web" && (
          <>
            <Text style={styles.sectionLabel}>Staff</Text>
            <View style={styles.card}>
              <ProfileLink
                icon="speedometer-outline"
                label="Open Admin CRM"
                onPress={() => router.push("/admin")}
                testID="profile-admin-link"
              />
            </View>
          </>
        )}

        <Pressable
          testID="profile-signout-button"
          style={styles.signOutBtn}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={C.onSurface} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Pressable
          testID="profile-delete-button"
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={18} color={C.error} />
          <Text style={styles.deleteText}>Delete My Account & Data</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function ProfileLink({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.infoRow, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={20} color={C.mutedDark} />
      <View style={styles.infoBody}>
        <Text style={styles.infoValue}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    paddingHorizontal: SP.xl,
    paddingBottom: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
    backgroundColor: C.surface,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: C.onSurface,
    letterSpacing: -0.5,
  },
  hero: { alignItems: "center", paddingVertical: SP.xxl },
  avatarWrap: { position: "relative" },
  avatarBadge: {
    position: "absolute", right: -2, bottom: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.inverse,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.surface,
  },
  username: {
    fontSize: 22,
    fontWeight: "800",
    color: C.onSurface,
    marginTop: SP.md,
  },
  pillRow: { flexDirection: "row", gap: SP.sm, marginTop: SP.md, flexWrap: "wrap", justifyContent: "center" },
  verifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.inverse,
    borderRadius: R.pill,
    paddingHorizontal: SP.md,
    paddingVertical: 6,
  },
  verifiedText: { color: C.onInverse, fontSize: 12, fontWeight: "700" },
  staffPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: R.pill,
    paddingHorizontal: SP.md,
    paddingVertical: 5,
  },
  staffText: { color: C.onSurface, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginHorizontal: SP.xl,
    marginTop: SP.xl,
    marginBottom: SP.sm,
  },
  card: {
    marginHorizontal: SP.xl,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SP.lg,
    gap: SP.md,
  },
  infoBody: { flex: 1 },
  infoLabel: { fontSize: 12, color: C.muted },
  infoValue: {
    fontSize: 15,
    color: C.onSurface,
    fontWeight: "600",
    marginTop: 1,
  },
  divider: { height: 1, backgroundColor: C.divider, marginLeft: SP.xxxl },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    marginHorizontal: SP.xl,
    marginTop: SP.xl,
    height: 50,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  signOutText: { fontSize: 15, fontWeight: "700", color: C.onSurface },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    marginHorizontal: SP.xl,
    marginTop: SP.md,
    height: 44,
  },
  deleteText: { fontSize: 13, color: C.error, fontWeight: "600" },
});

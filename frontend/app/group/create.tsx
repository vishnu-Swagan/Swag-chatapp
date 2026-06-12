import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import Avatar from "@/src/components/Avatar";
import { C, R, SP } from "@/src/theme";

export default function CreateGroupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<"group" | "community">("community");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (!res.canceled && res.assets[0]?.base64) {
      setAvatar(res.assets[0].base64);
    }
  };

  const create = async () => {
    if (name.trim().length < 1) {
      setError("Please enter a name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const g = await api<{ id: string; name: string }>("/groups", {
        method: "POST",
        body: {
          type,
          name: name.trim(),
          description: description.trim(),
          is_public: isPublic,
          avatar_base64: avatar,
        },
      });
      router.replace(`/group/${g.id}?name=${encodeURIComponent(g.name)}`);
    } catch (e: any) {
      setError(e.message || "Could not create");
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>New {type}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.typeToggle}>
          {(["community", "group"] as const).map((tp) => (
            <Pressable
              key={tp}
              style={[styles.typeOption, type === tp && styles.typeOptionActive]}
              onPress={() => setType(tp)}
            >
              <Ionicons
                name={tp === "community" ? "people-circle" : "people"}
                size={18}
                color={type === tp ? C.onInverse : C.muted}
              />
              <Text style={[styles.typeText, type === tp && styles.typeTextActive]}>
                {tp === "community" ? "Community" : "Group"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.avatarPick} onPress={pickAvatar}>
          <Avatar username={name || "?"} size={88} imageBase64={avatar} />
          <View style={styles.avatarEdit}>
            <Ionicons name="camera" size={16} color={C.onInverse} />
          </View>
        </Pressable>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={type === "community" ? "e.g. Mumbai Founders" : "e.g. Weekend Trek Crew"}
          placeholderTextColor={C.muted}
          maxLength={80}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="What is this about?"
          placeholderTextColor={C.muted}
          multiline
          maxLength={500}
        />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Public</Text>
            <Text style={styles.switchSub}>
              {isPublic
                ? "Anyone can discover and join"
                : "Invite-only, joined via invite link"}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: C.brand, false: C.surface3 }}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.createBtn} onPress={create} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={C.onInverse} />
          ) : (
            <Text style={styles.createBtnText}>Create {type}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.lg,
    paddingBottom: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  backBtn: { padding: SP.xs },
  headerTitle: { fontSize: 18, fontWeight: "700", color: C.onSurface, textTransform: "capitalize" },
  body: { padding: SP.xl },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: C.surface2,
    borderRadius: R.md,
    padding: 4,
    marginBottom: SP.xl,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: SP.md,
    borderRadius: R.sm,
  },
  typeOptionActive: { backgroundColor: C.inverse },
  typeText: { fontSize: 14, fontWeight: "600", color: C.muted },
  typeTextActive: { color: C.onInverse },
  avatarPick: { alignSelf: "center", marginBottom: SP.xl },
  avatarEdit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.surface,
  },
  label: { fontSize: 13, fontWeight: "600", color: C.mutedDark, marginBottom: SP.sm, marginTop: SP.md },
  input: {
    backgroundColor: C.surface2,
    borderRadius: R.md,
    paddingHorizontal: SP.lg,
    paddingVertical: SP.md,
    fontSize: 16,
    color: C.onSurface,
  },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  switchRow: { flexDirection: "row", alignItems: "center", marginTop: SP.xl },
  switchLabel: { fontSize: 15, fontWeight: "600", color: C.onSurface },
  switchSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  error: { color: C.error, fontSize: 14, marginTop: SP.lg, textAlign: "center" },
  createBtn: {
    backgroundColor: C.inverse,
    borderRadius: R.pill,
    paddingVertical: SP.lg,
    alignItems: "center",
    marginTop: SP.xxl,
  },
  createBtnText: { color: C.onInverse, fontWeight: "700", fontSize: 16 },
});

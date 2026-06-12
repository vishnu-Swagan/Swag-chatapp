import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "@/src/context/AuthContext";
import { C } from "@/src/theme";

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center} testID="app-loading">
        <ActivityIndicator size="large" color={C.onSurface} />
      </View>
    );
  }
  if (!user) return <Redirect href="/auth" />;
  if (!user.verified) return <Redirect href="/verification" />;
  return <Redirect href="/(tabs)/chats" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
});

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import React from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";

import { C } from "@/src/theme";

export default function TabLayout() {
  const { t } = useTranslation();
  if (Platform.OS === "ios") {
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="chats">
          <Icon sf="message.fill" />
          <Label>{t("tabs.chats")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="communities">
          <Icon sf="person.3.fill" />
          <Label>Communities</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="requests">
          <Icon sf="person.badge.plus" />
          <Label>{t("tabs.requests")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <Icon sf="person.crop.circle" />
          <Label>{t("tabs.profile")}</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.onSurface,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        animation: "fade",
      }}
    >
      <Tabs.Screen
        name="chats"
        options={{
          title: t("tabs.chats"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{
          title: "Communities",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t("tabs.requests"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-add" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

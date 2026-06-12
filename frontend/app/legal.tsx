import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, SP } from "@/src/theme";

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

export default function LegalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container} testID="legal-screen">
      <View style={[styles.header, { paddingTop: insets.top + SP.sm }]}>
        <Pressable
          testID="legal-back-button"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={C.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Terms & Privacy Policy</Text>
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: SP.xl,
          paddingBottom: insets.bottom + SP.xxl,
        }}
      >
        <Text style={styles.updated}>Version 2026-06-01</Text>

        <Section title="1. Terms of Service">
          Swag Chat is a private messaging service for identity-verified users.
          You must be the genuine holder of the government ID you submit. You
          agree not to impersonate others, harass users, or share unlawful
          content. Accounts violating these terms may be suspended.
        </Section>

        <Section title="2. Data We Collect">
          • Account data: email, unique username, hashed password (bcrypt — we
          never store plain passwords).{"\n"}• Identity verification data: your
          government ID photo, selfie, and the AI verification result
          (biometric data, processed only with your explicit consent).{"\n"}•
          Messages and photos you exchange with your connections.{"\n"}•
          Security logs: sign-up/sign-in timestamps, IP address, device info
          and approximate location (GPS with your permission, otherwise
          IP-based).
        </Section>

        <Section title="3. Why We Collect It">
          Identity verification prevents fake and impersonating accounts.
          Security logs (time, IP, location) protect your account from
          unauthorized access and support fraud investigation. Messages are
          stored to deliver your chat history. We do not sell your data or use
          it for advertising.
        </Section>

        <Section title="4. Biometric Data Consent">
          Your selfie and ID photo are processed by an AI face-matching system
          solely to confirm you are the ID holder. They are stored securely for
          audit purposes and are never visible to other users or shared with
          third parties. Processing occurs only after you give explicit consent
          during the verification flow.
        </Section>

        <Section title="5. Security Measures">
          Passwords hashed with bcrypt; authenticated sessions use signed,
          expiring JWT tokens stored in your device&apos;s secure enclave; accounts
          lock for 15 minutes after 5 failed login attempts; all
          authentication events are audit-logged; verification attempts are
          rate-limited with anti-spoofing checks.
        </Section>

        <Section title="6. Your Rights (GDPR / DPDP)">
          You may access your data, withdraw consent, and exercise your right
          to erasure at any time: Profile → &ldquo;Delete My Account &amp; Data&rdquo;
          permanently deletes your profile, verification records, messages,
          photos and location logs. Security audit logs are anonymized (your
          identity is removed) where retention is required for security
          purposes.
        </Section>

        <Section title="7. Retention & Contact">
          Data is retained while your account is active and deleted upon
          account deletion as described above. For privacy questions or data
          requests, contact the app operator through your distribution
          channel.
        </Section>
      </ScrollView>
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
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: C.onSurface },
  updated: { fontSize: 12, color: C.muted, marginBottom: SP.lg },
  section: { marginBottom: SP.xl },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.onSurface,
    marginBottom: SP.sm,
  },
  sectionBody: { fontSize: 13, color: C.onSurface2, lineHeight: 20 },
});

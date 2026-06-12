import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Toast, useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, SP } from "@/src/theme";

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedBiometric, setAcceptedBiometric] = useState(false);

  const isSignup = mode === "signup";

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    if (isSignup) {
      if (!username.trim()) {
        setError("Pick a unique username");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (!acceptedTerms) {
        setError("You must accept the Terms & Privacy Policy");
        return;
      }
      if (!acceptedBiometric) {
        setError("You must consent to biometric verification to continue");
        return;
      }
    }
    setBusy(true);
    try {
      if (!isSignup) {
        await signIn(email.trim(), password);
      } else {
        await signUp(
          email.trim(),
          username.trim().toLowerCase(),
          password,
          acceptedTerms,
        );
      }
      router.replace("/");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const Checkbox = ({
    checked,
    onToggle,
    testID,
    children,
  }: {
    checked: boolean;
    onToggle: () => void;
    testID: string;
    children: React.ReactNode;
  }) => (
    <Pressable
      testID={testID}
      onPress={onToggle}
      style={styles.consentRow}
      hitSlop={8}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked && <Ionicons name="checkmark" size={14} color={C.onInverse} />}
      </View>
      <Text style={styles.consentText}>{children}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + SP.xxxl,
            paddingBottom: insets.bottom + SP.xxl,
          },
        ]}
        bottomOffset={80}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoBlock}>
          <View style={styles.logoSquare}>
            <Ionicons name="chatbubble-ellipses" size={30} color={C.onInverse} />
          </View>
          <Text style={styles.appName}>Swag Chat</Text>
          <Text style={styles.tagline}>
            Meet verified people you can trust.
          </Text>
        </View>

        <View style={styles.switchRow}>
          <Pressable
            testID="auth-login-tab"
            onPress={() => {
              setMode("login");
              setError(null);
            }}
            style={[styles.switchBtn, !isSignup && styles.switchActive]}
          >
            <Text
              style={[
                styles.switchText,
                !isSignup && styles.switchTextActive,
              ]}
            >
              Log In
            </Text>
          </Pressable>
          <Pressable
            testID="auth-signup-tab"
            onPress={() => {
              setMode("signup");
              setError(null);
            }}
            style={[styles.switchBtn, isSignup && styles.switchActive]}
          >
            <Text
              style={[styles.switchText, isSignup && styles.switchTextActive]}
            >
              Sign Up
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="auth-email-input"
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={C.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          {isSignup && (
            <>
              <Text style={styles.label}>Unique Username</Text>
              <View style={styles.usernameWrap}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  testID="auth-username-input"
                  style={styles.usernameInput}
                  placeholder="your_username"
                  placeholderTextColor={C.muted}
                  value={username}
                  onChangeText={(t) => setUsername(t.toLowerCase())}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Text style={styles.hint}>
                3–20 chars · lowercase letters, numbers, underscores
              </Text>
            </>
          )}

          <Text style={styles.label}>Password</Text>
          <View style={styles.pwWrap}>
            <TextInput
              testID="auth-password-input"
              style={styles.pwInput}
              placeholder={isSignup ? "Min 8 characters" : "Your password"}
              placeholderTextColor={C.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
            />
            <Pressable
              testID="auth-password-toggle"
              onPress={() => setShowPw((s) => !s)}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={showPw ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={C.mutedDark}
              />
            </Pressable>
          </View>

          {isSignup && (
            <View style={styles.consentBlock}>
              <Checkbox
                testID="auth-accept-terms"
                checked={acceptedTerms}
                onToggle={() => setAcceptedTerms((v) => !v)}
              >
                I have read and agree to the{" "}
                <Text
                  style={styles.link}
                  onPress={() => router.push("/legal")}
                >
                  Terms of Service & Privacy Policy
                </Text>
                .
              </Checkbox>
              <Checkbox
                testID="auth-accept-biometric"
                checked={acceptedBiometric}
                onToggle={() => setAcceptedBiometric((v) => !v)}
              >
                I consent to biometric identity verification (live selfie
                compared with my government ID) for fraud prevention.
              </Checkbox>
            </View>
          )}

          {error && (
            <Text testID="auth-error-text" style={styles.error}>
              {error}
            </Text>
          )}

          <Pressable
            testID="auth-submit-button"
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.85 },
              busy && { opacity: 0.6 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={C.onInverse} />
            ) : (
              <Text style={styles.ctaText}>
                {isSignup ? "Create Account" : "Log In"}
              </Text>
            )}
          </Pressable>

          {isSignup && (
            <View style={styles.noticeBox}>
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={C.mutedDark}
              />
              <Text style={styles.noticeText}>
                Every member is identity-verified. Screenshots are blocked,
                phone numbers are never required, and you control who can
                reach you.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
      <Toast message={toast.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  scroll: { paddingHorizontal: SP.xl },
  logoBlock: { alignItems: "flex-start", marginBottom: SP.xxl },
  logoSquare: {
    width: 64,
    height: 64,
    borderRadius: R.lg,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SP.lg,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: C.onSurface,
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 14, color: C.muted, marginTop: SP.xs },
  switchRow: {
    flexDirection: "row",
    backgroundColor: C.surface2,
    borderRadius: R.pill,
    padding: 4,
    marginBottom: SP.xl,
  },
  switchBtn: {
    flex: 1,
    height: 40,
    borderRadius: R.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  switchActive: { backgroundColor: C.inverse },
  switchText: { fontSize: 14, fontWeight: "600", color: C.mutedDark },
  switchTextActive: { color: C.onInverse },
  form: {},
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: C.onSurface2,
    marginBottom: SP.sm,
    marginTop: SP.md,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: SP.lg,
    fontSize: 16,
    color: C.onSurface,
    backgroundColor: C.surface,
  },
  usernameWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    height: 50,
    paddingHorizontal: SP.lg,
  },
  atSign: { fontSize: 16, color: C.muted, marginRight: 2 },
  usernameInput: {
    flex: 1,
    fontSize: 16,
    color: C.onSurface,
    height: "100%",
  },
  hint: { fontSize: 12, color: C.muted, marginTop: SP.xs },
  pwWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    height: 50,
  },
  pwInput: {
    flex: 1,
    paddingHorizontal: SP.lg,
    fontSize: 16,
    color: C.onSurface,
    height: "100%",
  },
  eyeBtn: {
    paddingHorizontal: SP.md,
    height: "100%",
    justifyContent: "center",
  },
  consentBlock: {
    marginTop: SP.xl,
    gap: SP.md,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    padding: SP.lg,
  },
  consentRow: { flexDirection: "row", gap: SP.sm, alignItems: "flex-start" },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: C.inverse, borderColor: C.inverse },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: C.onSurface2,
    lineHeight: 19,
  },
  link: { color: C.onSurface, fontWeight: "700", textDecorationLine: "underline" },
  error: {
    color: C.error,
    fontSize: 13,
    marginTop: SP.md,
    fontWeight: "500",
  },
  cta: {
    height: 52,
    borderRadius: R.pill,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SP.xl,
  },
  ctaText: { color: C.onInverse, fontSize: 16, fontWeight: "700" },
  noticeBox: {
    flexDirection: "row",
    gap: SP.sm,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    padding: SP.lg,
    marginTop: SP.xl,
    alignItems: "flex-start",
  },
  noticeText: { flex: 1, fontSize: 12, color: C.mutedDark, lineHeight: 17 },
});

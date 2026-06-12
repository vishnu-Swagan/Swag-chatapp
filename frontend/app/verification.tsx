import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { C, R, SP } from "@/src/theme";

type Country = { code: string; name: string; id_types: string[] };
type Step = "country" | "idtype" | "id" | "selfie" | "processing" | "result";

const STEP_INDEX: Record<string, number> = { country: 0, idtype: 1, id: 2, selfie: 3 };

export default function VerificationScreen() {
  const { user, refreshMe, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("country");
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [idType, setIdType] = useState<string | null>(null);
  const [idImage, setIdImage] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [settingsPrompt, setSettingsPrompt] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    api<Country[]>("/verification/countries")
      .then(setCountries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.verified) router.replace("/(tabs)/chats");
  }, [user?.verified, router]);

  const ensureCameraPermission = async (): Promise<boolean> => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const req = await ImagePicker.requestCameraPermissionsAsync();
      if (req.granted) return true;
      if (!req.canAskAgain) setSettingsPrompt(true);
      return false;
    }
    setSettingsPrompt(true);
    return false;
  };

  const pick = async (fromCamera: boolean, front = false): Promise<string | null> => {
    setPickError(null);
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        quality: 0.4,
      };
      let res: ImagePicker.ImagePickerResult;
      if (fromCamera && Platform.OS !== "web") {
        const ok = await ensureCameraPermission();
        if (!ok) return null;
        res = await ImagePicker.launchCameraAsync({
          ...opts,
          cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
        });
      } else {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (res.canceled || !res.assets?.[0]?.base64) return null;
      return res.assets[0].base64;
    } catch {
      setPickError("Could not open the camera/gallery. Please try again.");
      return null;
    }
  };

  const submit = async () => {
    if (!country || !idType || !idImage || !selfie) return;
    setStep("processing");
    try {
      const r = await api("/verification/submit", {
        method: "POST",
        body: {
          country: country.code,
          id_type: idType,
          id_image_base64: idImage,
          selfie_base64: selfie,
        },
      });
      setResult(r);
      if (r.verified) await refreshMe();
      setStep("result");
    } catch (e: any) {
      setResult({ verified: false, reason: e.message || "Verification failed" });
      setStep("result");
    }
  };

  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const renderProgress = () => {
    const idx = STEP_INDEX[step] ?? 3;
    return (
      <View style={styles.progressRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.progressBar, i <= idx ? styles.progressOn : styles.progressOff]}
          />
        ))}
      </View>
    );
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + SP.md }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Verify Identity</Text>
        <Pressable
          testID="verification-signout-button"
          onPress={async () => {
            await signOut();
            router.replace("/auth");
          }}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
      {step !== "processing" && step !== "result" && renderProgress()}
    </View>
  );

  // ---------- PROCESSING ----------
  if (step === "processing") {
    return (
      <View style={styles.container} testID="verification-processing">
        {Header}
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={C.onSurface} />
          <Text style={styles.processingTitle}>Verifying identity…</Text>
          <Text style={styles.processingSub}>
            Our AI is matching your selfie against your {idType}. This takes a
            few seconds.
          </Text>
        </View>
      </View>
    );
  }

  // ---------- RESULT ----------
  if (step === "result") {
    const ok = !!result?.verified;
    return (
      <View style={styles.container} testID="verification-result">
        {Header}
        <View style={styles.centerFill}>
          <View style={[styles.resultCircle, ok ? styles.resultOk : styles.resultFail]}>
            <Ionicons
              name={ok ? "shield-checkmark" : "close"}
              size={42}
              color={ok ? C.onInverse : C.onSurface}
            />
          </View>
          <Text style={styles.resultTitle}>
            {ok ? "Identity Verified" : "Verification Failed"}
          </Text>
          <Text style={styles.resultReason}>{result?.reason}</Text>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + SP.lg }]}>
          {ok ? (
            <Pressable
              testID="verification-continue-button"
              style={styles.cta}
              onPress={() => router.replace("/(tabs)/chats")}
            >
              <Text style={styles.ctaText}>Start Chatting</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="verification-retry-button"
              style={styles.cta}
              onPress={() => {
                setIdImage(null);
                setSelfie(null);
                setResult(null);
                setStep("id");
              }}
            >
              <Text style={styles.ctaText}>Retry Capture</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ---------- COUNTRY ----------
  if (step === "country") {
    return (
      <View style={styles.container} testID="verification-country-step">
        {Header}
        <Text style={styles.stepTitle}>Where was your ID issued?</Text>
        <TextInput
          testID="verification-country-search"
          style={styles.search}
          placeholder="Search country"
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + SP.xxl }}
        >
          {filteredCountries.map((c) => (
            <Pressable
              key={c.code}
              testID={`verification-country-${c.code}`}
              style={[styles.row, country?.code === c.code && styles.rowActive]}
              onPress={() => {
                setCountry(c);
                setIdType(null);
                setStep("idtype");
              }}
            >
              <Text style={styles.rowText}>{c.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
          {countries.length === 0 && (
            <ActivityIndicator color={C.onSurface} style={{ marginTop: SP.xl }} />
          )}
        </ScrollView>
      </View>
    );
  }

  // ---------- ID TYPE ----------
  if (step === "idtype") {
    return (
      <View style={styles.container} testID="verification-idtype-step">
        {Header}
        <Pressable style={styles.backRow} onPress={() => setStep("country")} testID="verification-back-country">
          <Ionicons name="arrow-back" size={18} color={C.onSurface} />
          <Text style={styles.backText}>{country?.name}</Text>
        </Pressable>
        <Text style={styles.stepTitle}>Choose your ID document</Text>
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: insets.bottom + SP.xxl }}>
          {country?.id_types.map((t) => (
            <Pressable
              key={t}
              testID={`verification-idtype-${t.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`}
              style={[styles.row, idType === t && styles.rowActive]}
              onPress={() => {
                setIdType(t);
                setStep("id");
              }}
            >
              <Ionicons name="card-outline" size={20} color={C.onSurface} />
              <Text style={[styles.rowText, { marginLeft: SP.md, flex: 1 }]}>{t}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ---------- ID PHOTO / SELFIE ----------
  const isIdStep = step === "id";
  const img = isIdStep ? idImage : selfie;
  const setImg = isIdStep ? setIdImage : setSelfie;

  return (
    <View style={styles.container} testID={isIdStep ? "verification-id-step" : "verification-selfie-step"}>
      {Header}
      <Pressable
        style={styles.backRow}
        onPress={() => setStep(isIdStep ? "idtype" : "id")}
        testID="verification-back-button"
      >
        <Ionicons name="arrow-back" size={18} color={C.onSurface} />
        <Text style={styles.backText}>{isIdStep ? idType : "ID photo"}</Text>
      </Pressable>
      <Text style={styles.stepTitle}>
        {isIdStep ? `Photo of your ${idType}` : "Take a selfie"}
      </Text>
      <Text style={styles.stepSub}>
        {isIdStep
          ? "Make sure the photo on the ID and all text are clearly visible."
          : "Face the camera straight on, good lighting, no hat or glasses."}
      </Text>

      <View style={styles.captureArea}>
        {img ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${img}` }}
            style={isIdStep ? styles.idPreview : styles.selfiePreview}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.captureFrame, !isIdStep && styles.selfieFrame]}>
            <Ionicons
              name={isIdStep ? "card-outline" : "person-outline"}
              size={48}
              color={C.muted}
            />
          </View>
        )}
        {pickError && <Text style={styles.error}>{pickError}</Text>}
        {settingsPrompt && (
          <View style={styles.settingsBox}>
            <Text style={styles.settingsText}>
              Camera access is blocked. Enable it in Settings to continue.
            </Text>
            <Pressable
              testID="verification-open-settings-button"
              style={styles.settingsBtn}
              onPress={() => Linking.openSettings()}
            >
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SP.lg }]}>
        <View style={styles.captureBtns}>
          {Platform.OS !== "web" && (
            <Pressable
              testID="verification-camera-button"
              style={styles.secondaryBtn}
              onPress={async () => {
                const b = await pick(true, !isIdStep);
                if (b) setImg(b);
              }}
            >
              <Ionicons name="camera-outline" size={20} color={C.onSurface} />
              <Text style={styles.secondaryText}>
                {isIdStep ? "Take Photo" : "Take Selfie"}
              </Text>
            </Pressable>
          )}
          <Pressable
            testID="verification-gallery-button"
            style={styles.secondaryBtn}
            onPress={async () => {
              const b = await pick(false);
              if (b) setImg(b);
            }}
          >
            <Ionicons name="images-outline" size={20} color={C.onSurface} />
            <Text style={styles.secondaryText}>From Gallery</Text>
          </Pressable>
        </View>
        <Pressable
          testID={isIdStep ? "verification-id-continue-button" : "verification-submit-button"}
          style={[styles.cta, !img && styles.ctaDisabled]}
          disabled={!img}
          onPress={() => {
            if (isIdStep) setStep("selfie");
            else submit();
          }}
        >
          <Text style={styles.ctaText}>
            {isIdStep ? "Continue" : "Verify Me"}
          </Text>
        </Pressable>
      </View>
    </View>
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: C.onSurface },
  signOut: { fontSize: 13, color: C.muted, fontWeight: "600" },
  progressRow: { flexDirection: "row", gap: SP.sm, marginTop: SP.md },
  progressBar: { flex: 1, height: 4, borderRadius: R.pill },
  progressOn: { backgroundColor: C.inverse },
  progressOff: { backgroundColor: C.surface3 },
  stepTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.onSurface,
    paddingHorizontal: SP.xl,
    marginTop: SP.xl,
  },
  stepSub: {
    fontSize: 14,
    color: C.muted,
    paddingHorizontal: SP.xl,
    marginTop: SP.sm,
    lineHeight: 20,
  },
  search: {
    marginHorizontal: SP.xl,
    marginTop: SP.lg,
    height: 44,
    borderRadius: R.md,
    backgroundColor: C.surface2,
    paddingHorizontal: SP.lg,
    fontSize: 15,
    color: C.onSurface,
  },
  list: { flex: 1, marginTop: SP.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SP.lg,
    paddingHorizontal: SP.xl,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  rowActive: { backgroundColor: C.surface2 },
  rowText: { fontSize: 16, color: C.onSurface, fontWeight: "500" },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingHorizontal: SP.xl,
    marginTop: SP.lg,
  },
  backText: { fontSize: 14, color: C.mutedDark, fontWeight: "600" },
  captureArea: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.xl },
  captureFrame: {
    width: 260,
    height: 170,
    borderRadius: R.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: C.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
  },
  selfieFrame: { width: 200, height: 260, borderRadius: 130 },
  idPreview: { width: 280, height: 180, borderRadius: R.md },
  selfiePreview: { width: 200, height: 260, borderRadius: 130 },
  error: { color: C.error, fontSize: 13, marginTop: SP.md },
  settingsBox: {
    marginTop: SP.lg,
    backgroundColor: C.surface2,
    borderRadius: R.md,
    padding: SP.lg,
    alignItems: "center",
    gap: SP.md,
  },
  settingsText: { fontSize: 13, color: C.onSurface2, textAlign: "center" },
  settingsBtn: {
    backgroundColor: C.inverse,
    borderRadius: R.pill,
    paddingHorizontal: SP.xl,
    paddingVertical: SP.sm,
  },
  settingsBtnText: { color: C.onInverse, fontWeight: "600", fontSize: 13 },
  footer: { paddingHorizontal: SP.xl, gap: SP.md },
  captureBtns: { flexDirection: "row", gap: SP.md },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    gap: SP.sm,
    height: 48,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 14, fontWeight: "600", color: C.onSurface },
  cta: {
    height: 52,
    borderRadius: R.pill,
    backgroundColor: C.inverse,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: { opacity: 0.3 },
  ctaText: { color: C.onInverse, fontSize: 16, fontWeight: "700" },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: SP.xxl },
  processingTitle: { fontSize: 20, fontWeight: "700", color: C.onSurface, marginTop: SP.xl },
  processingSub: { fontSize: 14, color: C.muted, textAlign: "center", marginTop: SP.sm, lineHeight: 20 },
  resultCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  resultOk: { backgroundColor: C.inverse },
  resultFail: { backgroundColor: C.surface3 },
  resultTitle: { fontSize: 24, fontWeight: "800", color: C.onSurface, marginTop: SP.xl },
  resultReason: { fontSize: 14, color: C.muted, textAlign: "center", marginTop: SP.sm, lineHeight: 20 },
});

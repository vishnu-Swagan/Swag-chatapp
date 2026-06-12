import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ar from "./locales/ar.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import hi from "./locales/hi.json";

export const LANGS = [
  { code: "en", name: "English", native: "English", rtl: false },
  { code: "es", name: "Spanish", native: "Español", rtl: false },
  { code: "fr", name: "French", native: "Français", rtl: false },
  { code: "hi", name: "Hindi", native: "हिन्दी", rtl: false },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
] as const;

export type LangCode = (typeof LANGS)[number]["code"];

const STORAGE_KEY = "swagchat.language";

function detectDeviceLang(): LangCode {
  try {
    const locales = Localization.getLocales?.() ?? [];
    for (const l of locales) {
      const code = (l.languageCode || "").toLowerCase();
      if (LANGS.find((x) => x.code === code)) return code as LangCode;
    }
  } catch {
    /* ignore */
  }
  return "en";
}

export async function initI18n() {
  let lng: LangCode = "en";
  try {
    const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as LangCode | null;
    lng = stored && LANGS.find((l) => l.code === stored) ? stored : detectDeviceLang();
  } catch {
    lng = detectDeviceLang();
  }

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      compatibilityJSON: "v4",
      resources: {
        en: { translation: en },
        es: { translation: es },
        fr: { translation: fr },
        hi: { translation: hi },
        ar: { translation: ar },
      },
      lng,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  } else {
    await i18n.changeLanguage(lng);
  }
  return lng;
}

export async function setAppLanguage(code: LangCode) {
  await AsyncStorage.setItem(STORAGE_KEY, code);
  await i18n.changeLanguage(code);
}

export default i18n;

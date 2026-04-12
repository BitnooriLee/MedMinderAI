"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import esCommon from "@/locales/es/common.json";
import koCommon from "@/locales/ko/common.json";

const resources = {
  en: { common: enCommon },
  ko: { common: koCommon },
  es: { common: esCommon },
} as const;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    supportedLngs: ["en", "ko", "es"],
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
  });
}

export default i18n;

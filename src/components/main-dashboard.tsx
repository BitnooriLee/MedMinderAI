"use client";

import { Camera } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { analyzePrescription, saveVerifiedMedication } from "@/app/actions/medication";
import { AnalyzingProgress } from "@/components/AnalyzingProgress";
import { PushNotificationBanner } from "@/components/dashboard/PushNotificationBanner";
import { TodayScheduleSection } from "@/components/dashboard/TodayScheduleSection";
import { CorrectionForm } from "@/components/CorrectionForm";
import { VerificationModal } from "@/components/VerificationModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnalyzePrescriptionResult } from "@/lib/prescription/types";

const languages = [
  { code: "en" as const, labelKey: "lang_en" as const },
  { code: "ko" as const, labelKey: "lang_ko" as const },
  { code: "es" as const, labelKey: "lang_es" as const },
];

export function MainDashboard() {
  const { t, i18n } = useTranslation("common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyzeResult, setAnalyzeResult] =
    useState<AnalyzePrescriptionResult | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [banner, setBanner] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const lang = i18n.language.split("-")[0] ?? "en";
    document.documentElement.lang = lang;
  }, [i18n.language]);

  useEffect(() => {
    if (!isAnalyzing) {
      setAnalyzeStep(0);
      return;
    }
    setAnalyzeStep(0);
    const a = window.setTimeout(() => setAnalyzeStep(1), 2800);
    const b = window.setTimeout(() => setAnalyzeStep(2), 5600);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [isAnalyzing]);

  const openScanner = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      setBanner(null);
      setIsAnalyzing(true);
      setAnalyzeResult(null);

      const formData = new FormData();
      formData.append("image", file);

      try {
        const result = await analyzePrescription(formData);
        setAnalyzeResult(result);
        setCorrectionOpen(false);
        setVerifyOpen(true);
      } catch {
        setAnalyzeResult({
          ok: false,
          code: "PARSE_FAILED",
          message: t("scan_network_error"),
        });
        setCorrectionOpen(false);
        setVerifyOpen(true);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [t]
  );

  const handleConfirm = useCallback(async () => {
    if (!analyzeResult?.ok) return;
    setIsSaving(true);
    setBanner(null);
    try {
      const res = await saveVerifiedMedication(
        analyzeResult.parsed,
        i18n.language
      );
      if (res.ok) {
        setVerifyOpen(false);
        setCorrectionOpen(false);
        setAnalyzeResult(null);
        setBanner({ tone: "success", message: t("scan_save_success") });
      } else {
        const key =
          res.code === "NOT_AUTHENTICATED"
            ? "scan_save_error_auth"
            : res.code === "NO_PROFILE"
              ? "scan_save_error_profile"
              : "scan_save_error_generic";
        setBanner({ tone: "error", message: t(key) });
      }
    } catch {
      setBanner({ tone: "error", message: t("scan_save_error_generic") });
    } finally {
      setIsSaving(false);
    }
  }, [analyzeResult, i18n.language, t]);

  const handleRequestEdit = useCallback(() => {
    setVerifyOpen(false);
    setCorrectionOpen(true);
  }, []);

  const handleDismissModal = useCallback(() => {
    setVerifyOpen(false);
    setCorrectionOpen(false);
    setAnalyzeResult(null);
  }, []);

  const handleCorrectionSaveSuccess = useCallback(() => {
    setCorrectionOpen(false);
    setVerifyOpen(false);
    setAnalyzeResult(null);
    setBanner({ tone: "success", message: t("scan_save_success") });
  }, [t]);

  const handleBackToVerification = useCallback(() => {
    setCorrectionOpen(false);
    setVerifyOpen(true);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8 pb-28">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        capture="environment"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={onFileSelected}
      />

      {isAnalyzing ? <AnalyzingProgress activeStep={analyzeStep} /> : null}

      <VerificationModal
        open={verifyOpen}
        result={analyzeResult}
        onConfirm={handleConfirm}
        onRequestEdit={handleRequestEdit}
        onDismiss={handleDismissModal}
        isSaving={isSaving}
      />

      {correctionOpen && analyzeResult?.ok ? (
        <CorrectionForm
          result={analyzeResult}
          locale={i18n.language}
          onSaveSuccess={handleCorrectionSaveSuccess}
          onBackToVerification={handleBackToVerification}
          onAbandon={handleDismissModal}
        />
      ) : null}

      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {t("appTitle")}
        </p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          {t("tagline")}
        </h1>
      </header>

      <TodayScheduleSection />

      {banner ? (
        <div
          role="status"
          className={
            banner.tone === "success"
              ? "rounded-2xl border-2 border-emerald-800 bg-emerald-50 p-4 text-[20px] font-bold text-emerald-950 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-50"
              : "rounded-2xl border-2 border-red-800 bg-red-50 p-4 text-[20px] font-bold text-red-950 dark:border-red-500 dark:bg-red-950/30 dark:text-red-50"
          }
        >
          {banner.message}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-4">
        <Button
          type="button"
          onClick={openScanner}
          disabled={isAnalyzing}
          className="flex min-h-[72px] min-w-[min(100%,280px)] flex-col items-center justify-center gap-3 rounded-2xl px-8 py-6 text-[22px] font-extrabold shadow-lg sm:min-h-[80px] sm:text-2xl"
          aria-label={t("scan_prescription_aria")}
        >
          <Camera className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" strokeWidth={2.25} aria-hidden />
          {t("scan_prescription_cta")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("appTitle")}</CardTitle>
          <CardDescription>{t("accessibility_note")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            className="flex flex-wrap gap-3"
            role="group"
            aria-label={t("scan_language_group")}
          >
            {languages.map(({ code, labelKey }) => (
              <Button
                key={code}
                type="button"
                variant={i18n.language.startsWith(code) ? "default" : "outline"}
                size="default"
                className="min-h-12 shrink-0 text-lg"
                onClick={() => void i18n.changeLanguage(code)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <PushNotificationBanner />
    </div>
  );
}

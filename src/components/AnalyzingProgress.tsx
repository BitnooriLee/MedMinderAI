"use client";

import { useTranslation } from "react-i18next";

type AnalyzingProgressProps = {
  activeStep: number;
};

const STEP_KEYS = [
  "scan_analyzing_step1",
  "scan_analyzing_step2",
  "scan_analyzing_step3",
] as const;

export function AnalyzingProgress({ activeStep }: AnalyzingProgressProps) {
  const { t } = useTranslation("common");
  const safeIndex = Math.min(
    Math.max(activeStep, 0),
    STEP_KEYS.length - 1
  );

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 bg-background/95 px-6 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="h-16 w-16 shrink-0 rounded-full border-4 border-muted border-t-primary animate-spin"
        aria-hidden
      />
      <p className="max-w-md text-[22px] font-bold leading-snug text-foreground sm:text-2xl">
        {t(STEP_KEYS[safeIndex])}
      </p>
      <p
        className="text-[20px] font-bold tabular-nums text-muted-foreground"
        aria-label={t("scan_analyzing_steps_label")}
      >
        {safeIndex + 1} / {STEP_KEYS.length}
      </p>
    </div>
  );
}

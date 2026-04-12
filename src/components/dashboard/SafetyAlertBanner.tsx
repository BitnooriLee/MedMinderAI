"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { DdiFinding } from "@/lib/prescription/ddi-checker";

import { cn } from "@/lib/utils";

export type SafetyAlertBannerProps = {
  findings: DdiFinding[];
  onOpenDetails: () => void;
};

export function SafetyAlertBanner({ findings, onOpenDetails }: SafetyAlertBannerProps) {
  const { t } = useTranslation("common");

  if (!findings.length) return null;

  const primary = findings[0]!;
  const more = findings.length - 1;
  const isHigh = findings.some((f) => f.severity === "high");

  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className={cn(
        "flex w-full items-start gap-4 rounded-2xl border-4 px-4 py-5 text-left shadow-md outline-none ring-offset-2 transition focus-visible:ring-4",
        isHigh
          ? "border-red-950 bg-red-600 text-white focus-visible:ring-red-300 dark:border-red-400 dark:bg-red-700 dark:text-white"
          : "border-amber-950 bg-amber-500 text-amber-950 focus-visible:ring-amber-200 dark:border-amber-400 dark:bg-amber-600 dark:text-amber-950"
      )}
      aria-label={t("ddi_banner_aria")}
    >
      <AlertTriangle
        className="mt-0.5 h-12 w-12 shrink-0 sm:h-14 sm:w-14"
        strokeWidth={2.5}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-90">
          {t("ddi_banner_kicker")}
        </span>
        <span className="text-[20px] font-extrabold leading-snug sm:text-[22px]">
          {t("ddi_banner_pair", { drugA: primary.drugA, drugB: primary.drugB })}
        </span>
        <span className="flex flex-col gap-1 text-lg font-bold underline decoration-2 underline-offset-4">
          {more > 0 ? <span>{t("ddi_banner_more", { count: more })}</span> : null}
          <span>{t("ddi_banner_tap")}</span>
        </span>
      </span>
    </button>
  );
}

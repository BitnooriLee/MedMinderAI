"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { DdiFinding } from "@/lib/prescription/ddi-checker";
import { cn } from "@/lib/utils";

export type DdiDetailModalProps = {
  open: boolean;
  findings: DdiFinding[];
  onClose: () => void;
};

export function DdiDetailModal({ open, findings, onClose }: DdiDetailModalProps) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(
      "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])"
    );
    node?.focus();
  }, [open]);

  if (!open || !findings.length) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 px-3 py-6 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(92dvh,840px)] w-full max-w-lg overflow-y-auto rounded-2xl border-4 border-red-900 bg-card p-6 text-card-foreground shadow-2xl dark:border-red-500"
      >
        <h2 id={titleId} className="text-2xl font-extrabold leading-tight text-foreground">
          {t("ddi_modal_title")}
        </h2>
        <p className="mt-3 text-lg font-semibold leading-relaxed text-muted-foreground">
          {t("ddi_modal_disclaimer")}
        </p>

        <div className="mt-8 flex flex-col gap-10" role="list">
          {findings.map((f, idx) => (
            <section
              key={`${f.drugA}-${f.drugB}-${idx}`}
              role="listitem"
              className={cn(
                "rounded-2xl border-2 p-5",
                f.severity === "high"
                  ? "border-red-800 bg-red-50 dark:border-red-500 dark:bg-red-950/40"
                  : "border-amber-800 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/30"
              )}
            >
              <p className="text-[20px] font-extrabold leading-snug text-foreground sm:text-[22px]">
                {t("ddi_banner_pair", { drugA: f.drugA, drugB: f.drugB })}
              </p>
              <p className="mt-2 text-lg font-bold text-foreground">
                {t("ddi_modal_source_label", { drug: f.labelSourceDrug })}
              </p>

              <h3 className="mt-6 text-xl font-extrabold text-foreground">
                {t("ddi_modal_symptoms_heading")}
              </h3>
              <ul className="mt-3 list-disc space-y-3 pl-6 text-[20px] font-bold leading-relaxed marker:text-foreground">
                {f.symptomBullets.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <h3 className="mt-6 text-xl font-extrabold text-foreground">
                {t("ddi_modal_excerpt_heading")}
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-lg font-semibold leading-relaxed text-foreground">
                {f.labelExcerpt}
              </p>

              <h3 className="mt-6 text-xl font-extrabold text-foreground">
                {t("ddi_modal_reports_heading")}
              </h3>
              <p className="mt-3 text-lg font-bold leading-relaxed text-foreground">
                {f.coReportTotal != null
                  ? t("ddi_modal_reports_value", { count: f.coReportTotal })
                  : t("ddi_modal_reports_unknown")}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-10">
          <Button
            type="button"
            size="lg"
            className="min-h-16 w-full text-2xl font-extrabold"
            onClick={onClose}
          >
            {t("ddi_modal_close")}
          </Button>
        </div>
      </div>
    </div>
  );
}

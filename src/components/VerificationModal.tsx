"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { AnalyzePrescriptionResult } from "@/lib/prescription/types";
import { cn } from "@/lib/utils";

export type VerificationModalProps = {
  open: boolean;
  result: AnalyzePrescriptionResult | null;
  onConfirm: () => void;
  onRequestEdit: () => void;
  onDismiss?: () => void;
  isSaving?: boolean;
};

export function VerificationModal({
  open,
  result,
  onConfirm,
  onRequestEdit,
  onDismiss,
  isSaving = false,
}: VerificationModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(
      "button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])"
    );
    node?.focus();
  }, [open]);

  if (!open || !result) return null;

  if (!result.ok) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-6 sm:items-center"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onDismiss?.();
        }}
      >
        <div
          ref={panelRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="w-full max-w-lg rounded-2xl border-2 border-border bg-card p-6 text-card-foreground shadow-xl"
        >
          <h2 id={titleId} className="text-2xl font-bold leading-snug">
            분석할 수 없습니다
          </h2>
          <p id={descId} className="mt-4 text-2xl leading-relaxed text-foreground">
            {result.message}
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button
              type="button"
              size="lg"
              className="min-h-16 text-2xl font-bold"
              onClick={() => onDismiss?.()}
            >
              닫기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { parsed, fda_verification_status, fda_match, confidence_score } = result;

  const showFdaMissing =
    fda_verification_status === "not_found" ||
    fda_verification_status === "unverified";

  const fdaBannerText =
    fda_verification_status === "unverified"
      ? "공식 데이터베이스 확인을 완료하지 못했습니다. 네트워크 또는 이용 제한일 수 있으며, 결과는 미검증입니다. 직접 확인이 필요합니다."
      : "공식 데이터베이스에서 찾을 수 없습니다. 직접 확인이 필요합니다.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-3 py-6 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-2xl border-2 border-foreground/20 bg-background p-6 text-foreground shadow-xl"
      >
        <h2 id={titleId} className="text-2xl font-extrabold tracking-tight">
          처방 내용 확인
        </h2>
        <p className="mt-2 text-xl font-semibold text-foreground/90">
          아래 내용이 처방전과 같은지 확인해 주세요.
        </p>

        {showFdaMissing && (
          <div
            className="mt-5 rounded-xl border-2 border-amber-600 bg-amber-50 p-4 text-amber-950 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-50"
            role="status"
          >
            <p className="text-2xl font-bold leading-snug">{fdaBannerText}</p>
          </div>
        )}

        <dl className="mt-6 space-y-5">
          <div>
            <dt className="text-xl font-bold text-foreground/80">약 이름</dt>
            <dd className="mt-1 text-3xl font-extrabold leading-snug text-foreground">
              {parsed.drug_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xl font-bold text-foreground/80">용량</dt>
            <dd className="mt-1 text-3xl font-bold leading-snug">{parsed.dosage || "—"}</dd>
          </div>
          <div>
            <dt className="text-xl font-bold text-foreground/80">복용 빈도</dt>
            <dd className="mt-1 text-3xl font-bold leading-snug">
              {parsed.frequency || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xl font-bold text-foreground/80">전체 지시</dt>
            <dd className="mt-1 text-2xl font-semibold leading-relaxed">
              {parsed.raw_instructions || "—"}
            </dd>
          </div>
          {fda_match && fda_verification_status === "verified" && (
            <div>
              <dt className="text-xl font-bold text-foreground/80">FDA 라벨 일치</dt>
              <dd className="mt-1 text-2xl font-bold leading-snug">
                {fda_match.matched_name}{" "}
                <span className="text-xl font-semibold text-foreground/80">
                  ({fda_match.match_type})
                </span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xl font-bold text-foreground/80">신뢰도 점수</dt>
            <dd className="mt-1 text-3xl font-extrabold tabular-nums">
              {Math.round(confidence_score * 100)}%
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col gap-4">
          <Button
            type="button"
            size="lg"
            className={cn(
              "min-h-16 border-2 border-emerald-900 bg-emerald-600 text-2xl font-extrabold text-white",
              "hover:bg-emerald-700 focus-visible:ring-emerald-300"
            )}
            disabled={isSaving}
            onClick={onConfirm}
          >
            네, 맞습니다
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={isSaving}
            className={cn(
              "min-h-16 border-2 border-red-900 bg-neutral-200 text-2xl font-extrabold text-red-900",
              "hover:bg-neutral-300 dark:border-red-400 dark:bg-neutral-900 dark:text-red-200 dark:hover:bg-neutral-800"
            )}
            onClick={onRequestEdit}
          >
            아니요, 수정할게요
          </Button>
        </div>
      </div>
    </div>
  );
}

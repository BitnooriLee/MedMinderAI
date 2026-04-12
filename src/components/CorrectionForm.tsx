"use client";

import { CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { saveVerifiedMedication } from "@/app/actions/medication";
import { Button } from "@/components/ui/button";
import type { AnalyzePrescriptionSuccess, ParsedPrescription } from "@/lib/prescription/types";
import { cn } from "@/lib/utils";

const fieldClass =
  "box-border min-h-[60px] w-full rounded-xl border-2 border-foreground/25 bg-background px-4 py-3 text-[22px] font-semibold leading-snug text-foreground shadow-sm outline-none ring-offset-2 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary";

type Step = "edit" | "confirm" | "success";

export type CorrectionFormProps = {
  result: AnalyzePrescriptionSuccess;
  locale: string;
  onSaveSuccess: () => void;
  onBackToVerification: () => void;
  onAbandon: () => void;
};

function normalizeHint(s: string): string {
  return s.trim().toLowerCase();
}

export function CorrectionForm({
  result,
  locale,
  onSaveSuccess,
  onBackToVerification,
  onAbandon,
}: CorrectionFormProps) {
  const editTitleId = useId();
  const confirmTitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const drugInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("edit");
  const [drugName, setDrugName] = useState(result.parsed.drug_name);
  const [dosage, setDosage] = useState(result.parsed.dosage);
  const [frequency, setFrequency] = useState(result.parsed.frequency);
  const [rawInstructions, setRawInstructions] = useState(result.parsed.raw_instructions);
  const [listOpen, setListOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredSuggestions = useMemo(() => {
    const suggestions = result.fda_suggestions ?? [];
    const q = normalizeHint(drugName);
    if (!suggestions.length) return [];
    if (!q) return suggestions.slice(0, 10);
    return suggestions
      .filter((name) => normalizeHint(name).includes(q) || q.includes(normalizeHint(name)))
      .slice(0, 10);
  }, [drugName, result.fda_suggestions]);

  useEffect(() => {
    if (step !== "edit") return;
    drugInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!listOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const root = panelRef.current;
      if (!root?.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [listOpen]);

  const buildParsed = useCallback((): ParsedPrescription => {
    return {
      drug_name: drugName.trim(),
      dosage: dosage.trim(),
      frequency: frequency.trim(),
      raw_instructions: rawInstructions.trim(),
    };
  }, [dosage, drugName, frequency, rawInstructions]);

  const canSubmit =
    drugName.trim().length > 0 &&
    dosage.trim().length > 0 &&
    frequency.trim().length > 0;

  const handleSaveClick = () => {
    setSaveError(null);
    if (!canSubmit) {
      setSaveError(
        "약 이름·용량·복용 빈도를 모두 적어 주세요. / Please fill drug name, dose, and schedule. / Escriba el medicamento, la dosis y la frecuencia."
      );
      return;
    }
    setStep("confirm");
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await saveVerifiedMedication(buildParsed(), locale);
      if (res.ok) {
        setStep("success");
      } else {
        const msg =
          res.code === "NOT_AUTHENTICATED"
            ? "로그인이 필요합니다. / Sign in required. / Inicie sesión."
            : res.code === "NO_PROFILE"
              ? "프로필을 준비 중입니다. 잠시 후 다시 시도해 주세요. / Profile loading. Try again. / Perfil no listo."
              : "저장하지 못했습니다. 연결을 확인해 주세요. / Save failed. Check connection. / No se pudo guardar.";
        setSaveError(msg);
        setStep("edit");
      }
    } catch {
      setSaveError(
        "저장하지 못했습니다. / Save failed. / No se pudo guardar."
      );
      setStep("edit");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (step !== "success") return;
    const t = window.setTimeout(() => {
      onSaveSuccess();
    }, 2600);
    return () => window.clearTimeout(t);
  }, [onSaveSuccess, step]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 px-3 py-6 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onAbandon();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          step === "edit" ? editTitleId : step === "confirm" ? confirmTitleId : undefined
        }
        className="box-border max-h-[min(100dvh-2rem,920px)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border-2 border-foreground/20 bg-background p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-foreground shadow-xl [scroll-padding-block:1rem]"
      >
        {step === "success" ? (
          <div
            className="flex min-h-[280px] flex-col items-center justify-center gap-8 py-10 text-center"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2
              className="h-28 w-28 shrink-0 text-emerald-600 dark:text-emerald-400"
              strokeWidth={2.25}
              aria-hidden
            />
            <p className="text-4xl font-extrabold leading-tight text-emerald-800 dark:text-emerald-200">
              저장되었습니다!
            </p>
            <p className="text-3xl font-bold text-emerald-900/90 dark:text-emerald-100/90">
              Saved successfully!
            </p>
            <p className="text-3xl font-bold text-emerald-900/90 dark:text-emerald-100/90">
              ¡Guardado correctamente!
            </p>
            <p className="text-xl font-semibold text-foreground/80">
              잠시 후 처음 화면으로 돌아갑니다… / Returning to your dashboard…
            </p>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="flex flex-col gap-8 py-4">
            <h2
              id={confirmTitleId}
              className="text-center text-3xl font-extrabold leading-snug"
            >
              저장하시겠습니까?
            </h2>
            <p className="text-center text-2xl font-bold leading-relaxed text-foreground/90">
              Save these changes? / ¿Guardar estos datos?
            </p>
            <dl className="space-y-4 rounded-xl border-2 border-foreground/15 bg-muted/40 p-4">
              <div>
                <dt className="text-lg font-bold text-foreground/70">약 이름</dt>
                <dd className="text-2xl font-extrabold">{drugName.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-lg font-bold text-foreground/70">용량</dt>
                <dd className="text-2xl font-bold">{dosage.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-lg font-bold text-foreground/70">복용 빈도</dt>
                <dd className="text-2xl font-bold">{frequency.trim() || "—"}</dd>
              </div>
            </dl>
            <div className="flex flex-col gap-4">
              <Button
                type="button"
                size="lg"
                disabled={saving}
                className="min-h-16 text-2xl font-extrabold"
                onClick={handleConfirmSave}
              >
                예, 저장합니다 / Yes, save / Sí, guardar
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                disabled={saving}
                className="min-h-16 text-2xl font-bold"
                onClick={() => setStep("edit")}
              >
                아니요, 더 고칠게요 / No, keep editing / No, seguir editando
              </Button>
            </div>
          </div>
        ) : null}

        {step === "edit" ? (
          <>
            <h2 id={editTitleId} className="text-2xl font-extrabold">
              처방 내용 수정
            </h2>
            <p className="mt-2 text-xl font-semibold text-foreground/85">
              아래에 처방전과 똑같이 적어 주세요. / Type what you see on the
              label. / Escriba lo que ve en la receta.
            </p>

            {saveError ? (
              <p
                className="mt-4 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-[22px] font-bold text-red-950 dark:border-red-400 dark:bg-red-950/40 dark:text-red-50"
                role="alert"
              >
                {saveError}
              </p>
            ) : null}

            <form
              className="mt-8 flex flex-col gap-10"
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveClick();
              }}
            >
              <div className="relative scroll-mt-24">
                <label className="mb-2 block space-y-1" htmlFor="corr-drug">
                  <span className="block text-[22px] font-extrabold leading-tight">
                    약 이름
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Drug name
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Nombre del medicamento
                  </span>
                </label>
                <input
                  ref={drugInputRef}
                  id="corr-drug"
                  name="drug_name"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={drugName}
                  onChange={(e) => {
                    setDrugName(e.target.value);
                    setListOpen(true);
                  }}
                  onFocus={() => setListOpen(true)}
                  className={fieldClass}
                  aria-autocomplete="list"
                  aria-controls={
                    listOpen && filteredSuggestions.length > 0 ? "fda-suggest-list" : undefined
                  }
                />
                {listOpen && filteredSuggestions.length > 0 ? (
                  <ul
                    id="fda-suggest-list"
                    role="listbox"
                    aria-label="openFDA suggestions. Tap one row to fill the drug name."
                    className="absolute z-10 mt-2 max-h-[min(320px,45dvh)] w-full overflow-y-auto rounded-xl border-2 border-primary/40 bg-card py-2 shadow-lg"
                  >
                    <li className="px-3 pb-2 text-lg font-bold text-foreground/80">
                      추천 목록 (공식 DB) · FDA suggestions · Sugerencias FDA
                    </li>
                    {filteredSuggestions.map((name) => (
                      <li key={name} role="presentation" className="px-2">
                        <button
                          type="button"
                          role="option"
                          aria-selected={drugName.trim() === name}
                          className={cn(
                            "flex min-h-[56px] w-full items-center rounded-lg px-3 text-left text-[22px] font-bold leading-snug",
                            "text-foreground hover:bg-primary/15 active:bg-primary/25"
                          )}
                          onClick={() => {
                            setDrugName(name);
                            setListOpen(false);
                          }}
                        >
                          {name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="scroll-mt-24">
                <label className="mb-2 block space-y-1" htmlFor="corr-dose">
                  <span className="block text-[22px] font-extrabold leading-tight">
                    용량 (숫자와 단위)
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Dose (number and unit, e.g. 500 mg)
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Dosis (número y unidad, p. ej. 500 mg)
                  </span>
                </label>
                <input
                  id="corr-dose"
                  name="dosage"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  className={fieldClass}
                  placeholder="500 mg"
                />
                <p className="mt-2 text-lg font-semibold text-foreground/75">
                  숫자 키패드가 뜹니다. mg 등 글자는 키보드 전환으로 입력하거나
                  라벨에서 복사해 붙여넣기 하세요. / Use keyboard switch or paste
                  for letters. / Use cambio de teclado o pegar texto.
                </p>
              </div>

              <div className="scroll-mt-24">
                <label className="mb-2 block space-y-1" htmlFor="corr-freq">
                  <span className="block text-[22px] font-extrabold leading-tight">
                    복용 빈도
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    How often to take it
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Frecuencia (veces al día, horas, etc.)
                  </span>
                </label>
                <input
                  id="corr-freq"
                  name="frequency"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className={fieldClass}
                  placeholder="하루 2회 / Twice daily / 2 veces al día"
                />
              </div>

              <div className="scroll-mt-24">
                <label className="mb-2 block space-y-1" htmlFor="corr-sig">
                  <span className="block text-[22px] font-extrabold leading-tight">
                    전체 지시 (선택)
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Full instructions (optional)
                  </span>
                  <span className="block text-xl font-bold text-foreground/80">
                    Instrucciones completas (opcional)
                  </span>
                </label>
                <textarea
                  id="corr-sig"
                  name="raw_instructions"
                  rows={4}
                  autoComplete="off"
                  value={rawInstructions}
                  onChange={(e) => setRawInstructions(e.target.value)}
                  className={cn(fieldClass, "min-h-[120px] resize-y")}
                />
              </div>

              <div className="flex flex-col gap-4 pt-2">
                <Button
                  type="submit"
                  size="lg"
                  className="min-h-16 text-2xl font-extrabold"
                >
                  저장 전 확인 / Review & save / Revisar y guardar
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="min-h-14 text-xl font-bold"
                  onClick={onBackToVerification}
                >
                  요약 다시 보기 / Back to summary / Volver al resumen
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  className="min-h-14 text-xl font-semibold text-foreground/80"
                  onClick={onAbandon}
                >
                  모두 취소 / Cancel all / Cancelar todo
                </Button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

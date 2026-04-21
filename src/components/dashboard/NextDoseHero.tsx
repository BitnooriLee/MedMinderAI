"use client";

import { CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { TodayScheduleItem } from "@/app/actions/adherence-schedule";
import { Button } from "@/components/ui/button";

import { getTimelineState, pickHeroDose } from "./schedule-hero";

function formatScheduleClock(iso: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

type Props = {
  items: TodayScheduleItem[];
  timeZone: string;
  onMarkTaken?: (logId: string) => void;
  busyId?: string | null;
};

export function NextDoseHero({ items, timeZone, onMarkTaken, busyId }: Props) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language;
  const selection = useMemo(() => pickHeroDose(items, new Date()), [items]);

  if (!selection) {
    return (
      <section
        aria-label={t("schedule_hero_section")}
        className="rounded-3xl border-2 border-dashed border-muted-foreground/40 bg-muted/30 p-6 text-center text-[20px] font-semibold text-muted-foreground whitespace-pre-line"
      >
        {t("schedule_hero_empty")}
      </section>
    );
  }

  if (selection.kind === "all_done") {
    if (!selection.lastTaken) {
      return (
        <section
          aria-label={t("schedule_hero_section")}
          className="flex min-h-[150px] flex-col justify-center rounded-3xl border-2 border-emerald-800 bg-emerald-50 p-6 text-center opacity-80 dark:border-emerald-600 dark:bg-emerald-950/40"
        >
          <CheckCircle2
            className="mx-auto mb-3 h-14 w-14 text-emerald-800 dark:text-emerald-300"
            strokeWidth={2.5}
            aria-hidden
          />
          <p className="text-[32px] font-extrabold leading-tight text-emerald-950 dark:text-emerald-50">
            {t("schedule_hero_all_done")}
          </p>
        </section>
      );
    }
    const timeLabel = formatScheduleClock(
      selection.lastTaken.scheduledTime,
      timeZone,
      locale
    );
    return (
      <section
        aria-label={t("schedule_hero_section")}
        className="flex min-h-[150px] flex-col justify-center gap-2 rounded-3xl border-2 border-emerald-900/40 bg-emerald-50/80 p-6 opacity-60 dark:border-emerald-700/50 dark:bg-emerald-950/30"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-1 h-12 w-12 shrink-0 text-emerald-800 dark:text-emerald-300"
            strokeWidth={2.5}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
              {t("schedule_hero_completed")}
            </p>
            <p className="truncate text-[32px] font-extrabold leading-tight text-emerald-950 dark:text-emerald-50">
              {selection.lastTaken.name}
            </p>
            <p className="text-[32px] font-bold tabular-nums text-emerald-900/90 dark:text-emerald-100/90">
              {timeLabel}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { item } = selection;
  const timeLabel = formatScheduleClock(item.scheduledTime, timeZone, locale);
  const heroState = getTimelineState(item, Date.now());
  const canMark = heroState !== "completed" && onMarkTaken;
  const marking = busyId === item.logId;

  return (
    <section
      aria-label={t("schedule_hero_section")}
      className="flex min-h-[150px] flex-col justify-center gap-4 rounded-3xl border-2 border-primary bg-primary/10 p-6 shadow-md dark:bg-primary/15"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-center whitespace-pre-line text-lg font-bold uppercase tracking-wide text-primary">
            {t("schedule_hero_next_label")}
          </p>
          <p className="truncate text-[32px] font-extrabold leading-tight tracking-tight text-foreground">
            {item.name}
          </p>
          <p className="text-[34px] font-black tabular-nums leading-none text-foreground">
            {timeLabel}
          </p>
          {item.dosage ? (
            <p className="mt-2 text-[20px] font-semibold text-muted-foreground">{item.dosage}</p>
          ) : null}
        </div>
      </div>
      {canMark ? (
        <Button
          type="button"
          size="lg"
          disabled={marking}
          className="min-h-[64px] w-full rounded-2xl text-[22px] font-extrabold shadow-md"
          onClick={() => void onMarkTaken(item.logId)}
        >
          {marking ? t("schedule_hero_mark_pending") : t("schedule_hero_completed")}
        </Button>
      ) : null}
    </section>
  );
}

"use client";

import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { TodayScheduleItem } from "@/app/actions/adherence-schedule";

import { getTimelineState, type TimelineVisualState } from "./schedule-hero";

function formatScheduleClock(iso: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export type { TimelineVisualState };

type Props = {
  items: TodayScheduleItem[];
  timeZone: string;
  onMarkTaken?: (logId: string) => void;
  busyId?: string | null;
};

export function DailyTimeline({ items, timeZone, onMarkTaken, busyId }: Props) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language;
  const nowMs = Date.now();

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-muted-foreground/30 bg-muted/20 p-4 text-center text-[20px] font-semibold text-muted-foreground">
        {t("schedule_timeline_empty")}
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-3 border-s-4 border-foreground/25 ps-4" aria-label={t("schedule_timeline_title")}>
      {items.map((item) => {
        const state = getTimelineState(item, nowMs);
        const timeLabel = formatScheduleClock(item.scheduledTime, timeZone, locale);
        const canTap = state !== "completed" && onMarkTaken;

        const shell =
          state === "completed"
            ? "border-emerald-900 bg-emerald-50 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-50"
            : state === "overdue"
              ? "border-red-900 bg-red-50 text-red-950 dark:border-red-500 dark:bg-red-950/40 dark:text-red-50"
              : "border-blue-900 bg-blue-50 text-blue-950 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-50";

        return (
          <li key={item.logId} className="relative">
            <span
              className="absolute -start-[25px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-foreground bg-background"
              aria-hidden
            />
            <button
              type="button"
              disabled={!canTap || busyId === item.logId}
              onClick={() => canTap && onMarkTaken?.(item.logId)}
              className={`flex w-full min-h-[72px] flex-col items-start gap-1 rounded-2xl border-2 px-4 py-4 text-left text-[20px] font-bold shadow-sm transition active:scale-[0.99] ${shell} ${
                canTap ? "cursor-pointer" : "cursor-default"
              } ${busyId === item.logId ? "opacity-70" : ""}`}
            >
              <span className="flex w-full items-center gap-2">
                {state === "completed" ? (
                  <CheckCircle2 className="h-8 w-8 shrink-0" strokeWidth={2.5} aria-hidden />
                ) : state === "overdue" ? (
                  <AlertTriangle className="h-8 w-8 shrink-0" strokeWidth={2.5} aria-hidden />
                ) : (
                  <Clock className="h-8 w-8 shrink-0" strokeWidth={2.5} aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-[22px] font-extrabold">{item.name}</span>
                <span className="shrink-0 text-[22px] font-black tabular-nums">{timeLabel}</span>
              </span>
              {item.dosage ? (
                <span className="ps-10 text-[18px] font-semibold opacity-90">{item.dosage}</span>
              ) : null}
              <span className="ps-10 text-[16px] font-bold uppercase tracking-wide">
                {state === "completed"
                  ? t("schedule_state_done")
                  : state === "overdue"
                    ? t("schedule_state_overdue")
                    : t("schedule_state_upcoming")}
                {canTap ? ` · ${t("schedule_tap_to_mark")}` : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

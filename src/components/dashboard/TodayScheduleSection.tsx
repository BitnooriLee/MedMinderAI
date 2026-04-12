"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ensureAndFetchTodaySchedule,
  markAdherenceLogTaken,
  type TodayScheduleItem,
} from "@/app/actions/adherence-schedule";
import { analyzeDdiForCurrentUser } from "@/app/actions/ddi-check";
import { triggerSuccessHaptic } from "@/lib/haptics";
import type { DdiFinding } from "@/lib/prescription/ddi-checker";

import { DailyTimeline } from "./DailyTimeline";
import { DdiDetailModal } from "./DdiDetailModal";
import { NextDoseHero } from "./NextDoseHero";
import { SafetyAlertBanner } from "./SafetyAlertBanner";

export function TodayScheduleSection() {
  const { t, i18n } = useTranslation("common");
  const [items, setItems] = useState<TodayScheduleItem[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [ddiFindings, setDdiFindings] = useState<DdiFinding[]>([]);
  const [ddiModalOpen, setDdiModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignedOut(false);
    setDdiFindings([]);
    const res = await ensureAndFetchTodaySchedule();
    if (!res.ok) {
      if (res.code === "NOT_AUTHENTICATED") {
        setItems([]);
        setSignedOut(true);
        setError(null);
      } else {
        setError(res.message);
      }
      setLoading(false);
      return;
    }
    setItems(res.items);
    setTimeZone(res.timezone);
    setLoading(false);

    const ddi = await analyzeDdiForCurrentUser(i18n.language);
    if (ddi.ok) setDdiFindings(ddi.findings);
  }, [i18n.language]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onMarkTaken = useCallback(
    async (logId: string) => {
      triggerSuccessHaptic();
      setBusyId(logId);
      try {
        const res = await markAdherenceLogTaken(logId);
        if (res.ok) await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-muted bg-muted/30 p-6 text-center text-[20px] font-bold text-muted-foreground">
        {t("schedule_loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-red-800 bg-red-50 p-4 text-[20px] font-bold text-red-950 dark:border-red-500 dark:bg-red-950/30 dark:text-red-50"
      >
        {error}
      </div>
    );
  }

  if (signedOut) {
    return (
      <div className="rounded-2xl border-2 border-muted-foreground/50 bg-muted/40 p-6 text-center text-[20px] font-bold text-foreground">
        {t("schedule_sign_in")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DdiDetailModal
        open={ddiModalOpen}
        findings={ddiFindings}
        onClose={() => setDdiModalOpen(false)}
      />
      <SafetyAlertBanner
        findings={ddiFindings}
        onOpenDetails={() => setDdiModalOpen(true)}
      />
      <NextDoseHero
        items={items}
        timeZone={timeZone}
        onMarkTaken={onMarkTaken}
        busyId={busyId}
      />
      <div>
        <h2 className="mb-3 text-xl font-extrabold tracking-tight text-foreground">
          {t("schedule_timeline_title")}
        </h2>
        <DailyTimeline
          items={items}
          timeZone={timeZone}
          onMarkTaken={onMarkTaken}
          busyId={busyId}
        />
      </div>
    </div>
  );
}

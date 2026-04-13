"use client";

import { LogIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ensureAndFetchTodaySchedule,
  markAdherenceLogTaken,
  type TodayScheduleItem,
} from "@/app/actions/adherence-schedule";
import { analyzeDdiForCurrentUser } from "@/app/actions/ddi-check";
import { Button } from "@/components/ui/button";
import { triggerSuccessHaptic } from "@/lib/haptics";
import type { DdiFinding } from "@/lib/prescription/ddi-checker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
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

  const onSignIn = useCallback(async () => {
    setSignInError(null);
    setSignInBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: origin ? `${origin}/` : undefined,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setSignInError(error.message || t("auth_sign_in_error"));
      }
    } catch {
      setSignInError(t("auth_sign_in_error"));
    } finally {
      setSignInBusy(false);
    }
  }, [t]);

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
      <div className="flex flex-col items-center gap-5 rounded-2xl border-2 border-muted-foreground/50 bg-muted/40 p-6 text-center">
        <p className="text-[20px] font-bold leading-snug text-foreground">
          {t("schedule_sign_in")}
        </p>
        <Button
          type="button"
          size="lg"
          disabled={signInBusy}
          className="min-h-[64px] w-full max-w-sm gap-3 rounded-2xl text-[22px] font-extrabold shadow-lg"
          onClick={() => void onSignIn()}
        >
          <LogIn className="h-8 w-8 shrink-0" strokeWidth={2.25} aria-hidden />
          {signInBusy ? t("auth_sign_in_busy") : t("auth_sign_in_google")}
        </Button>
        {signInError ? (
          <p
            className="text-[18px] font-bold text-red-800 dark:text-red-300"
            role="alert"
          >
            {signInError}
          </p>
        ) : null}
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

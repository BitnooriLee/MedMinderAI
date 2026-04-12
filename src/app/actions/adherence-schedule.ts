"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  frequencyToLocalSlotTimes,
  getZonedCalendarDate,
  getZonedDayRangeUtc,
  localSlotToUtcInstant,
} from "@/lib/prescription/scheduler";

export type TodayScheduleItem = {
  logId: string;
  medicationId: string;
  name: string;
  dosage: string;
  scheduledTime: string;
  status: "taken" | "missed" | "scheduled";
  takenAt: string | null;
};

export type EnsureTodayScheduleResult =
  | { ok: true; items: TodayScheduleItem[]; timezone: string }
  | {
      ok: false;
      code: "NOT_AUTHENTICATED" | "NO_PROFILE" | "DB_ERROR";
      message: string;
    };

export type MarkTakenResult =
  | { ok: true }
  | {
      ok: false;
      code: "NOT_AUTHENTICATED" | "NOT_FOUND" | "DB_ERROR";
      message: string;
    };

/**
 * Ensures scheduled rows exist for today (profile timezone) for each medication,
 * then returns today's logs joined with medication names.
 */
export async function ensureAndFetchTodaySchedule(): Promise<EnsureTodayScheduleResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      code: "NOT_AUTHENTICATED",
      message: "Sign in to view your schedule.",
    };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.timezone) {
    return {
      ok: false,
      code: "NO_PROFILE",
      message: "User profile is not ready yet.",
    };
  }

  const timeZone = profile.timezone || "UTC";
  const now = new Date();
  const { dayStartUtc, nextDayStartUtc } = getZonedDayRangeUtc(now, timeZone);
  const cal = getZonedCalendarDate(now, timeZone);

  const { data: medications, error: medErr } = await supabase
    .from("medications")
    .select("id, frequency")
    .eq("profile_id", user.id);

  if (medErr) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: medErr.message || "Could not load medications.",
    };
  }

  const rowsToUpsert: Array<{
    profile_id: string;
    medication_id: string;
    status: "scheduled";
    scheduled_time: string;
    taken_at: null;
  }> = [];

  for (const med of medications ?? []) {
    const { slotTimesLocalHHmm } = frequencyToLocalSlotTimes(med.frequency ?? "");
    for (const hhmm of slotTimesLocalHHmm) {
      const instant = localSlotToUtcInstant(cal, hhmm, timeZone);
      if (!instant) continue;
      const t = instant.getTime();
      if (t < dayStartUtc.getTime() || t >= nextDayStartUtc.getTime()) continue;
      rowsToUpsert.push({
        profile_id: user.id,
        medication_id: med.id,
        status: "scheduled",
        scheduled_time: instant.toISOString(),
        taken_at: null,
      });
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upErr } = await supabase.from("adherence_logs").upsert(rowsToUpsert, {
      onConflict: "medication_id,scheduled_time",
      ignoreDuplicates: true,
    });
    if (upErr) {
      return {
        ok: false,
        code: "DB_ERROR",
        message: upErr.message || "Could not create today's schedule.",
      };
    }
  }

  const { data: logs, error: logErr } = await supabase
    .from("adherence_logs")
    .select(
      `
      id,
      medication_id,
      status,
      scheduled_time,
      taken_at,
      medications ( name, dosage )
    `
    )
    .eq("profile_id", user.id)
    .gte("scheduled_time", dayStartUtc.toISOString())
    .lt("scheduled_time", nextDayStartUtc.toISOString())
    .order("scheduled_time", { ascending: true });

  if (logErr) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: logErr.message || "Could not load adherence logs.",
    };
  }

  const items: TodayScheduleItem[] = (logs ?? []).map((row) => {
    const rawMed = row.medications as
      | { name: string; dosage: string }
      | { name: string; dosage: string }[]
      | null;
    const med = Array.isArray(rawMed) ? rawMed[0] : rawMed;
    return {
      logId: row.id,
      medicationId: row.medication_id,
      name: med?.name ?? "Medication",
      dosage: med?.dosage ?? "",
      scheduledTime: row.scheduled_time,
      status: row.status as TodayScheduleItem["status"],
      takenAt: row.taken_at,
    };
  });

  return { ok: true, items, timezone: timeZone };
}

export async function markAdherenceLogTaken(logId: string): Promise<MarkTakenResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      code: "NOT_AUTHENTICATED",
      message: "Sign in to update adherence.",
    };
  }

  const takenAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("adherence_logs")
    .update({ status: "taken", taken_at: takenAt })
    .eq("id", logId)
    .eq("profile_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: error.message || "Could not update log.",
    };
  }
  if (!data) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Log not found.",
    };
  }

  return { ok: true };
}

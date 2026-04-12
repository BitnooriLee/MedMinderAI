"use server";

import {
  analyzeDrugDrugInteractions,
  type DdiAnalysisResult,
} from "@/lib/prescription/ddi-checker";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Loads the signed-in user's medication names and runs label-based DDI screening
 * against openFDA (cached server-side).
 */
export async function analyzeDdiForCurrentUser(
  locale: string
): Promise<DdiAnalysisResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: true, findings: [] };
  }

  const { data: meds, error } = await supabase
    .from("medications")
    .select("name")
    .eq("profile_id", user.id);

  if (error) {
    return { ok: false, message: error.message || "Could not load medications." };
  }

  const names = Array.from(
    new Set(
      (meds ?? [])
        .map((m) => (typeof m.name === "string" ? m.name.trim() : ""))
        .filter((n) => n.length > 0)
    )
  );

  return analyzeDrugDrugInteractions(names, locale);
}

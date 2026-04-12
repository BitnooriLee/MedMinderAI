"use server";

import {
  bestFdaMatch,
  collectFdaSuggestionNames,
  fetchOpenFdaLabels,
} from "@/lib/prescription/fda-match";
import type {
  AnalyzePrescriptionResult,
  FdaMatchInfo,
  ParsedPrescription,
  SaveMedicationResult,
} from "@/lib/prescription/types";
import { MAX_PRESCRIPTION_IMAGE_BYTES } from "@/lib/server/prescription-upload-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isParsedPrescription(value: unknown): value is ParsedPrescription {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.drug_name === "string" &&
    typeof o.dosage === "string" &&
    typeof o.frequency === "string" &&
    typeof o.raw_instructions === "string"
  );
}

async function extractWithVision(
  mimeType: string,
  base64: string
): Promise<ParsedPrescription> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract structured data from prescription photos. Reply with one JSON object only, using keys: drug_name, dosage, frequency, raw_instructions. Labels may be Korean, English, or Spanish; transcribe faithfully without translating unless the line is clearly a translation. If the image is too blurry or not a prescription, set drug_name to an empty string and explain briefly in raw_instructions. Never invent a drug name.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Return JSON for drug_name, dosage, frequency, raw_instructions.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      errText ? errText.slice(0, 240) : `OpenAI request failed (${res.status})`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty model response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error("Model returned invalid JSON");
  }

  if (!isParsedPrescription(parsed)) {
    throw new Error("Model returned unexpected JSON shape");
  }

  return parsed;
}

export async function analyzePrescription(
  formData: FormData
): Promise<AnalyzePrescriptionResult> {
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Image file is required.",
    };
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Unsupported image type. Use JPEG, PNG, WebP, or GIF.",
    };
  }

  if (file.size === 0 || file.size > MAX_PRESCRIPTION_IMAGE_BYTES) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Image is missing or too large.",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  let parsed: ParsedPrescription;
  try {
    parsed = await extractWithVision(file.type, base64);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Vision parsing failed.";
    if (msg.includes("OPENAI_API_KEY")) {
      return {
        ok: false,
        code: "VISION_UNAVAILABLE",
        message: "Vision service is not configured.",
      };
    }
    return {
      ok: false,
      code: "PARSE_FAILED",
      message:
        "The prescription could not be read clearly. Try a brighter, sharper photo with the full label visible.",
    };
  }

  if (!parsed.drug_name.trim()) {
    return {
      ok: false,
      code: "PARSE_FAILED",
      message:
        parsed.raw_instructions.trim() ||
        "No readable medication name was found on this image.",
    };
  }

  let fda_verification_status: "verified" | "not_found" | "unverified" =
    "not_found";
  let fda_match: FdaMatchInfo | null = null;
  let confidence_score = 0.28;
  let fda_suggestions: string[] = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const fdaJson = await fetchOpenFdaLabels(parsed.drug_name, controller.signal);
    clearTimeout(timeout);

    const { match, score } = bestFdaMatch(parsed.drug_name, fdaJson);
    const hasHits = (fdaJson.results?.length ?? 0) > 0;
    if (hasHits) {
      fda_suggestions = collectFdaSuggestionNames(parsed.drug_name, fdaJson);
    }

    if (match && score >= 0.5) {
      fda_verification_status = "verified";
      fda_match = match;
      confidence_score = Number(Math.min(1, 0.5 + score * 0.5).toFixed(2));
    } else if (hasHits) {
      fda_verification_status = "not_found";
      fda_match = match;
      confidence_score = Number(Math.max(0.18, score * 0.55).toFixed(2));
    } else {
      fda_verification_status = "not_found";
      fda_match = null;
      confidence_score = 0.22;
    }
  } catch {
    fda_verification_status = "unverified";
    fda_match = null;
    confidence_score = 0.48;
    fda_suggestions = [];
  }

  return {
    ok: true,
    parsed,
    confidence_score,
    fda_verification_status,
    fda_match,
    fda_suggestions,
  };
}

function normalizeProfileLocale(lang: string): "en" | "ko" | "es" | null {
  const base = lang.split("-")[0]?.toLowerCase() ?? "";
  if (base === "en" || base === "ko" || base === "es") return base;
  return null;
}

/**
 * Persists verified OCR data: updates profile locale, inserts medication + one adherence log.
 */
export async function saveVerifiedMedication(
  parsed: ParsedPrescription,
  localeFromClient: string
): Promise<SaveMedicationResult> {
  const locale = normalizeProfileLocale(localeFromClient);
  if (!locale) {
    return {
      ok: false,
      code: "INVALID_LOCALE",
      message: "Locale must be en, ko, or es.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      code: "NOT_AUTHENTICATED",
      message: "Sign in to save this medication.",
    };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr || !profile) {
    return {
      ok: false,
      code: "NO_PROFILE",
      message: "User profile is not ready yet. Try again in a moment.",
    };
  }

  const { error: localeErr } = await supabase
    .from("profiles")
    .update({ locale })
    .eq("id", user.id);

  if (localeErr) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: localeErr.message || "Could not update locale.",
    };
  }

  const { data: med, error: medErr } = await supabase
    .from("medications")
    .insert({
      profile_id: user.id,
      name: parsed.drug_name.trim(),
      dosage: parsed.dosage.trim(),
      frequency: parsed.frequency.trim(),
      instructions: parsed.raw_instructions.trim() || null,
    })
    .select("id")
    .single();

  if (medErr || !med) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: medErr?.message || "Could not save medication.",
    };
  }

  const now = new Date().toISOString();

  const { error: logErr } = await supabase.from("adherence_logs").insert({
    profile_id: user.id,
    medication_id: med.id,
    status: "taken",
    scheduled_time: now,
    taken_at: now,
  });

  if (logErr) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: logErr.message || "Could not save adherence log.",
    };
  }

  return { ok: true, medicationId: med.id };
}

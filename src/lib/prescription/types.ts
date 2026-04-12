export type ParsedPrescription = {
  drug_name: string;
  dosage: string;
  frequency: string;
  raw_instructions: string;
};

export type FdaVerificationStatus = "verified" | "not_found" | "unverified";

export type FdaMatchInfo = {
  matched_name: string;
  match_type: "brand" | "generic" | "substance";
  set_id?: string;
};

export type AnalyzePrescriptionSuccess = {
  ok: true;
  parsed: ParsedPrescription;
  confidence_score: number;
  fda_verification_status: FdaVerificationStatus;
  fda_match: FdaMatchInfo | null;
  /** openFDA label search hits, ranked for autocomplete when correcting drug name. */
  fda_suggestions: string[];
};

export type AnalyzePrescriptionError = {
  ok: false;
  code: "PARSE_FAILED" | "VISION_UNAVAILABLE" | "INVALID_INPUT";
  message: string;
};

export type AnalyzePrescriptionResult =
  | AnalyzePrescriptionSuccess
  | AnalyzePrescriptionError;

export type SaveMedicationResult =
  | { ok: true; medicationId: string }
  | {
      ok: false;
      code:
        | "NOT_AUTHENTICATED"
        | "INVALID_LOCALE"
        | "DB_ERROR"
        | "NO_PROFILE";
      message: string;
    };

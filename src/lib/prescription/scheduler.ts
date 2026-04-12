/**
 * Smart schedule: map free-text frequency to local clock times, then to UTC instants.
 * All medical timing remains indicative; ambiguous strings fall back to safe defaults.
 */

export type FrequencyScheduleKind =
  | "matched"
  | "prn_skip"
  | "unknown_default";

export type FrequencyScheduleParse = {
  /** Local "HH:mm" strings in the user's profile timezone for one calendar day */
  slotTimesLocalHHmm: string[];
  kind: FrequencyScheduleKind;
};

const DEFAULT_ONCE = ["09:00"] as const;
const TWICE = ["09:00", "21:00"] as const;
const TID = ["08:00", "13:00", "19:00"] as const;
const QID = ["08:00", "12:00", "16:00", "20:00"] as const;

function normalizeFrequency(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Heuristic mapping from OCR / user-entered frequency text to local slot times.
 * Food-related phrases (e.g. "식후 30분") are cues for meal alignment, not extra doses:
 * we still derive dose count from the clearest frequency token and ignore minute offsets
 * to avoid inventing wall-clock times from unstructured text.
 */
export function frequencyToLocalSlotTimes(frequency: string): FrequencyScheduleParse {
  const f = normalizeFrequency(frequency);
  if (!f) {
    return { slotTimesLocalHHmm: [...DEFAULT_ONCE], kind: "unknown_default" };
  }

  // PRN / as-needed: no automatic schedule rows (user must not see false deadlines).
  if (
    /\b(prn|as needed|as-needed|sos)\b/.test(f) ||
    /(필요시|필요\s*시|원할\s*때|증상시|symptom)/.test(f) ||
    /\b(si es necesario|según necesidad)\b/.test(f)
  ) {
    return { slotTimesLocalHHmm: [], kind: "prn_skip" };
  }

  // Explicit counts (Korean / English / Spanish-ish)
  if (
    /(1일\s*4회|하루\s*4회|1일4회|4\s*회\s*복용|\bqid\b|cuatro veces)/.test(f) ||
    (/\b4\s*x\b/.test(f) && /(day|d[ií]a|일)/.test(f))
  ) {
    return { slotTimesLocalHHmm: [...QID], kind: "matched" };
  }
  if (
    /(1일\s*3회|하루\s*3회|1일3회|3\s*회\s*복용|\btid\b|t\.?\s*i\.?\s*d\.?\b|three times|3 times|tres veces)/.test(
      f
    )
  ) {
    return { slotTimesLocalHHmm: [...TID], kind: "matched" };
  }
  if (
    /(1일\s*2회|하루\s*2회|1일2회|2\s*회\s*복용|\bbid\b|b\.?\s*i\.?\s*d\.?\b|twice|2 times|dos veces)/.test(f)
  ) {
    return { slotTimesLocalHHmm: [...TWICE], kind: "matched" };
  }
  if (
    /(1일\s*1회|하루\s*1회|1일1회|하루\s*한\s*번|매일\s*1회|once daily|once a day|every day|\bqd\b|q\.?\s*d\.?\b|daily|un(a)? vez al d[ií]a)/.test(
      f
    )
  ) {
    return { slotTimesLocalHHmm: [...DEFAULT_ONCE], kind: "matched" };
  }

  // Interval-style (coarse: map to a reasonable spread, never infer exact minute offsets)
  if (/\b(q6h|every\s*6\s*h)/.test(f)) {
    return {
      slotTimesLocalHHmm: ["06:00", "12:00", "18:00", "00:00"],
      kind: "matched",
    };
  }
  if (/\b(q8h|every\s*8\s*h)/.test(f)) {
    return { slotTimesLocalHHmm: ["08:00", "16:00", "00:00"], kind: "matched" };
  }
  if (/\b(q12h|every\s*12\s*h)/.test(f)) {
    return { slotTimesLocalHHmm: [...TWICE], kind: "matched" };
  }
  if (/\b(q4h|every\s*4\s*h)/.test(f)) {
    return { slotTimesLocalHHmm: ["08:00", "12:00", "16:00", "20:00"], kind: "matched" };
  }

  // Ambiguous meal text without clear count → conservative once daily (09:00), flagged
  if (/(식전|식후|with food|with meal|con comida|공복)/.test(frequency)) {
    return { slotTimesLocalHHmm: [...DEFAULT_ONCE], kind: "unknown_default" };
  }

  return { slotTimesLocalHHmm: [...DEFAULT_ONCE], kind: "unknown_default" };
}

type ZonedParts = { y: number; M: number; d: number; h: number; m: number };

function getZonedParts(ts: number, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(new Date(ts))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const hRaw = parts.hour === "24" ? "0" : parts.hour;
  return {
    y: Number(parts.year),
    M: Number(parts.month),
    d: Number(parts.day),
    h: Number(hRaw),
    m: Number(parts.minute),
  };
}

function cmpZoned(
  a: ZonedParts,
  y: number,
  M: number,
  d: number,
  h: number,
  m: number
): number {
  if (a.y !== y) return a.y - y;
  if (a.M !== M) return a.M - M;
  if (a.d !== d) return a.d - d;
  if (a.h !== h) return a.h - h;
  return a.m - m;
}

/**
 * Wall-clock (y-M-d H:m) interpreted in IANA `timeZone` → UTC instant (binary search).
 */
export function zonedLocalDateTimeToUtc(
  y: number,
  M: number,
  d: number,
  h: number,
  m: number,
  timeZone: string
): Date {
  let lo = Date.UTC(y, M - 1, d - 1, 0, 0, 0);
  let hi = Date.UTC(y, M - 1, d + 2, 23, 59, 59);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const c = cmpZoned(getZonedParts(mid, timeZone), y, M, d, h, m);
    if (c === 0) return new Date(mid);
    if (c < 0) lo = mid;
    else hi = mid;
  }
  return new Date((lo + hi) / 2);
}

export function getZonedCalendarDate(
  instant: Date,
  timeZone: string
): { y: number; M: number; d: number } {
  const p = getZonedParts(instant.getTime(), timeZone);
  return { y: p.y, M: p.M, d: p.d };
}

export function nextZonedCalendarDate(
  y: number,
  M: number,
  d: number,
  timeZone: string
): { y: number; M: number; d: number } {
  let probe = zonedLocalDateTimeToUtc(y, M, d, 12, 0, timeZone).getTime();
  const key = `${y}-${M}-${d}`;
  for (let i = 0; i < 48; i++) {
    probe += 3600 * 1000;
    const p = getZonedParts(probe, timeZone);
    const k = `${p.y}-${p.M}-${p.d}`;
    if (k !== key) return { y: p.y, M: p.M, d: p.d };
  }
  return { y, M, d: d + 1 };
}

export function parseHHmm(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/**
 * Start of "today" and start of "tomorrow" in `timeZone`, as UTC Dates (half-open range).
 */
export function getZonedDayRangeUtc(instant: Date, timeZone: string): {
  dayStartUtc: Date;
  nextDayStartUtc: Date;
} {
  const { y, M, d } = getZonedCalendarDate(instant, timeZone);
  const next = nextZonedCalendarDate(y, M, d, timeZone);
  return {
    dayStartUtc: zonedLocalDateTimeToUtc(y, M, d, 0, 0, timeZone),
    nextDayStartUtc: zonedLocalDateTimeToUtc(next.y, next.M, next.d, 0, 0, timeZone),
  };
}

export function localSlotToUtcInstant(
  calendar: { y: number; M: number; d: number },
  hhmm: string,
  timeZone: string
): Date | null {
  const hm = parseHHmm(hhmm);
  if (!hm) return null;
  return zonedLocalDateTimeToUtc(calendar.y, calendar.M, calendar.d, hm.h, hm.m, timeZone);
}

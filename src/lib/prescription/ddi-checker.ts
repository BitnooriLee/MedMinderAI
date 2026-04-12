import { bestFdaMatch, normalizeDrugLabel } from "./fda-match";
import type { FdaMatchInfo } from "./types";

type OpenFdaLabelHitExtended = {
  set_id?: string;
  drug_interactions?: string[];
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    substance_name?: string[];
  };
};

type OpenFdaLabelResponseExtended = {
  results?: OpenFdaLabelHitExtended[];
  error?: { code?: string; message?: string };
};

type OpenFdaEventResponse = {
  meta?: { results?: { total?: number } };
  error?: { message?: string };
};

const LABEL_CACHE_TTL_MS = 86_400_000; // 24h — SPL updates are infrequent
const PAIR_EVENT_CACHE_TTL_MS = 21_600_000; // 6h
const MAX_LABEL_FETCH_CONCURRENCY = 2;

type CacheEntry<T> = { expiresAt: number; value: T };

const labelResponseCache = new Map<string, CacheEntry<OpenFdaLabelResponseExtended>>();
const labelInflight = new Map<string, Promise<OpenFdaLabelResponseExtended>>();
const pairEventCache = new Map<string, CacheEntry<number | null>>();

function appendOpenFdaApiKey(url: URL): void {
  const key = process.env.OPENFDA_API_KEY?.trim();
  if (key) url.searchParams.set("api_key", key);
}

async function fetchLabelJsonRaw(
  drugName: string,
  signal?: AbortSignal
): Promise<OpenFdaLabelResponseExtended> {
  const trimmed = drugName.trim();
  if (!trimmed) return { results: [] };

  const escape = (term: string) =>
    term.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
  const buildSearch = (primary: string) => {
    const t = escape(primary);
    if (!t) return "";
    return `(openfda.brand_name:"${t}"+OR+openfda.generic_name:"${t}")`;
  };

  const attempts = [buildSearch(trimmed)];
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) attempts.push(buildSearch(tokens[0] ?? ""));

  for (const search of attempts) {
    if (!search) continue;
    const url = new URL("https://api.fda.gov/drug/label.json");
    url.searchParams.set("search", search);
    url.searchParams.set("limit", "20");
    appendOpenFdaApiKey(url);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });

    const json = (await res.json()) as OpenFdaLabelResponseExtended;
    if (!res.ok) {
      const err = new Error(json.error?.message ?? `openFDA label HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    if (json.results?.length) return json;
  }

  return { results: [] };
}

async function getCachedLabelResponse(
  drugName: string,
  signal?: AbortSignal
): Promise<OpenFdaLabelResponseExtended> {
  const key = normalizeDrugLabel(drugName);
  if (!key) return { results: [] };

  const now = Date.now();
  const cached = labelResponseCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const pending = labelInflight.get(key);
  if (pending) return pending;

  const p = fetchLabelJsonRaw(drugName, signal)
    .then((value) => {
      labelResponseCache.set(key, {
        expiresAt: Date.now() + LABEL_CACHE_TTL_MS,
        value,
      });
      return value;
    })
    .finally(() => {
      labelInflight.delete(key);
    });

  labelInflight.set(key, p);
  return p;
}

function findHitForMatch(
  response: OpenFdaLabelResponseExtended,
  match: FdaMatchInfo | null
): OpenFdaLabelHitExtended | null {
  const results = response.results ?? [];
  if (match?.set_id) {
    const byId = results.find((h) => h.set_id === match.set_id);
    if (byId) return byId;
  }
  return results[0] ?? null;
}

function joinDrugInteractions(hit: OpenFdaLabelHitExtended | null): string {
  const parts = hit?.drug_interactions;
  if (!parts?.length) return "";
  return parts.join("\n\n");
}

function collectAliasesFromHit(
  hit: OpenFdaLabelHitExtended | null,
  userPreferredName: string
): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) out.add(t);
  };
  add(userPreferredName);
  for (const n of hit?.openfda?.brand_name ?? []) add(n);
  for (const n of hit?.openfda?.generic_name ?? []) add(n);
  for (const n of hit?.openfda?.substance_name ?? []) add(n);
  return Array.from(out);
}

function normalizedIncludes(haystack: string, needle: string): boolean {
  const h = normalizeDrugLabel(haystack).replace(/\s+/g, " ");
  const n = normalizeDrugLabel(needle).replace(/\s+/g, " ");
  if (!n) return false;
  if (n.length >= 4 && h.includes(n)) return true;
  const tokens = n.split(" ").filter((t) => t.length >= 3);
  if (tokens.length >= 2 && tokens.every((t) => h.includes(t))) return true;
  return false;
}

function textMentionsAnyAlias(interactionsText: string, aliases: string[]): boolean {
  for (const a of aliases) {
    if (normalizedIncludes(interactionsText, a)) return true;
  }
  return false;
}

function extractLabelExcerpt(
  raw: string,
  aliases: string[]
): string {
  const plain = raw.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  let bestIdx = -1;
  let bestAlias = "";
  for (const a of aliases) {
    const idx = normalizeDrugLabel(plain).indexOf(normalizeDrugLabel(a));
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
      bestIdx = idx;
      bestAlias = a;
    }
  }
  if (bestIdx < 0) return plain.slice(0, 360).trim();
  const windowStart = Math.max(0, bestIdx - 60);
  const windowEnd = Math.min(plain.length, bestIdx + bestAlias.length + 220);
  const slice = plain.slice(windowStart, windowEnd).trim();
  return slice.length < plain.length ? `… ${slice} …` : slice;
}

type LocaleCode = "en" | "ko" | "es";

function resolveLocale(locale: string): LocaleCode {
  const base = locale.split("-")[0]?.toLowerCase() ?? "en";
  if (base === "ko") return "ko";
  if (base === "es") return "es";
  return "en";
}

const RISK_RULES: Array<{
  test: (t: string) => boolean;
  labels: Record<LocaleCode, string>;
}> = [
  {
    test: (t) => /bleed|hemorrhag|anti-?coagul|warfarin|thrombocyt|plt\b|inr\b/i.test(t),
    labels: {
      en: "Increased bleeding risk — use extra caution with cuts or falls.",
      ko: "출혈 위험이 커질 수 있습니다. 넘어짐·상처에 특히 주의하세요.",
      es: "Mayor riesgo de sangrado — tenga cuidado con cortes o caídas.",
    },
  },
  {
    test: (t) => /dizz|vertigo|syncope|lightheaded|orthostatic/i.test(t),
    labels: {
      en: "Dizziness or fainting is possible — rise slowly from sitting or lying down.",
      ko: "어지러움이나 쓰러짐이 생길 수 있습니다. 일어날 때 천천히 하세요.",
      es: "Mareos o desmayos son posibles — levántese despacio.",
    },
  },
  {
    test: (t) => /serotonin/i.test(t),
    labels: {
      en: "Serotonin-related reaction risk — seek urgent care for agitation, fever, or confusion.",
      ko: "세로토닌 관련 반응 위험이 있습니다. 불안·열·혼란이 있으면 바로 응급실로 가세요.",
      es: "Riesgo de síndrome serotoninérgico — busque urgencias si hay agitación, fiebre o confusión.",
    },
  },
  {
    test: (t) => /hypoglyc|glucose|insulin|sugar levels/i.test(t),
    labels: {
      en: "Blood sugar may drop too low — know the signs of low blood sugar.",
      ko: "혈당이 너무 떨어질 수 있습니다. 저혈당 증상을 알아두세요.",
      es: "El azúcar en sangre puede bajar demasiado — conozca los signos de hipoglucemia.",
    },
  },
  {
    test: (t) => /sedat|drows|sleep|respiratory depression|cns depress/i.test(t),
    labels: {
      en: "Extra sleepiness or slowed breathing — avoid driving until your clinician clears you.",
      ko: "졸음이 심해지거나 숨이 느려질 수 있습니다. 의사 확인 전에는 운전하지 마세요.",
      es: "Más somnolencia o respiración lenta — no conduzca sin indicación médica.",
    },
  },
  {
    test: (t) => /qt prolong|torsade|arrhythm|heart rhythm/i.test(t),
    labels: {
      en: "Heart rhythm effects are possible — report palpitations or fainting.",
      ko: "심장 박동에 영향이 있을 수 있습니다. 두근거림이나 쓰러짐이 있으면 알리세요.",
      es: "Posibles efectos en el ritmo cardíaco — informe palpitaciones o desmayos.",
    },
  },
  {
    test: (t) => /renal|kidney|hepatotox|liver/i.test(t),
    labels: {
      en: "Kidney or liver workload may increase — follow labs if your clinician ordered them.",
      ko: "신장·간 부담이 커질 수 있습니다. 검사 지시가 있으면 꼭 따르세요.",
      es: "Mayor carga para riñón o hígado — siga los análisis si su médico los pidió.",
    },
  },
];

function buildSymptomBullets(interactionsText: string, locale: string): string[] {
  const lc = resolveLocale(locale);
  const norm = interactionsText.slice(0, 12_000);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rule of RISK_RULES) {
    if (!rule.test(norm)) continue;
    const line = rule.labels[lc];
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= 5) break;
  }
  if (out.length === 0) {
    out.push(
      lc === "ko"
        ? "함께 쓰면 부작용이 생길 수 있습니다. 증상이 있으면 바로 연락하세요."
        : lc === "es"
          ? "Usarlos juntos puede aumentar efectos adversos. Si nota síntomas nuevos, llame a su equipo clínico."
          : "Using these together may increase side effects. Contact your clinician if new symptoms appear."
    );
  }
  return out;
}

function interactionsImplyHighSeverity(text: string): boolean {
  return /contraindicat|do not use|do not co-?admin|must not be|avoid use|fatal|life-?threatening/i.test(
    text
  );
}

async function fetchCoReportTotal(
  openfdaTermsA: string[],
  openfdaTermsB: string[],
  signal?: AbortSignal
): Promise<number | null> {
  const pick = (terms: string[]) =>
    terms
      .map((t) => t.trim())
      .filter((t) => t.length >= 4)
      .slice(0, 2);

  const a = pick(openfdaTermsA);
  const b = pick(openfdaTermsB);
  if (!a.length || !b.length) return null;

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const fieldGroup = (term: string) =>
    `(patient.drug.openfda.generic_name:"${esc(term)}"+OR+patient.drug.openfda.brand_name:"${esc(term)}")`;

  const pairKey = [normalizeDrugLabel(a.join("|")), normalizeDrugLabel(b.join("|"))]
    .sort()
    .join("__");
  const now = Date.now();
  const cached = pairEventCache.get(pairKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const tryQuery = async (t1: string, t2: string): Promise<number | null> => {
    const search = `${fieldGroup(t1)}+AND+${fieldGroup(t2)}`;
    const url = new URL("https://api.fda.gov/drug/event.json");
    url.searchParams.set("search", search);
    url.searchParams.set("limit", "1");
    appendOpenFdaApiKey(url);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
    const json = (await res.json()) as OpenFdaEventResponse;
    if (!res.ok) return null;
    const total = json.meta?.results?.total;
    return typeof total === "number" ? total : null;
  };

  let best: number | null = null;
  for (const t1 of a) {
    for (const t2 of b) {
      if (normalizeDrugLabel(t1) === normalizeDrugLabel(t2)) continue;
      const n = await tryQuery(t1, t2);
      if (n != null) best = best == null ? n : Math.max(best, n);
    }
  }

  pairEventCache.set(pairKey, { expiresAt: Date.now() + PAIR_EVENT_CACHE_TTL_MS, value: best });
  return best;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export type DdiSeverity = "high" | "moderate";

export type DdiFinding = {
  drugA: string;
  drugB: string;
  severity: DdiSeverity;
  /** User-facing medication whose FDA label contained the interaction text. */
  labelSourceDrug: string;
  labelExcerpt: string;
  symptomBullets: string[];
  coReportTotal: number | null;
};

export type DdiAnalysisResult =
  | { ok: true; findings: DdiFinding[] }
  | { ok: false; message: string };

/**
 * Checks pairwise drug–drug interactions using openFDA drug/label `drug_interactions`
 * and enriches with optional drug/event co-report counts (best-effort).
 */
export async function analyzeDrugDrugInteractions(
  medicationNames: string[],
  locale: string,
  signal?: AbortSignal
): Promise<DdiAnalysisResult> {
  const unique = Array.from(
    new Set(medicationNames.map((n) => n.trim()).filter((n) => n.length > 0))
  );
  if (unique.length < 2) return { ok: true, findings: [] };

  type Prepared = {
    name: string;
    response: OpenFdaLabelResponseExtended;
    match: FdaMatchInfo | null;
    hit: OpenFdaLabelHitExtended | null;
    aliases: string[];
  };

  let prepared: Prepared[];
  try {
    prepared = await mapPool(unique, MAX_LABEL_FETCH_CONCURRENCY, async (name) => {
      const response = await getCachedLabelResponse(name, signal);
      const { match } = bestFdaMatch(name, response);
      const hit = findHitForMatch(response, match);
      const aliases = collectAliasesFromHit(hit, name);
      return { name, response, match, hit, aliases };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "openFDA request failed.";
    return { ok: false, message: msg };
  }

  const aliasByDrug = new Map<string, string[]>();
  for (const p of prepared) aliasByDrug.set(p.name, p.aliases);

  const pairKeys = new Set<string>();
  const findings: DdiFinding[] = [];

  for (const source of prepared) {
    const text = joinDrugInteractions(source.hit);
    if (!text.trim()) continue;

    for (const other of prepared) {
      if (other.name === source.name) continue;
      const aliasesOther = aliasByDrug.get(other.name) ?? [other.name];
      if (!textMentionsAnyAlias(text, aliasesOther)) continue;

      const [a, b] = [source.name, other.name].sort((x, y) => x.localeCompare(y));
      const pairKey = `${a}||${b}`;
      if (pairKeys.has(pairKey)) continue;
      pairKeys.add(pairKey);

      const excerpt = extractLabelExcerpt(text, aliasesOther);
      const symptomBullets = buildSymptomBullets(text, locale);
      const highFromLabel = interactionsImplyHighSeverity(text);

      let coReportTotal: number | null = null;
      try {
        coReportTotal = await fetchCoReportTotal(
          source.aliases,
          other.aliases,
          signal
        );
      } catch {
        coReportTotal = null;
      }

      const highFromEvents = coReportTotal != null && coReportTotal >= 75;
      const severity: DdiSeverity =
        highFromLabel || highFromEvents ? "high" : "moderate";

      findings.push({
        drugA: source.name,
        drugB: other.name,
        severity,
        labelSourceDrug: source.name,
        labelExcerpt: excerpt,
        symptomBullets,
        coReportTotal,
      });
    }
  }

  findings.sort((x, y) => {
    if (x.severity !== y.severity) return x.severity === "high" ? -1 : 1;
    return x.drugA.localeCompare(y.drugA);
  });

  return { ok: true, findings };
}

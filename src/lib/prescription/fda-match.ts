import type { FdaMatchInfo } from "./types";

type OpenFdaLabelHit = {
  set_id?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    substance_name?: string[];
  };
};

type OpenFdaLabelResponse = {
  results?: OpenFdaLabelHit[];
  error?: { code?: string; message?: string };
};

export function normalizeDrugLabel(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\uac00-\ud7af\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

export function stringSimilarity(a: string, b: string): number {
  const na = normalizeDrugLabel(a);
  const nb = normalizeDrugLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.max(0.88, 1 - Math.abs(na.length - nb.length) / Math.max(na.length, nb.length));
  }
  const dist = levenshtein(na, nb);
  const denom = Math.max(na.length, nb.length);
  return denom === 0 ? 0 : Math.max(0, 1 - dist / denom);
}

function tokenJaccard(a: string, b: string): number {
  const ta = new Set(normalizeDrugLabel(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeDrugLabel(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  return inter / (ta.size + tb.size - inter);
}

export function combinedSimilarity(query: string, candidate: string): number {
  return Math.max(stringSimilarity(query, candidate), tokenJaccard(query, candidate));
}

function escapeOpenFdaTerm(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function buildSearchQuery(primary: string): string {
  const t = escapeOpenFdaTerm(primary);
  if (!t) return "";
  return `(openfda.brand_name:"${t}"+OR+openfda.generic_name:"${t}")`;
}

export async function fetchOpenFdaLabels(
  drugName: string,
  signal?: AbortSignal
): Promise<OpenFdaLabelResponse> {
  const trimmed = drugName.trim();
  if (!trimmed) return { results: [] };

  const attempts = [buildSearchQuery(trimmed)];
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    attempts.push(buildSearchQuery(tokens[0] ?? ""));
  }

  for (const search of attempts) {
    if (!search) continue;
    const url = new URL("https://api.fda.gov/drug/label.json");
    url.searchParams.set("search", search);
    url.searchParams.set("limit", "20");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      next: { revalidate: 0 },
    });

    const json = (await res.json()) as OpenFdaLabelResponse;

    if (!res.ok) {
      const err = new Error(json.error?.message ?? `openFDA HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    if (json.results?.length) return json;
  }

  return { results: [] };
}

type MatchCandidate = FdaMatchInfo & { score: number };

function collectNames(hit: OpenFdaLabelHit): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  const setId = hit.set_id;
  const push = (name: string, match_type: FdaMatchInfo["match_type"]) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    out.push({ matched_name: trimmed, match_type, set_id: setId, score: 0 });
  };
  for (const n of hit.openfda?.brand_name ?? []) push(n, "brand");
  for (const n of hit.openfda?.generic_name ?? []) push(n, "generic");
  for (const n of hit.openfda?.substance_name ?? []) push(n, "substance");
  return out;
}

/**
 * Unique drug names from openFDA label results, ranked by similarity to the user query.
 */
export function collectFdaSuggestionNames(
  parsedDrugName: string,
  response: OpenFdaLabelResponse,
  limit = 15
): string[] {
  const hits = response.results ?? [];
  const byName = new Map<string, number>();

  const consider = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const score = combinedSimilarity(parsedDrugName, trimmed);
    const prev = byName.get(trimmed) ?? 0;
    if (score > prev) byName.set(trimmed, score);
  };

  for (const hit of hits) {
    for (const n of hit.openfda?.brand_name ?? []) consider(n);
    for (const n of hit.openfda?.generic_name ?? []) consider(n);
    for (const n of hit.openfda?.substance_name ?? []) consider(n);
  }

  return Array.from(byName.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

export function bestFdaMatch(
  parsedDrugName: string,
  response: OpenFdaLabelResponse
): { match: FdaMatchInfo | null; score: number } {
  const hits = response.results ?? [];
  let best: MatchCandidate | null = null;

  for (const hit of hits) {
    for (const cand of collectNames(hit)) {
      const score = combinedSimilarity(parsedDrugName, cand.matched_name);
      const scored = { ...cand, score };
      if (!best || scored.score > best.score) best = scored;
    }
  }

  if (!best) return { match: null, score: 0 };
  const { score, ...match } = best;
  return { match, score };
}

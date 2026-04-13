#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Next.js loads .env + .env.local; plain `node` does not — mirror that for local smoke runs.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(repoRoot, ".env") });
loadEnv({ path: resolve(repoRoot, ".env.local"), override: true });

/**
 * Production smoke checks: static assets, health, openFDA, optional OpenAI key,
 * and multipart payload limits (requires SMOKE_TEST_SECRET on the deployment).
 * Vercel caps serverless request bodies (~4.5MB); the app allows 6MiB images — large
 * probes may get HTTP 413 before the route runs; the script treats that as expected on Vercel.
 *
 * Usage:
 *   NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app SMOKE_TEST_SECRET=... node scripts/prod-smoke.mjs
 *
 * If the deployment uses Vercel Deployment Protection, set the same secret as in
 * Project → Settings → Deployment Protection → Protection Bypass for Automation:
 *   VERCEL_AUTOMATION_BYPASS_SECRET=...  (alias: VERCEL_PROTECTION_BYPASS)
 * Put it in `.env` or `.env.local` (same as Next). Value = Deployment Protection →
 * Protection Bypass for Automation (not a random env var you invent).
 * The script sends header `x-vercel-protection-bypass` on all requests to BASE_URL.
 *
 * The Analyze -> FDA -> Save path uses Next.js Server Actions (no public REST contract).
 * This script validates upstream dependencies and hosting limits that that flow relies on.
 */

const baseUrl = (
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  process.argv[2] ||
  ""
)
  .trim()
  .replace(/\/$/, "");

const smokeSecret = process.env.SMOKE_TEST_SECRET?.trim() ?? "";
const openaiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
const openfdaKey = process.env.OPENFDA_API_KEY?.trim() ?? "";
const vercelBypass =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ||
  process.env.VERCEL_PROTECTION_BYPASS?.trim() ||
  "";

/** Merge optional Vercel Deployment Protection bypass into request headers. */
function withBypassHeaders(headers) {
  const h = { ...headers };
  if (vercelBypass) h["x-vercel-protection-bypass"] = vercelBypass;
  return h;
}

const vercel401Hint =
  "set VERCEL_AUTOMATION_BYPASS_SECRET (or VERCEL_PROTECTION_BYPASS) in .env or .env.local — value from Vercel → Project → Settings → Deployment Protection → Protection Bypass for Automation (generate/copy there; not the same as Supabase or SMOKE_TEST_SECRET). Or disable Deployment Protection.";

const vercel401BypassRejected =
  "bypass header was sent but still 401: secret must exactly match a current Protection Bypass for Automation secret on the same Vercel project as BASE_URL; regenerate in Deployment Protection if unsure, redeploy is not required for local smoke — only the dashboard secret and your .env must match.";

/** Vercel Deployment Protection: 401 with hint whether bypass env is missing or wrong. */
function failIfDeploymentProtection(resource, status, non401Detail) {
  if (status === 401) {
    if (!vercelBypass) fail(`${resource} HTTP 401 — ${vercel401Hint}`);
    else fail(`${resource} HTTP 401 — ${vercel401BypassRejected}`);
    return;
  }
  fail(non401Detail ? `${resource} HTTP ${status} — ${non401Detail}` : `${resource} HTTP ${status}`);
}

function deploymentProtection401Suffix(status) {
  if (status !== 401) return "";
  return vercelBypass ? ` — ${vercel401BypassRejected}` : ` — ${vercel401Hint}`;
}

/** Vercel returns 413 + FUNCTION_PAYLOAD_TOO_LARGE before Next.js parses the body. */
function isVercelFunctionPayloadTooLarge(status, json) {
  if (status !== 413) return false;
  const raw = typeof json?.raw === "string" ? json.raw : JSON.stringify(json ?? {});
  return raw.includes("FUNCTION_PAYLOAD_TOO_LARGE");
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[smoke] OK: ${msg}`);
}

async function main() {
  if (!baseUrl) {
    fail("Set NEXT_PUBLIC_BASE_URL or BASE_URL (or pass URL as first CLI argument).");
    return;
  }

  console.log(
    `[smoke] ${baseUrl} | x-vercel-protection-bypass: ${
      vercelBypass ? `yes (${vercelBypass.length} chars)` : "no — add VERCEL_AUTOMATION_BYPASS_SECRET to .env or .env.local"
    }`
  );

  // --- Static + PWA ---
  const manifestRes = await fetch(`${baseUrl}/manifest.json`, {
    method: "GET",
    headers: withBypassHeaders({}),
  });
  if (!manifestRes.ok) {
    failIfDeploymentProtection("manifest.json", manifestRes.status, "");
  } else {
    const j = await manifestRes.json().catch(() => null);
    if (!j || typeof j !== "object" || !j.name) {
      fail("manifest.json: missing expected fields");
    } else {
      ok(`manifest.json (${manifestRes.status})`);
    }
  }

  const swRes = await fetch(`${baseUrl}/sw.js`, {
    method: "GET",
    headers: withBypassHeaders({}),
  });
  if (!swRes.ok) {
    failIfDeploymentProtection(
      "sw.js",
      swRes.status,
      "ensure production build ran (next-pwa writes public/sw.js)"
    );
  } else {
    const swText = await swRes.text();
    if (!swText.includes("workbox") && !swText.includes("precache")) {
      ok(`sw.js (${swRes.status}, ${swText.length}b — verify workbox content manually)`);
    } else {
      ok(`sw.js (${swRes.status}, workbox/precache present)`);
    }
  }

  const healthRes = await fetch(`${baseUrl}/api/health`, {
    method: "GET",
    headers: withBypassHeaders({}),
  });
  if (!healthRes.ok) {
    failIfDeploymentProtection("/api/health", healthRes.status, "");
  } else {
    ok(`/api/health (${healthRes.status})`);
  }

  // --- openFDA (same upstream as FDA step in analyzePrescription / DDI) ---
  // Use a query that returns hits; some brand/generic combinations return 404 "No matches found!"
  // even when the API is healthy (openFDA encodes zero results as NOT_FOUND).
  const fdaUrl = new URL("https://api.fda.gov/drug/label.json");
  fdaUrl.searchParams.set("search", 'openfda.generic_name:"acetaminophen"');
  fdaUrl.searchParams.set("limit", "1");
  if (openfdaKey) fdaUrl.searchParams.set("api_key", openfdaKey);

  const fdaRes = await fetch(fdaUrl.toString(), {
    headers: { Accept: "application/json" },
  });
  const fdaJson = await fdaRes.json().catch(() => ({}));
  if (!fdaRes.ok) {
    const msg = fdaJson?.error?.message ?? JSON.stringify(fdaJson).slice(0, 200);
    if (fdaRes.status === 404 && msg.includes("No matches found")) {
      fail(
        `openFDA HTTP 404 (${msg}) — try a different smoke search or confirm api.fda.gov behavior; not a Vercel issue.`
      );
    } else {
      fail(`openFDA HTTP ${fdaRes.status}: ${msg}`);
    }
  } else {
    ok("openFDA label.json reachable");
  }

  // --- OpenAI auth (no vision spend): list models ---
  if (openaiKey) {
    const oaRes = await fetch("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${openaiKey}` },
    });
    if (!oaRes.ok) {
      const t = await oaRes.text();
      fail(`OpenAI /v1/models HTTP ${oaRes.status}: ${t.slice(0, 200)}`);
    } else {
      ok("OpenAI API key accepted (/v1/models)");
    }
  } else {
    console.log("[smoke] SKIP: OPENAI_API_KEY not set (Analyze step not probed)");
  }

  // --- Multipart payload (mirrors serverless body + app size cap) ---
  if (!smokeSecret) {
    console.log(
      "[smoke] SKIP: SMOKE_TEST_SECRET not set — set it in Vercel and redeploy to test /api/smoke/payload"
    );
    return;
  }

  async function postPayload(label, byteLength) {
    const buf = Buffer.alloc(byteLength, 7);
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const fd = new FormData();
    fd.set("file", blob, "probe.bin");
    const res = await fetch(`${baseUrl}/api/smoke/payload`, {
      method: "POST",
      headers: withBypassHeaders({ Authorization: `Bearer ${smokeSecret}` }),
      body: fd,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 240) };
    }
    return { res, json };
  }

  // MAX_PRESCRIPTION_IMAGE_BYTES = 6MiB (see prescription-upload-limit.ts). Vercel serverless
  // request body is ~4.5MB, so 5–6MiB multipart often returns 413 before the route runs.
  const APP_MAX_BYTES = 6 * 1024 * 1024;
  const SAFE_UNDER_VERCEL_FN_CAP = 4 * 1024 * 1024;

  const rUnder = await postPayload("4MiB (under ~4.5MB Vercel function body cap)", SAFE_UNDER_VERCEL_FN_CAP);
  if (!rUnder.res.ok || !rUnder.json?.ok || !rUnder.json.withinLimit) {
    fail(
      `payload 4MiB: HTTP ${rUnder.res.status} body=${JSON.stringify(rUnder.json).slice(0, 300)}${deploymentProtection401Suffix(rUnder.res.status)}`
    );
  } else {
    ok(`multipart 4MiB accepted (withinLimit=${rUnder.json.withinLimit})`);
  }

  const rAt = await postPayload("6MiB (app max prescription image)", APP_MAX_BYTES);
  if (isVercelFunctionPayloadTooLarge(rAt.res.status, rAt.json)) {
    ok(
      "multipart 6MiB blocked at edge (Vercel FUNCTION_PAYLOAD_TOO_LARGE ~4.5MB cap) — app still allows 6MiB in code; use client→storage uploads for large files on Vercel"
    );
    console.log(
      "[smoke] SKIP: 6MiB+1 in-route rejection — cannot reach handler above platform cap on this host"
    );
    return;
  }
  if (!rAt.res.ok || !rAt.json?.ok || !rAt.json.withinLimit) {
    fail(
      `payload 6MiB (app max): HTTP ${rAt.res.status} body=${JSON.stringify(rAt.json).slice(0, 300)}${deploymentProtection401Suffix(rAt.res.status)}`
    );
  } else {
    ok("multipart 6MiB at app limit accepted by route");
  }

  const rOver = await postPayload("6MiB+1 (over app max)", APP_MAX_BYTES + 1);
  if (!rOver.res.ok || rOver.json?.withinLimit !== false) {
    fail(
      `payload over app max: expected HTTP 200 with withinLimit=false; HTTP ${rOver.res.status} body=${JSON.stringify(rOver.json).slice(0, 300)}${deploymentProtection401Suffix(rOver.res.status)}`
    );
  } else {
    ok("multipart over 6MiB rejected in-route (withinLimit=false)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

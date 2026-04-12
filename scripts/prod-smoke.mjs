#!/usr/bin/env node
/**
 * Production smoke checks: static assets, health, openFDA, optional OpenAI key,
 * and multipart payload limits (requires SMOKE_TEST_SECRET on the deployment).
 *
 * Usage:
 *   NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app SMOKE_TEST_SECRET=... node scripts/prod-smoke.mjs
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

  // --- Static + PWA ---
  const manifestRes = await fetch(`${baseUrl}/manifest.json`, { method: "GET" });
  if (!manifestRes.ok) {
    fail(`manifest.json HTTP ${manifestRes.status}`);
  } else {
    const j = await manifestRes.json().catch(() => null);
    if (!j || typeof j !== "object" || !j.name) {
      fail("manifest.json: missing expected fields");
    } else {
      ok(`manifest.json (${manifestRes.status})`);
    }
  }

  const swRes = await fetch(`${baseUrl}/sw.js`, { method: "GET" });
  if (!swRes.ok) {
    fail(
      `sw.js HTTP ${swRes.status} — ensure production build ran (next-pwa writes public/sw.js)`
    );
  } else {
    const swText = await swRes.text();
    if (!swText.includes("workbox") && !swText.includes("precache")) {
      ok(`sw.js (${swRes.status}, ${swText.length}b — verify workbox content manually)`);
    } else {
      ok(`sw.js (${swRes.status}, workbox/precache present)`);
    }
  }

  const healthRes = await fetch(`${baseUrl}/api/health`, { method: "GET" });
  if (!healthRes.ok) {
    fail(`/api/health HTTP ${healthRes.status}`);
  } else {
    ok(`/api/health (${healthRes.status})`);
  }

  // --- openFDA (same host as FDA step in analyzePrescription / DDI) ---
  const fdaUrl = new URL("https://api.fda.gov/drug/label.json");
  fdaUrl.searchParams.set(
    "search",
    '(openfda.brand_name:"aspirin"+OR+openfda.generic_name:"aspirin")'
  );
  fdaUrl.searchParams.set("limit", "1");
  if (openfdaKey) fdaUrl.searchParams.set("api_key", openfdaKey);

  const fdaRes = await fetch(fdaUrl.toString(), {
    headers: { Accept: "application/json" },
  });
  const fdaJson = await fdaRes.json().catch(() => ({}));
  if (!fdaRes.ok) {
    fail(
      `openFDA HTTP ${fdaRes.status}: ${fdaJson?.error?.message ?? JSON.stringify(fdaJson).slice(0, 200)}`
    );
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
      headers: { Authorization: `Bearer ${smokeSecret}` },
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

  const under = 5 * 1024 * 1024;
  const rUnder = await postPayload("5MiB", under);
  if (!rUnder.res.ok || !rUnder.json?.ok || !rUnder.json.withinLimit) {
    fail(
      `payload 5MiB: HTTP ${rUnder.res.status} body=${JSON.stringify(rUnder.json).slice(0, 300)}`
    );
  } else {
    ok(`multipart 5MiB accepted (withinLimit=${rUnder.json.withinLimit})`);
  }

  const atLimit = 6 * 1024 * 1024;
  const rAt = await postPayload("6MiB", atLimit);
  if (!rAt.res.ok || !rAt.json?.ok || !rAt.json.withinLimit) {
    fail(
      `payload 6MiB (at app max): HTTP ${rAt.res.status} body=${JSON.stringify(rAt.json).slice(0, 300)} — check Vercel request body limits vs next.config serverActions.bodySizeLimit`
    );
  } else {
    ok("multipart 6MiB at limit accepted");
  }

  const over = 6 * 1024 * 1024 + 1;
  const rOver = await postPayload("6MiB+1", over);
  if (!rOver.res.ok || rOver.json?.withinLimit !== false) {
    fail(
      `payload over limit: expected withinLimit=false; HTTP ${rOver.res.status} body=${JSON.stringify(rOver.json).slice(0, 300)}`
    );
  } else {
    ok("multipart over 6MiB rejected (withinLimit=false)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

"use server";

import {
  sendNotification as webPushSend,
  setVapidDetails,
  type PushSubscription as WebPushSubscription,
} from "web-push";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SavePushSubscriptionResult =
  | { ok: true }
  | {
      ok: false;
      code: "NOT_AUTHENTICATED" | "INVALID_SUBSCRIPTION" | "DB_ERROR";
      message: string;
    };

/**
 * Persists the browser PushSubscription (JSON) on the signed-in user's profile.
 */
export async function savePushSubscription(
  subscription: unknown
): Promise<SavePushSubscriptionResult> {
  if (!subscription || typeof subscription !== "object") {
    return {
      ok: false,
      code: "INVALID_SUBSCRIPTION",
      message: "Missing or invalid subscription payload.",
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
      message: "Sign in to enable notifications.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ push_subscription: subscription })
    .eq("id", user.id);

  if (error) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: error.message,
    };
  }

  return { ok: true };
}

/**
 * Clears stored subscription (e.g. after unsubscribe).
 */
export async function clearPushSubscription(): Promise<SavePushSubscriptionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      code: "NOT_AUTHENTICATED",
      message: "Sign in to update notifications.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ push_subscription: null })
    .eq("id", user.id);

  if (error) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: error.message,
    };
  }

  return { ok: true };
}

export type SendTestPushResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "NOT_AUTHENTICATED"
        | "NO_SUBSCRIPTION"
        | "MISSING_VAPID"
        | "SEND_FAILED"
        | "DB_ERROR";
      message: string;
    };

/**
 * Draft: send one Web Push to the current user using `web-push`.
 *
 * VAPID security:
 * - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: safe for the browser; required for subscribe + verify.
 * - `VAPID_PRIVATE_KEY`: server-only secret; never prefix with NEXT_PUBLIC_; store in CI/secret manager, rotate on leak.
 * - Optional `VAPID_SUBJECT` (mailto: or https:) contact for push operator (RFC 8292).
 */
export async function sendTestPushToCurrentUser(): Promise<SendTestPushResult> {
  const publicKey =
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  const subject = process.env.VAPID_SUBJECT ?? "mailto:support@example.com";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      code: "MISSING_VAPID",
      message: "VAPID keys are not configured on the server.",
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
      message: "Sign in to send a test notification.",
    };
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("push_subscription, locale")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: profileErr.message,
    };
  }

  const sub = profile?.push_subscription;
  if (!sub || typeof sub !== "object") {
    return {
      ok: false,
      code: "NO_SUBSCRIPTION",
      message: "No push subscription on file for this user.",
    };
  }

  setVapidDetails(subject, publicKey, privateKey);

  const locale =
    profile && typeof profile.locale === "string"
      ? profile.locale.split("-")[0] ?? "en"
      : "en";

  const payload = JSON.stringify({
    lang: locale,
    title: locale === "ko" ? "MedMinder · 테스트" : "MedMinder · Test",
    body:
      locale === "ko"
        ? "약 드실 시간입니다. (테스트 알림)"
        : locale === "es"
          ? "Es hora de tomar su medicamento. (notificación de prueba)"
          : "It is time to take your medication. (test notification)",
    tag: "medminder-test",
    url: "/",
  });

  try {
    await webPushSend(sub as WebPushSubscription, payload, {
      TTL: 60,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Push send failed.";
    return {
      ok: false,
      code: "SEND_FAILED",
      message,
    };
  }
}

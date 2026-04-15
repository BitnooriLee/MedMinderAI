"use client";

import { ChevronDown, ChevronUp, LogIn } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ensureAndFetchTodaySchedule,
  markAdherenceLogTaken,
  type TodayScheduleItem,
} from "@/app/actions/adherence-schedule";
import { analyzeDdiForCurrentUser } from "@/app/actions/ddi-check";
import { Button } from "@/components/ui/button";
import { triggerSuccessHaptic } from "@/lib/haptics";
import type { DdiFinding } from "@/lib/prescription/ddi-checker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

import { DailyTimeline } from "./DailyTimeline";
import { DdiDetailModal } from "./DdiDetailModal";
import { NextDoseHero } from "./NextDoseHero";
import { SafetyAlertBanner } from "./SafetyAlertBanner";

export function TodayScheduleSection() {
  const { t, i18n } = useTranslation("common");
  const [items, setItems] = useState<TodayScheduleItem[]>([]);
  const [timeZone, setTimeZone] = useState("UTC");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [signInBusy, setSignInBusy] = useState<
    "google" | "apple" | "passkey" | null
  >(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkBusy, setMagicLinkBusy] = useState(false);
  const [magicLinkInfo, setMagicLinkInfo] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneTarget, setPhoneTarget] = useState<string | null>(null);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneOtpBusy, setPhoneOtpBusy] = useState(false);
  const [phoneOtpStep, setPhoneOtpStep] = useState<"request" | "verify">(
    "request"
  );
  const [phoneOtpInfo, setPhoneOtpInfo] = useState<string | null>(null);
  const [showMoreAuthOptions, setShowMoreAuthOptions] = useState(false);
  const [authIdentity, setAuthIdentity] = useState<string | null>(null);
  const [authSignedIn, setAuthSignedIn] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [ddiFindings, setDdiFindings] = useState<DdiFinding[]>([]);
  const [ddiModalOpen, setDdiModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSignedOut(false);
    setDdiFindings([]);
    const res = await ensureAndFetchTodaySchedule();
    if (!res.ok) {
      if (res.code === "NOT_AUTHENTICATED") {
        setItems([]);
        setSignedOut(true);
        setError(null);
      } else {
        setError(res.message);
      }
      setLoading(false);
      return;
    }
    setItems(res.items);
    setTimeZone(res.timezone);
    setLoading(false);

    const ddi = await analyzeDdiForCurrentUser(i18n.language);
    if (ddi.ok) setDdiFindings(ddi.findings);
  }, [i18n.language]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolveAuthIdentity = useCallback(
    (session: { user?: { email?: string | null; phone?: string | null } } | null) => {
      const email = session?.user?.email?.trim();
      if (email) return email;
      const phone = session?.user?.phone?.trim();
      if (!phone) return null;
      if (phone.length <= 4) return phone;
      return `${"*".repeat(Math.max(phone.length - 4, 3))}${phone.slice(-4)}`;
    },
    []
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let alive = true;
    const syncSession = (
      session: { user?: { email?: string | null; phone?: string | null } } | null
    ) => {
      if (!alive) return;
      setAuthSignedIn(Boolean(session?.user));
      setAuthIdentity(resolveAuthIdentity(session));
    };

    void supabase.auth.getSession().then(({ data }) => {
      syncSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSession(session);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [resolveAuthIdentity]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const authError = url.searchParams.get("authError");
    if (!authError) return;
    const key =
      authError === "oauth_exchange_failed"
        ? "auth_callback_oauth_exchange_failed"
        : authError === "magic_link_failed"
          ? "auth_callback_magic_link_failed"
          : "auth_callback_invalid";
    setSignInError(t(key));
    url.searchParams.delete("authError");
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [t]);

  const onMarkTaken = useCallback(
    async (logId: string) => {
      triggerSuccessHaptic();
      setBusyId(logId);
      try {
        const res = await markAdherenceLogTaken(logId);
        if (res.ok) await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const resolveRedirectBase = useCallback(() => {
    const configured = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim();
    if (configured) {
      return configured.replace(/\/$/, "");
    }
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/\/$/, "");
    }
    return "";
  }, []);

  const onSocialSignIn = useCallback(
    async (provider: "google" | "apple") => {
      setSignInError(null);
      setMagicLinkInfo(null);
      setSignInBusy(provider);
      try {
        const supabase = getSupabaseBrowserClient();
        const redirectBase = resolveRedirectBase();
        const redirectTo = redirectBase
          ? `${redirectBase}/auth/callback?next=/`
          : undefined;
        const queryParams =
          provider === "google" ? { prompt: "select_account" } : undefined;
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            queryParams,
          },
        });
        if (error) {
          setSignInError(error.message || t("auth_sign_in_error"));
        }
      } catch {
        setSignInError(t("auth_sign_in_error"));
      } finally {
        setSignInBusy(null);
      }
    },
    [resolveRedirectBase, t]
  );

  const onMagicLinkSignIn = useCallback(async () => {
    const email = magicLinkEmail.trim();
    if (!email) {
      setSignInError(t("auth_magic_link_invalid_email"));
      return;
    }
    setSignInError(null);
    setMagicLinkInfo(null);
    setMagicLinkBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectBase = resolveRedirectBase();
      const emailRedirectTo = redirectBase
        ? `${redirectBase}/auth/callback?next=/`
        : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo,
        },
      });
      if (error) {
        setSignInError(error.message || t("auth_magic_link_error"));
      } else {
        setMagicLinkInfo(t("auth_magic_link_sent"));
      }
    } catch {
      setSignInError(t("auth_magic_link_error"));
    } finally {
      setMagicLinkBusy(false);
    }
  }, [magicLinkEmail, resolveRedirectBase, t]);

  const normalizePhoneNumber = useCallback((raw: string): string | null => {
    const cleaned = raw.replace(/[^\d+]/g, "");
    if (!cleaned) return null;
    if (cleaned.startsWith("+")) {
      const digits = cleaned.slice(1).replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) return null;
      return `+${digits}`;
    }
    const usDigits = cleaned.replace(/\D/g, "");
    if (usDigits.length === 10) {
      return `+1${usDigits}`;
    }
    if (usDigits.length === 11 && usDigits.startsWith("1")) {
      return `+${usDigits}`;
    }
    return null;
  }, []);

  const onRequestPhoneOtp = useCallback(async () => {
    const normalized = normalizePhoneNumber(phoneInput);
    if (!normalized) {
      setSignInError(t("auth_phone_invalid"));
      return;
    }
    setSignInError(null);
    setPhoneOtpInfo(null);
    setPhoneOtpBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalized,
        options: {
          shouldCreateUser: false,
        },
      });
      if (error) {
        setSignInError(error.message || t("auth_phone_send_error"));
      } else {
        setPhoneTarget(normalized);
        setPhoneOtpStep("verify");
        setPhoneOtpInfo(t("auth_phone_code_sent"));
      }
    } catch {
      setSignInError(t("auth_phone_send_error"));
    } finally {
      setPhoneOtpBusy(false);
    }
  }, [normalizePhoneNumber, phoneInput, t]);

  const onVerifyPhoneOtp = useCallback(async () => {
    if (!phoneTarget) {
      setSignInError(t("auth_phone_missing_target"));
      return;
    }
    const token = phoneOtpCode.trim();
    if (!/^\d{6}$/.test(token)) {
      setSignInError(t("auth_phone_code_invalid"));
      return;
    }
    setSignInError(null);
    setPhoneOtpInfo(null);
    setPhoneOtpBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneTarget,
        token,
        type: "sms",
      });
      if (error) {
        setSignInError(error.message || t("auth_phone_verify_error"));
      } else {
        setPhoneOtpInfo(t("auth_phone_verified"));
        setPhoneOtpCode("");
        setPhoneOtpStep("request");
        await refresh();
      }
    } catch {
      setSignInError(t("auth_phone_verify_error"));
    } finally {
      setPhoneOtpBusy(false);
    }
  }, [phoneOtpCode, phoneTarget, refresh, t]);

  const onPasskeySignIn = useCallback(async () => {
    setSignInError(null);
    setMagicLinkInfo(null);
    setPhoneOtpInfo(null);
    setSignInBusy("passkey");
    try {
      const supabase = getSupabaseBrowserClient();
      const authLike = supabase.auth as unknown as {
        signInWithWebAuthn?: () => Promise<{
          error: { message?: string } | null;
        }>;
        signInWithPasskey?: () => Promise<{
          error: { message?: string } | null;
        }>;
      };

      if (typeof authLike.signInWithWebAuthn === "function") {
        const { error } = await authLike.signInWithWebAuthn();
        if (error) {
          setSignInError(error.message || t("auth_passkey_error"));
          return;
        }
        await refresh();
        return;
      }

      if (typeof authLike.signInWithPasskey === "function") {
        const { error } = await authLike.signInWithPasskey();
        if (error) {
          setSignInError(error.message || t("auth_passkey_error"));
          return;
        }
        await refresh();
        return;
      }

      setSignInError(t("auth_passkey_unavailable"));
    } catch {
      setSignInError(t("auth_passkey_error"));
    } finally {
      setSignInBusy(null);
    }
  }, [refresh, t]);

  const onSignOut = useCallback(async () => {
    setSignInError(null);
    setMagicLinkInfo(null);
    setPhoneOtpInfo(null);
    setSignOutBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignInError(error.message || t("auth_sign_out_error"));
      } else {
        setSignedOut(true);
        setItems([]);
      }
      await refresh();
    } catch {
      setSignInError(t("auth_sign_out_error"));
    } finally {
      setSignOutBusy(false);
    }
  }, [refresh, t]);

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-muted bg-muted/30 p-6 text-center text-[20px] font-bold text-muted-foreground">
        {t("schedule_loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-red-800 bg-red-50 p-4 text-[20px] font-bold text-red-950 dark:border-red-500 dark:bg-red-950/30 dark:text-red-50"
      >
        {error}
      </div>
    );
  }

  if (signedOut && !authSignedIn) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-muted-foreground/40 bg-muted/30 p-4 text-center">
        <div
          className={
            authSignedIn
              ? "w-full rounded-xl border-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-left text-[16px] font-bold text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "w-full rounded-xl border-2 border-amber-700 bg-amber-50 px-3 py-2 text-left text-[16px] font-bold text-amber-900 dark:border-amber-500 dark:bg-amber-950/30 dark:text-amber-100"
          }
          role="status"
        >
          {authSignedIn
            ? t("auth_status_signed_in", {
                identity: authIdentity ?? t("auth_status_identity_fallback"),
              })
            : t("auth_status_signed_out")}
        </div>
        <p className="text-[18px] font-bold leading-snug text-foreground">
          {t("schedule_sign_in")}
        </p>
        <Button
          type="button"
          size="lg"
          disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
          className="min-h-[56px] w-full max-w-sm gap-2 rounded-2xl border-2 border-primary bg-primary text-[18px] font-extrabold text-primary-foreground shadow-md"
          onClick={() => void onSocialSignIn("google")}
        >
          <LogIn className="h-6 w-6 shrink-0" strokeWidth={2.25} aria-hidden />
          {signInBusy === "google"
            ? t("auth_sign_in_busy")
            : t("auth_sign_in_google")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="ghost"
          disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
          className="min-h-[44px] w-full max-w-sm justify-between rounded-xl border border-muted-foreground/40 px-3 text-[16px] font-bold"
          onClick={() => setShowMoreAuthOptions((prev) => !prev)}
        >
          {t("auth_more_methods")}
          {showMoreAuthOptions ? (
            <ChevronUp className="h-5 w-5" aria-hidden />
          ) : (
            <ChevronDown className="h-5 w-5" aria-hidden />
          )}
        </Button>
        {showMoreAuthOptions ? (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
              className="min-h-[52px] w-full gap-2 rounded-2xl border-2 border-primary text-[17px] font-bold text-primary shadow-sm"
              onClick={() => void onPasskeySignIn()}
            >
              <LogIn className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
              {signInBusy === "passkey"
                ? t("auth_sign_in_busy")
                : t("auth_sign_in_passkey")}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
              className="min-h-[52px] w-full gap-2 rounded-2xl border-2 border-foreground text-[17px] font-bold text-foreground shadow-sm"
              onClick={() => void onSocialSignIn("apple")}
            >
              <LogIn className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
              {signInBusy === "apple"
                ? t("auth_sign_in_busy")
                : t("auth_sign_in_apple")}
            </Button>
            <form
              className="flex w-full flex-col gap-2 rounded-2xl border-2 border-muted-foreground/40 bg-background/90 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void onMagicLinkSignIn();
              }}
            >
              <label
                htmlFor="magic-link-email"
                className="text-left text-[16px] font-bold text-foreground"
              >
                {t("auth_magic_link_label")}
              </label>
              <input
                id="magic-link-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={magicLinkEmail}
                onChange={(event) => setMagicLinkEmail(event.target.value)}
                placeholder={t("auth_magic_link_placeholder")}
                className="min-h-[48px] rounded-xl border-2 border-foreground bg-background px-3 text-[18px] font-semibold text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
                className="min-h-[52px] gap-2 rounded-2xl border-2 border-primary text-[17px] font-bold shadow-sm"
              >
                <LogIn className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
                {magicLinkBusy
                  ? t("auth_magic_link_busy")
                  : t("auth_sign_in_magic_link")}
              </Button>
            </form>
            <form
              className="flex w-full flex-col gap-2 rounded-2xl border-2 border-muted-foreground/40 bg-background/90 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (phoneOtpStep === "request") {
                  void onRequestPhoneOtp();
                } else {
                  void onVerifyPhoneOtp();
                }
              }}
            >
              <label
                htmlFor="phone-otp-input"
                className="text-left text-[16px] font-bold text-foreground"
              >
                {phoneOtpStep === "request"
                  ? t("auth_phone_label")
                  : t("auth_phone_code_label")}
              </label>
              {phoneOtpStep === "request" ? (
                <input
                  id="phone-otp-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phoneInput}
                  onChange={(event) => setPhoneInput(event.target.value)}
                  placeholder={t("auth_phone_placeholder")}
                  className="min-h-[48px] rounded-xl border-2 border-foreground bg-background px-3 text-[18px] font-semibold text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <input
                  id="phone-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={6}
                  value={phoneOtpCode}
                  onChange={(event) =>
                    setPhoneOtpCode(event.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder={t("auth_phone_code_placeholder")}
                  className="min-h-[48px] rounded-xl border-2 border-foreground bg-background px-3 text-[22px] font-extrabold tracking-[0.2em] text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              )}
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
                className="min-h-[52px] gap-2 rounded-2xl border-2 border-primary text-[17px] font-bold shadow-sm"
              >
                <LogIn className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
                {phoneOtpBusy
                  ? t("auth_phone_busy")
                  : phoneOtpStep === "request"
                    ? t("auth_phone_send_code")
                    : t("auth_phone_verify_code")}
              </Button>
              {phoneOtpStep === "verify" ? (
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  disabled={Boolean(signInBusy) || magicLinkBusy || phoneOtpBusy}
                  className="min-h-[44px] text-[16px] font-bold"
                  onClick={() => {
                    setPhoneOtpStep("request");
                    setPhoneOtpCode("");
                    setPhoneOtpInfo(null);
                    setSignInError(null);
                  }}
                >
                  {t("auth_phone_use_another")}
                </Button>
              ) : null}
            </form>
          </div>
        ) : null}
        {magicLinkInfo ? (
          <p
            className="text-[16px] font-bold text-emerald-800 dark:text-emerald-300"
            role="status"
          >
            {magicLinkInfo}
          </p>
        ) : null}
        {phoneOtpInfo ? (
          <p
            className="text-[16px] font-bold text-emerald-800 dark:text-emerald-300"
            role="status"
          >
            {phoneOtpInfo}
          </p>
        ) : null}
        {signInError ? (
          <p
            className="text-[16px] font-bold text-red-800 dark:text-red-300"
            role="alert"
          >
            {signInError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-emerald-700 bg-emerald-50 px-3 py-2 dark:border-emerald-500 dark:bg-emerald-950/30">
        <p
          className="min-w-0 flex-1 truncate text-[16px] font-bold text-emerald-900 dark:text-emerald-100"
          role="status"
        >
          {authSignedIn
            ? t("auth_status_signed_in", {
                identity: authIdentity ?? t("auth_status_identity_fallback"),
              })
            : t("auth_status_signed_out")}
        </p>
        {authSignedIn ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={signOutBusy}
            className="min-h-[40px] shrink-0 rounded-xl border-2 border-emerald-800 px-3 text-[14px] font-bold text-emerald-900 dark:border-emerald-200 dark:text-emerald-100"
            onClick={() => void onSignOut()}
          >
            {signOutBusy ? t("auth_sign_out_busy") : t("auth_sign_out")}
          </Button>
        ) : null}
      </div>
      <DdiDetailModal
        open={ddiModalOpen}
        findings={ddiFindings}
        onClose={() => setDdiModalOpen(false)}
      />
      <SafetyAlertBanner
        findings={ddiFindings}
        onOpenDetails={() => setDdiModalOpen(true)}
      />
      <NextDoseHero
        items={items}
        timeZone={timeZone}
        onMarkTaken={onMarkTaken}
        busyId={busyId}
      />
      {items.length > 0 ? (
        <div>
          <h2 className="mb-3 text-xl font-extrabold tracking-tight text-foreground">
            {t("schedule_timeline_title")}
          </h2>
          <DailyTimeline
            items={items}
            timeZone={timeZone}
            onMarkTaken={onMarkTaken}
            busyId={busyId}
          />
        </div>
      ) : null}
    </div>
  );
}

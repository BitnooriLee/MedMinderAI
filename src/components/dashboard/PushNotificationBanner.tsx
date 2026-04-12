"use client";

import { Bell, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { savePushSubscription } from "@/app/actions/notifications";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getVapidPublicKey, urlBase64ToUint8Array } from "@/lib/push-subscription";

import { Button } from "@/components/ui/button";

type PermissionUi = "unsupported" | "no_sw" | "no_vapid" | "prompt" | "granted" | "denied";

export function PushNotificationBanner() {
  const { t } = useTranslation("common");
  const [ui, setUi] = useState<PermissionUi>("prompt");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") {
      setUi("no_sw");
      return;
    }
    if (!("Notification" in window)) {
      setUi("unsupported");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      setUi("unsupported");
      return;
    }
    if (!getVapidPublicKey()) {
      setUi("no_vapid");
      return;
    }
    if (Notification.permission === "granted") {
      setUi("granted");
      return;
    }
    if (Notification.permission === "denied") {
      setUi("denied");
      return;
    }
    setUi("prompt");
  }, []);

  const onEnable = useCallback(async () => {
    setMessage(null);
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setUi("unsupported");
      return;
    }
    const vapid = getVapidPublicKey();
    if (!vapid) {
      setUi("no_vapid");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setMessage(t("push_banner_need_sign_in"));
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setUi(permission === "denied" ? "denied" : "prompt");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const keyMaterial = urlBase64ToUint8Array(vapid);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyMaterial as BufferSource,
      });

      const json = sub.toJSON();
      const res = await savePushSubscription(json);
      if (!res.ok) {
        setMessage(
          res.code === "NOT_AUTHENTICATED"
            ? t("push_banner_need_sign_in")
            : t("push_banner_error")
        );
        return;
      }

      setUi("granted");
    } catch {
      setMessage(t("push_banner_error"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  if (ui === "unsupported") {
    return (
      <section
        aria-label={t("push_banner_section_aria")}
        className="rounded-3xl border-2 border-muted-foreground/40 bg-muted/30 p-5 text-center text-[18px] font-semibold text-muted-foreground"
      >
        {t("push_banner_unsupported")}
      </section>
    );
  }

  if (ui === "no_sw") {
    return (
      <section
        aria-label={t("push_banner_section_aria")}
        className="rounded-3xl border-2 border-muted-foreground/40 bg-muted/30 p-5 text-center text-[18px] font-semibold text-muted-foreground"
      >
        {t("push_banner_dev")}
      </section>
    );
  }

  if (ui === "no_vapid") {
    return (
      <section
        aria-label={t("push_banner_section_aria")}
        className="rounded-3xl border-2 border-amber-900/50 bg-amber-50 p-5 text-center text-[18px] font-semibold text-amber-950 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-50"
      >
        {t("push_banner_missing_vapid")}
      </section>
    );
  }

  if (ui === "denied") {
    return (
      <section
        aria-label={t("push_banner_section_aria")}
        className="rounded-3xl border-2 border-red-900/40 bg-red-50 p-5 text-[18px] font-semibold text-red-950 dark:border-red-600 dark:bg-red-950/30 dark:text-red-50"
      >
        {t("push_banner_denied")}
      </section>
    );
  }

  if (ui === "granted") {
    return (
      <section
        aria-label={t("push_banner_section_aria")}
        className="flex items-center gap-4 rounded-3xl border-2 border-emerald-800 bg-emerald-50 p-5 dark:border-emerald-600 dark:bg-emerald-950/40"
      >
        <BellRing className="h-12 w-12 shrink-0 text-emerald-800 dark:text-emerald-300" strokeWidth={2.25} aria-hidden />
        <p className="text-[20px] font-extrabold leading-snug text-emerald-950 dark:text-emerald-50">
          {t("push_banner_enabled")}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label={t("push_banner_section_aria")}
      className="flex flex-col gap-4 rounded-3xl border-2 border-primary bg-primary/10 p-6 shadow-md dark:bg-primary/15"
    >
      <div className="flex items-start gap-3">
        <Bell className="h-12 w-12 shrink-0 text-primary" strokeWidth={2.25} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-[22px] font-black leading-tight text-foreground">{t("push_banner_title")}</h2>
          <p className="text-[18px] font-semibold leading-snug text-muted-foreground">{t("push_banner_body")}</p>
        </div>
      </div>
      <Button
        type="button"
        size="lg"
        disabled={busy}
        className="min-h-[64px] w-full rounded-2xl text-[22px] font-extrabold shadow-lg"
        onClick={() => void onEnable()}
      >
        {busy ? t("push_banner_loading") : t("push_banner_enable")}
      </Button>
      {message ? (
        <p className="text-center text-[18px] font-bold text-red-800 dark:text-red-300" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}

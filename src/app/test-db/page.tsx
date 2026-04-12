"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const languages = [
  { code: "en" as const, labelKey: "lang_en" as const },
  { code: "ko" as const, labelKey: "lang_ko" as const },
  { code: "es" as const, labelKey: "lang_es" as const },
];

type MedicationRow = {
  id: string;
  profile_id: string;
  name: string;
  dosage: string;
  frequency: string;
  instructions: string | null;
  created_at: string;
};

export default function TestDbPage() {
  const { t, i18n } = useTranslation("common");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [medications, setMedications] = useState<MedicationRow[] | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const lang = i18n.language.split("-")[0] ?? "en";
    document.documentElement.lang = lang;
  }, [i18n.language]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState("loading");
      setErrorMessage(null);

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) {
          return;
        }

        if (!session?.user?.id) {
          setSessionUserId(null);
          setMedications(null);
          setLoadState("idle");
          return;
        }

        setSessionUserId(session.user.id);

        const { data, error } = await supabase
          .from("medications")
          .select(
            "id, profile_id, name, dosage, frequency, instructions, created_at",
          )
          .order("created_at", { ascending: true });

        if (error) {
          setLoadState("error");
          setErrorMessage(error.message);
          setMedications(null);
          return;
        }

        setMedications((data ?? []) as MedicationRow[]);
        setLoadState("idle");
      } catch (e) {
        if (!cancelled) {
          setLoadState("error");
          setErrorMessage(e instanceof Error ? e.message : String(e));
          setMedications(null);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const payload = {
    sessionUserId,
    medicationCount: medications?.length ?? 0,
    medications,
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-primary">{t("appTitle")}</p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          {t("testDb_title")}
        </h1>
        <p className="text-lg text-muted-foreground">{t("testDb_description")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("testDb_langHeading")}</CardTitle>
          <CardDescription className="text-lg">
            {t("accessibility_note")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            className="flex flex-wrap gap-3"
            role="group"
            aria-label="Language"
          >
            {languages.map(({ code, labelKey }) => (
              <Button
                key={code}
                type="button"
                variant={
                  i18n.language.startsWith(code) ? "default" : "outline"
                }
                size="default"
                className="min-h-12 shrink-0 text-lg"
                onClick={() => void i18n.changeLanguage(code)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("testDb_medications")}</CardTitle>
          <CardDescription className="text-lg">
            {!sessionUserId
              ? t("testDb_signedOut")
              : loadState === "loading"
                ? t("testDb_loading")
                : loadState === "error"
                  ? t("testDb_error")
                  : t("testDb_ready")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadState === "error" && errorMessage ? (
            <p className="text-lg text-destructive">{errorMessage}</p>
          ) : null}
          <pre
            className="max-h-[min(60vh,28rem)] overflow-auto rounded-md border bg-muted/40 p-4 text-lg leading-relaxed"
            tabIndex={0}
          >
            {JSON.stringify(payload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

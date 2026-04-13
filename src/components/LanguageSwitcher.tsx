"use client";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const locales = [
  { code: "en" as const, abbr: "EN", flag: "🇺🇸", labelKey: "lang_en" as const },
  { code: "ko" as const, abbr: "KO", flag: "🇰🇷", labelKey: "lang_ko" as const },
  { code: "es" as const, abbr: "ES", flag: "🇪🇸", labelKey: "lang_es" as const },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");

  return (
    <div
      className="flex h-12 w-[10.5rem] shrink-0 gap-0.5 rounded-xl border-2 border-border bg-card/80 p-1 shadow-sm"
      role="group"
      aria-label={t("lang_switcher_aria")}
    >
      {locales.map(({ code, abbr, flag, labelKey }) => {
        const active = i18n.language.startsWith(code);
        return (
          <Button
            key={code}
            type="button"
            variant={active ? "default" : "ghost"}
            size="sm"
            className={cn(
              "box-border h-10 min-h-10 flex-1 basis-0 gap-0.5 px-0 text-sm font-extrabold sm:min-h-10 sm:min-w-0",
              "max-w-none",
            )}
            aria-pressed={active}
            aria-label={t(labelKey)}
            onClick={() => void i18n.changeLanguage(code)}
          >
            <span className="text-base leading-none" aria-hidden>
              {flag}
            </span>
            <span className="tabular-nums">{abbr}</span>
          </Button>
        );
      })}
    </div>
  );
}

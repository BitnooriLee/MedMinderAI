/// <reference lib="webworker" />

function serviceWorkerGlobal(): ServiceWorkerGlobalScope {
  return globalThis as unknown as ServiceWorkerGlobalScope;
}

type DosePushPayload = {
  title?: string;
  body?: string;
  /** BCP-47 prefix or app locale code: en | ko | es */
  lang?: string;
  tag?: string;
  /** Dashboard path to open on tap (default: scope root) */
  url?: string;
};

const DEFAULT_COPY: Record<string, { title: string; body: string }> = {
  ko: {
    title: "MedMinder · 복약 알림",
    body: "약 드실 시간입니다. 지금 대시보드에서 복용을 확인해 주세요.",
  },
  en: {
    title: "MedMinder · Medication reminder",
    body: "It is time to take your medication. Open the dashboard to confirm your dose.",
  },
  es: {
    title: "MedMinder · Recordatorio de medicación",
    body: "Es hora de tomar su medicamento. Abra el panel para confirmar su dosis.",
  },
};

function normalizeLang(raw: unknown): string {
  if (typeof raw !== "string") return "en";
  const base = raw.split("-")[0]?.toLowerCase() ?? "en";
  return base in DEFAULT_COPY ? base : "en";
}

function parsePushPayload(event: PushEvent): DosePushPayload {
  try {
    if (event.data) {
      return event.data.json() as DosePushPayload;
    }
  } catch {
    try {
      const text = event.data?.text();
      if (text) return JSON.parse(text) as DosePushPayload;
    } catch {
      /* ignore */
    }
  }
  return {};
}

serviceWorkerGlobal().addEventListener("push", (ev: Event) => {
  const event = ev as PushEvent;
  const payload = parsePushPayload(event);
  const lang = normalizeLang(payload.lang);
  const fallback = DEFAULT_COPY[lang] ?? DEFAULT_COPY.en;
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : fallback.title;
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : fallback.body;
  const openPath =
    typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/";

  event.waitUntil(
    serviceWorkerGlobal().registration.showNotification(title, {
      body,
      tag: typeof payload.tag === "string" && payload.tag ? payload.tag : "medminder-dose",
      data: { url: openPath },
    })
  );
});

serviceWorkerGlobal().addEventListener("notificationclick", (ev: Event) => {
  const event = ev as NotificationEvent;
  const sw = serviceWorkerGlobal();
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const rawPath =
    typeof data?.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const targetUrl = new URL(rawPath, sw.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await sw.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (client.url.startsWith(sw.registration.scope) && "focus" in client) {
          await (client as WindowClient).focus();
          return;
        }
      }
      await sw.clients.openWindow(targetUrl);
    })()
  );
});

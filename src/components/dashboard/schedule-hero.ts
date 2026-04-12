import type { TodayScheduleItem } from "@/app/actions/adherence-schedule";

export type TimelineVisualState = "completed" | "scheduled" | "overdue";

export function getTimelineState(item: TodayScheduleItem, nowMs: number): TimelineVisualState {
  if (item.status === "taken") return "completed";
  const t = new Date(item.scheduledTime).getTime();
  if (t < nowMs) return "overdue";
  return "scheduled";
}

export type HeroDoseSelection =
  | { kind: "active"; item: TodayScheduleItem }
  | { kind: "all_done"; lastTaken: TodayScheduleItem | null };

/**
 * Pick the dose to highlight: overdue first, then next upcoming; if all taken, surface last taken (dimmed).
 */
export function pickHeroDose(
  items: TodayScheduleItem[],
  now: Date = new Date()
): HeroDoseSelection | null {
  if (items.length === 0) return null;

  const nowMs = now.getTime();
  const incomplete = items.filter((i) => i.status !== "taken");
  if (incomplete.length > 0) {
    const overdue = incomplete.filter((i) => new Date(i.scheduledTime).getTime() < nowMs);
    if (overdue.length > 0) {
      const item = overdue.reduce((a, b) =>
        new Date(a.scheduledTime) < new Date(b.scheduledTime) ? a : b
      );
      return { kind: "active", item };
    }
    const upcoming = incomplete.reduce((a, b) =>
      new Date(a.scheduledTime) < new Date(b.scheduledTime) ? a : b
    );
    return { kind: "active", item: upcoming };
  }

  const taken = items.filter((i) => i.status === "taken");
  const lastTaken =
    taken.length === 0
      ? null
      : taken.reduce((a, b) =>
          new Date(a.scheduledTime) > new Date(b.scheduledTime) ? a : b
        );

  return { kind: "all_done", lastTaken };
}

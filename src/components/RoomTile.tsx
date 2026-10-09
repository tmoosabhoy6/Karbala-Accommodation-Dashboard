import { memo } from "react";
import { Bed, UsersThree } from "@phosphor-icons/react";
import type { Room, Stay } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { leaveKey, nights, roomState, STATUS_META, stayLabel, type RoomState, type RoomStatus } from "@/lib/status";
import { addDays, dayKey, diffDays, fmtShort, relDay, weekdayShort, type DayKey } from "@/lib/time";
import { cx } from "./ui";

/** The room number on a key fob, coloured by status. The signature of the app. */
export function KeyFob({ room, status, size = "md" }: { room: Room; status: RoomStatus; size?: "sm" | "md" | "lg" }) {
  const blocked = status === "blocked";
  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-end rounded-[7px] font-mono font-semibold tracking-[-0.02em] tnum",
        size === "sm" && "h-6 min-w-[52px] pr-2 pl-4 text-[12px]",
        size === "md" && "h-8 min-w-[64px] pr-2.5 pl-5 text-[14.5px]",
        size === "lg" && "h-12 min-w-[96px] pr-4 pl-8 text-[22px]",
        blocked ? "hatch text-ink-2 ring-1 ring-inset ring-blocked/50" : "text-white",
      )}
      style={{ background: blocked ? undefined : STATUS_META[status].color }}
    >
      <span
        className={cx("absolute top-1/2 -translate-y-1/2 rounded-full bg-canvas/90", size === "lg" ? "left-3 size-2.5" : "left-2 size-1.5")}
        style={{ boxShadow: "inset 0 1px 1px rgba(0,0,0,.25)" }}
      />
      {room.number.replace(/^Q /, "Q")}
    </span>
  );
}

export function NightStrip({ list, from, count = 10, className }: { list?: Stay[]; from: DayKey; count?: number; className?: string }) {
  const ns = nights(list, from, count);
  return (
    <div className={cx("flex gap-[2px]", className)} aria-hidden>
      {ns.map((n, i) => {
        const s = n.stays[0];
        const kind = !s ? "free" : s.category === "blocked" ? "blocked" : Date.parse(s.check_in) > Date.now() ? "booked" : "taken";
        return (
          <span
            key={n.key}
            title={`${fmtShort(n.key)}: ${s ? stayLabel(s) || CATEGORY_LABEL[s.category] : "free"}`}
            className={cx("h-[5px] flex-1 rounded-[1.5px]", kind === "blocked" && "hatch", i === 0 && "h-[7px] -mt-[1px]")}
            style={{
              background:
                kind === "free"
                  ? "color-mix(in oklab, var(--free) 22%, transparent)"
                  : kind === "booked"
                    ? "color-mix(in oklab, var(--arriving) 60%, transparent)"
                    : kind === "taken"
                      ? "color-mix(in oklab, var(--ink-1) 62%, transparent)"
                      : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

export function describeState(st: RoomState, today: DayKey): { who: string; when: string } {
  const cur = st.current[0];
  if (st.status === "blocked") return { who: cur ? stayLabel(cur) || "Blocked" : "Blocked", when: cur && leaveKey(cur) ? `until ${fmtShort(leaveKey(cur)!)}` : "until further notice" };
  if (st.partial) {
    return { who: `${st.used} of ${st.capacity} places taken`, when: `${st.capacity - st.used} free now` };
  }
  if (cur) {
    const lk = leaveKey(cur);
    const label = stayLabel(cur) || CATEGORY_LABEL[cur.category];
    if (!lk) return { who: label, when: "long stay" };
    const d = diffDays(today, lk);
    return { who: label, when: d <= 1 ? `out 08:00 ${relDay(lk, today)}` : `out ${weekdayShort(lk)} ${fmtShort(lk)}` };
  }
  if (st.next) {
    const nk = dayKey(Date.parse(st.next.check_in));
    const label = stayLabel(st.next);
    if (st.status === "arriving") return { who: label ? `${label} arriving` : "Arriving", when: relDay(nk, today) };
    return { who: "Vacant", when: `free until ${fmtShort(nk)}` };
  }
  return { who: "Vacant", when: "free" };
}

export const RoomTile = memo(function RoomTile({ room, list, now, onOpen, selected, compact }: { room: Room; list?: Stay[]; now: number; onOpen: (id: string) => void; selected?: boolean; compact?: boolean }) {
  const st = roomState(room, list, now);
  const today = dayKey(now);
  const d = describeState(st, today);
  const staffRoom = room.room_type === "Staff Room";
  return (
    <button
      type="button"
      onClick={() => onOpen(room.id)}
      className={cx(
        "press group flex w-full flex-col gap-2.5 rounded-md bg-raised p-3 text-left shadow-lift hover:shadow-lift-high",
        selected && "ring-2 ring-ink-1",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <KeyFob room={room} status={st.status} />
        <span className="flex items-center gap-1 text-[12px] text-ink-3 tnum">
          {room.sharing !== "none" ? <UsersThree size={14} /> : <Bed size={14} />}
          {staffRoom ? "staff" : room.extra_beds ? `${room.beds}+${room.extra_beds}` : room.beds}
        </span>
      </div>
      <div className="min-w-0">
        <div className={cx("truncate text-[13.5px] font-medium", st.status === "free" && !st.partial ? "text-ink-3" : "text-ink-1")}>{d.who}</div>
        <div className="truncate text-[12px] text-ink-3">{d.when}</div>
      </div>
      {!compact && <NightStrip list={list} from={today} />}
    </button>
  );
});

export function nextFreeLabel(st: RoomState, today: DayKey): string | null {
  if (!st.busyUntil || !Number.isFinite(st.busyUntil)) return null;
  const k = dayKey(st.busyUntil);
  return k === today ? "free from 08:00 today" : `free from ${fmtShort(k)}`;
}

export const tonight = (now: number) => dayKey(now);
export const inDays = (now: number, n: number) => addDays(dayKey(now), n);

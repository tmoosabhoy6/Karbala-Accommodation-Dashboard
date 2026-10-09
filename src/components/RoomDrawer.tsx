import * as RDialog from "@radix-ui/react-dialog";
import { useState } from "react";
import {
  ArrowsLeftRight,
  CalendarBlank,
  CheckCircle,
  Lock,
  PencilSimple,
  SignIn,
  SignOut,
  SlidersHorizontal,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useData, useMutate, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import { CATEGORY_LABEL, SHARING_LABEL, type Room, type Stay } from "@/lib/types";
import { capacity, coversNight, endMs, floorLabel, leaveKey, roomState, startMs, stayLabel } from "@/lib/status";
import { addDays, dayKey, diffDays, fmtDay, fmtShort, fmtWhen, relDay, at, DEFAULT_CHECKIN_TIME, type DayKey, clock } from "@/lib/time";
import { Button, cx, Eyebrow, Meter, StatusPill } from "./ui";
import { KeyFob } from "./RoomTile";

export function RoomDrawer() {
  const { roomId, openRoom } = useUi();
  const { room } = useData();
  const r = roomId ? room.get(roomId) : undefined;
  return (
    <RDialog.Root open={!!r} onOpenChange={(o) => !o && openRoom(null)}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-[fade_180ms_ease-out] lg:bg-black/10" />
        <RDialog.Content className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-canvas shadow-lift-high outline-none data-[state=open]:animate-[slide_260ms_cubic-bezier(0.23,1,0.32,1)] sm:w-[460px]">
          {r && <RoomPanel room={r} />}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function RoomPanel({ room }: { room: Room }) {
  const { byRoom, building } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { setDialog } = useUi();
  const list = byRoom.get(room.id) ?? [];
  const st = roomState(room, list, now);
  const upcoming = list.filter((s) => startMs(s) > now);
  const past = list.filter((s) => endMs(s) <= now).slice(-4).reverse();
  const b = building.get(room.building_id);
  const canCheckIn = st.status === "free" || st.status === "arriving" || st.status === "departing";

  return (
    <>
      <div className="flex items-start gap-4 border-b border-rule px-5 pt-5 pb-4">
        <KeyFob room={room} status={st.status} size="lg" />
        <div className="min-w-0 flex-1">
          <RDialog.Title className="text-[20px] font-semibold tracking-[-0.015em]">
            Room {room.number}
          </RDialog.Title>
          <RDialog.Description className="mt-0.5 text-[13px] text-ink-3">
            {b?.name} · {floorLabel(room.floor)} · {room.room_type}
          </RDialog.Description>
          <div className="mt-2">
            <StatusPill status={st.status}>{st.partial ? `${st.capacity - st.used} places free` : undefined}</StatusPill>
          </div>
        </div>
        <RDialog.Close className="press -mt-1 -mr-2 grid size-9 place-items-center rounded-sm text-ink-3 hover:bg-well hover:text-ink-1" aria-label="Close">
          <X size={18} />
        </RDialog.Close>
      </div>

      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-rule shadow-lift">
          <Fact label="Beds" value={room.beds || "—"} />
          <Fact label="Extra mattresses" value={room.extra_beds} />
          <Fact label="Use" value={SHARING_LABEL[room.sharing]} small />
        </div>

        {st.current.length > 0 ? (
          <div className="space-y-3">
            <Eyebrow>{st.status === "blocked" ? "Blocked" : st.current.length > 1 ? `Staying now · ${st.current.length} groups` : "Staying now"}</Eyebrow>
            {st.current.map((s) => (
              <StayCard key={s.id} stay={s} room={room} today={today} now={now} />
            ))}
          </div>
        ) : (
          <div className="rounded-md bg-card p-4 shadow-lift">
            <div className="text-[15px] font-medium">Vacant now</div>
            <div className="mt-0.5 text-[13px] text-ink-3">
              {st.next ? `Free until ${fmtDay(dayKey(startMs(st.next)))}, when ${stayLabel(st.next) || "the next booking"} arrives.` : "No bookings ahead."}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(canCheckIn || st.partial) && (
            <Button variant="primary" icon={<SignIn size={16} weight="bold" />} onClick={() => setDialog({ type: "checkin", roomId: room.id, from: st.status === "departing" && st.busyUntil ? st.busyUntil : undefined })}>
              {st.status === "departing" ? "Book after checkout" : "Check in here"}
            </Button>
          )}
          {st.status !== "blocked" && (
            <Button icon={<Lock size={15} />} onClick={() => setDialog({ type: "block", roomId: room.id })}>
              Block room
            </Button>
          )}
          <Button variant="ghost" icon={<SlidersHorizontal size={15} />} onClick={() => setDialog({ type: "room", roomId: room.id })}>
            Room details
          </Button>
        </div>

        <MonthCalendar room={room} list={list} today={today} />

        {upcoming.length > 0 && (
          <div className="space-y-3">
            <Eyebrow>Coming up</Eyebrow>
            {upcoming.map((s) => (
              <StayCard key={s.id} stay={s} room={room} today={today} now={now} upcoming />
            ))}
          </div>
        )}

        {past.length > 0 && (
          <div>
            <Eyebrow className="mb-2">Recent</Eyebrow>
            <ul className="divide-y divide-rule rounded-md bg-card shadow-lift">
              {past.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]">
                  <span className="truncate">{stayLabel(s) || CATEGORY_LABEL[s.category]}</span>
                  <span className="shrink-0 text-ink-3 tnum">
                    {fmtShort(dayKey(startMs(s)))} – {fmtShort(dayKey(endMs(s)))}
                    {s.transferred_to ? " · moved" : s.auto_checked_out ? "" : " · checked out"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {room.notes && (
          <div>
            <Eyebrow className="mb-1.5">Notes</Eyebrow>
            <p className="text-[13.5px] text-ink-2">{room.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Fact({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="bg-card px-3.5 py-3">
      <div className="text-[11.5px] text-ink-3">{label}</div>
      <div className={cx("mt-0.5 font-semibold tnum", small ? "text-[13.5px]" : "text-[18px]")}>{value}</div>
    </div>
  );
}

function StayCard({ stay, room, today, now, upcoming }: { stay: Stay; room: Room; today: DayKey; now: number; upcoming?: boolean }) {
  const { setDialog } = useUi();
  const mutate = useMutate();
  const [confirm, setConfirm] = useState<null | "out" | "cancel">(null);
  const inKey = dayKey(startMs(stay));
  const lk = leaveKey(stay);
  const total = lk ? Math.max(1, diffDays(inKey, lk)) : null;
  const done = Math.min(total ?? 0, Math.max(0, diffDays(inKey, today)));
  const label = stayLabel(stay);
  const blocked = stay.category === "blocked";

  return (
    <div className="rounded-md bg-card shadow-lift">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11.5px] font-medium text-ink-3">{CATEGORY_LABEL[stay.category]}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="truncate text-[16px] font-semibold tracking-[-0.01em]">{stay.group_name || stay.guest_name || CATEGORY_LABEL[stay.category]}</span>
              {stay.tour_id && <span className="shrink-0 font-mono text-[13px] text-ink-2 tnum">#{stay.tour_id}</span>}
            </div>
            {stay.guest_name && stay.group_name && <div className="text-[12.5px] text-ink-3">{stay.guest_name}</div>}
          </div>
          {!blocked && (
            <div className="shrink-0 text-right">
              <div className="text-[18px] font-semibold tnum">{stay.pax ?? "—"}</div>
              <div className="text-[11px] text-ink-3">pax</div>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="text-[11.5px] text-ink-3">{upcoming ? "Arrives" : "Checked in"}</div>
            <div className="font-medium tnum">{fmtWhen(startMs(stay))}</div>
            {!upcoming && !blocked && <div className="text-[11.5px] text-ink-3">{stay.arrived_at ? `arrived ${clock(Date.parse(stay.arrived_at))}` : relDay(inKey, today)}</div>}
            {upcoming && <div className="text-[11.5px] text-ink-3">{relDay(inKey, today)}</div>}
          </div>
          <div>
            <div className="text-[11.5px] text-ink-3">Checks out</div>
            <div className="font-medium tnum">{lk ? `${fmtDay(lk)}, 08:00` : "Open-ended"}</div>
            {lk && <div className="text-[11.5px] text-ink-3">{relDay(lk, today)}</div>}
          </div>
        </div>
        {!upcoming && total && (
          <div className="mt-3 flex items-center gap-3">
            <Meter value={done} max={total} className="flex-1" color="var(--ink-2)" />
            <span className="text-[11.5px] text-ink-3 tnum">
              night {Math.min(total, done + 1)} of {total}
            </span>
          </div>
        )}
        {(stay.phone || stay.notes) && (
          <div className="mt-3 space-y-0.5 text-[12.5px] text-ink-2">
            {stay.phone && <div>{stay.phone}</div>}
            {stay.notes && <div className="text-ink-3">{stay.notes}</div>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-rule px-2 py-2">
        {confirm ? (
          <>
            <span className="px-2 text-[13px] text-ink-2">{confirm === "out" ? `Check out ${label || "this stay"} now?` : "Cancel this booking?"}</span>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                const ok = await mutate(
                  (api) => api.updateStay(stay.id, confirm === "out" ? { checked_out_at: new Date().toISOString() } : { cancelled_at: new Date().toISOString() }),
                  confirm === "out" ? `Checked out of ${room.number}` : "Booking cancelled",
                );
                if (ok) setConfirm(null);
              }}
            >
              Yes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              No
            </Button>
          </>
        ) : (
          <>
            {!upcoming && (
              <Button size="sm" variant="ghost" icon={<SignOut size={15} />} onClick={() => setConfirm("out")}>
                {blocked ? "Unblock" : "Check out"}
              </Button>
            )}
            {!blocked && (
              <Button size="sm" variant="ghost" icon={<ArrowsLeftRight size={15} />} onClick={() => setDialog({ type: "transfer", stayId: stay.id })}>
                {upcoming ? "Move" : "Transfer"}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<CalendarBlank size={15} />} onClick={() => setDialog({ type: "dates", stayId: stay.id })}>
              Dates
            </Button>
            <Button size="sm" variant="ghost" icon={<PencilSimple size={15} />} onClick={() => setDialog({ type: "edit", stayId: stay.id })}>
              Edit
            </Button>
            {!upcoming && !blocked && !stay.arrived_at && (
              <Button
                size="sm"
                variant="ghost"
                icon={<CheckCircle size={15} />}
                onClick={() => mutate((api) => api.updateStay(stay.id, { arrived_at: new Date().toISOString() }), "Marked as arrived")}
              >
                Arrived
              </Button>
            )}
            {upcoming && (
              <Button size="sm" variant="ghost" icon={<Trash size={15} />} onClick={() => setConfirm("cancel")}>
                Cancel
              </Button>
            )}
          </>
        )}
      </div>
      {upcoming && Date.parse(stay.check_in) - now < 36 * 3600 * 1000 && (
        <div className="border-t border-rule px-2 py-2">
          <Button
            size="sm"
            variant="quiet"
            className="w-full"
            icon={<SignIn size={15} />}
            onClick={() => mutate((api) => api.updateStay(stay.id, { check_in: new Date().toISOString(), arrived_at: new Date().toISOString() }), `${label || "Guests"} checked in to ${room.number}`)}
          >
            They're here, check in now
          </Button>
        </div>
      )}
    </div>
  );
}

function MonthCalendar({ room, list, today }: { room: Room; list: Stay[]; today: DayKey }) {
  const { setDialog } = useUi();
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = addDays(today, -dow); // week starts Sunday
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const cap = capacity(room);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <Eyebrow>Next 5 weeks</Eyebrow>
        <span className="text-[11.5px] text-ink-3">Tap a free night to book it</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="pb-1 text-center text-[11px] text-ink-4">
            {d}
          </div>
        ))}
        {days.map((k) => {
          const stays = list.filter((s) => coversNight(s, k));
          const past = k < today;
          const blocked = stays.some((s) => s.category === "blocked");
          const used = stays.reduce((n, s) => n + (s.pax ?? (room.sharing === "none" ? cap : 1)), 0);
          const full = blocked || (room.sharing === "none" ? stays.length > 0 : used >= cap);
          const future = stays.some((s) => Date.parse(s.check_in) > Date.now());
          const label = stays[0] ? stayLabel(stays[0]) : "";
          const leaving = list.some((s) => leaveKey(s) === addDays(k, 1) && coversNight(s, k));
          return (
            <button
              key={k}
              type="button"
              disabled={past || full}
              title={`${fmtDay(k)}${label ? ` · ${label}` : " · free"}`}
              onClick={() => setDialog({ type: "checkin", roomId: room.id, from: +at(k, DEFAULT_CHECKIN_TIME) })}
              className={cx(
                "press relative flex aspect-square flex-col items-center justify-center rounded-[6px] text-[12px] tnum disabled:cursor-default",
                k === today && "ring-2 ring-ink-1",
                past && "opacity-40",
                blocked && "hatch",
                !full && !past && "hover:ring-1 hover:ring-ink-3",
              )}
              style={{
                background: blocked
                  ? undefined
                  : full
                    ? future
                      ? "color-mix(in oklab, var(--arriving) 70%, transparent)"
                      : leaving
                        ? "color-mix(in oklab, var(--departing) 75%, transparent)"
                        : "color-mix(in oklab, var(--occupied) 78%, transparent)"
                    : used > 0
                      ? "color-mix(in oklab, var(--free) 35%, transparent)"
                      : "color-mix(in oklab, var(--free) 12%, transparent)",
                color: full && !blocked ? "white" : undefined,
              }}
            >
              {Number(k.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <Legend color="var(--occupied)">Occupied</Legend>
        <Legend color="var(--departing)">Last night</Legend>
        <Legend color="var(--arriving)">Booked</Legend>
        <Legend color="color-mix(in oklab, var(--free) 30%, transparent)">Free</Legend>
      </div>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      {children}
    </span>
  );
}

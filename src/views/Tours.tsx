import { useMemo, useState } from "react";
import { CalendarPlus, CheckCircle, MagnifyingGlass, SignOut, UsersThree, XCircle } from "@phosphor-icons/react";
import { useData, useMutate, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import type { Stay } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { endMs, floorLabel, startMs, stayLabel } from "@/lib/status";
import { addDays, checkoutAt, dayKey, diffDays, fmtDay, fmtShort, fmtWhen, relDay } from "@/lib/time";
import { fmtHijri } from "@/lib/hijri";
import { Button, Card, Chip, cx, Empty, Eyebrow } from "@/components/ui";
import { KeyFob } from "@/components/RoomTile";

interface Group {
  key: string;
  tourId: string | null;
  label: string;
  stays: Stay[];
  pax: number;
  from: number;
  to: number;
  phase: "in" | "due" | "past";
}

type Phase = "in" | "due" | "past";

export function Tours() {
  const { snap, room } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { tourId, go } = useUi();
  const [phase, setPhase] = useState<Phase>("in");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const s of snap.stays) {
      if (s.cancelled_at || s.category === "blocked" || s.category === "staff") continue;
      const label = stayLabel(s) || CATEGORY_LABEL[s.category];
      const key = s.tour_id || label.toLowerCase();
      const g = m.get(key) ?? { key, tourId: s.tour_id, label: s.group_name || label, stays: [], pax: 0, from: Infinity, to: 0, phase: "past" as Phase };
      g.stays.push(s);
      m.set(key, g);
    }
    for (const g of m.values()) {
      const live = g.stays.filter((s) => endMs(s) > now);
      const use = live.length ? live : g.stays;
      g.pax = use.reduce((n, s) => n + (s.pax ?? 0), 0);
      g.from = Math.min(...use.map(startMs));
      g.to = Math.max(...use.map(endMs));
      g.phase = live.some((s) => startMs(s) <= now) ? "in" : live.length ? "due" : "past";
      g.stays = use;
    }
    return [...m.values()];
  }, [snap.stays, now]);

  const counts = { in: groups.filter((g) => g.phase === "in").length, due: groups.filter((g) => g.phase === "due").length, past: groups.filter((g) => g.phase === "past").length };
  const n = q.trim().toLowerCase();
  const list = groups
    .filter((g) => g.phase === phase)
    .filter((g) => !n || g.key.includes(n) || g.label.toLowerCase().includes(n))
    .sort((a, b) => (phase === "past" ? b.to - a.to : phase === "due" ? a.from - b.from : a.to - b.to));
  const selected = groups.find((g) => g.key === tourId || g.tourId === tourId) ?? null;

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <div>
        <Eyebrow>Tours</Eyebrow>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">Groups and their rooms</h1>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Chip active={phase === "in"} onClick={() => setPhase("in")}>
              In house <span className="tnum opacity-60">{counts.in}</span>
            </Chip>
            <Chip active={phase === "due"} onClick={() => setPhase("due")}>
              Booked <span className="tnum opacity-60">{counts.due}</span>
            </Chip>
            <Chip active={phase === "past"} onClick={() => setPhase("past")}>
              Left <span className="tnum opacity-60">{counts.past}</span>
            </Chip>
          </div>
          <div className="relative">
            <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tour ID or group" className="h-9 w-full rounded-sm bg-well pr-3 pl-8 text-[13.5px] outline-none ring-1 ring-inset ring-rule focus:ring-2 focus:ring-ink-1" />
          </div>
          <Card className="overflow-hidden">
            {list.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-3">Nobody here.</div>}
            {list.map((g) => {
              const leave = Number.isFinite(g.to) ? dayKey(g.to) : null;
              return (
                <button
                  key={g.key}
                  onClick={() => go("tours", { tourId: g.tourId ?? g.key })}
                  className={cx("flex w-full items-center gap-3 border-b border-rule px-4 py-3 text-left last:border-b-0 hover:bg-well/60", selected?.key === g.key && "bg-well")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {g.tourId && <span className="font-mono text-[13.5px] font-semibold tnum">{g.tourId}</span>}
                      <span className="truncate text-[13.5px] font-medium">{g.label}</span>
                    </div>
                    <div className="text-[12px] text-ink-3">
                      {g.stays.length} room{g.stays.length === 1 ? "" : "s"} · {g.pax || "?"} pax ·{" "}
                      {g.phase === "due" ? `arrives ${relDay(dayKey(g.from), today)}` : leave ? (g.phase === "past" ? `left ${fmtShort(leave)}` : `out ${relDay(leave, today)}`) : "open-ended"}
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {g.stays.slice(0, 3).map((s) => {
                      const r = room.get(s.room_id);
                      return r ? <KeyFob key={s.id} room={r} status={g.phase === "due" ? "arriving" : g.phase === "past" ? "blocked" : leave && diffDays(today, leave) <= 1 ? "departing" : "occupied"} size="sm" /> : null;
                    })}
                  </div>
                </button>
              );
            })}
          </Card>
        </div>

        <div className="min-w-0">
          {selected ? (
            <GroupDetail g={selected} />
          ) : (
            <Card>
              <Empty title="Pick a group" icon={<UsersThree size={32} />}>
                See every room a tour holds, and check them all out, extend or cancel in one go.
              </Empty>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupDetail({ g }: { g: Group }) {
  const { room, building, tour } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { go, openRoom, hijriAdjust } = useUi();
  const mutate = useMutate();
  const t = g.tourId ? tour.get(g.tourId) : undefined;
  const live = g.stays.filter((s) => endMs(s) > now);
  const inHouse = live.filter((s) => startMs(s) <= now);
  const future = live.filter((s) => startMs(s) > now);
  const notArrived = live.filter((s) => !s.arrived_at);
  const leave = Number.isFinite(g.to) ? dayKey(g.to) : null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            {g.tourId && <span className="font-mono text-[22px] font-semibold tnum">{g.tourId}</span>}
            <span className="text-[18px] font-semibold tracking-[-0.01em]">{g.label}</span>
          </div>
          <div className="mt-1 text-[13px] text-ink-3">
            {g.pax} pax in {g.stays.length} room{g.stays.length === 1 ? "" : "s"} · {fmtDay(dayKey(g.from))} to {leave ? `${fmtDay(leave)}, 08:00` : "open-ended"}
          </div>
          {leave && <div className="text-[12px] text-ink-3">{fmtHijri(dayKey(g.from), hijriAdjust, true)} to {fmtHijri(leave, hijriAdjust, true)}</div>}
          {t && (
            <div className="mt-2 text-[12.5px] text-ink-2">
              ERP: {t.pax_required} need rooms · in Iraq {t.arrival ? fmtShort(dayKey(Date.parse(t.arrival))) : "?"} to {t.departure ? fmtShort(dayKey(Date.parse(t.departure))) : "?"} ·{" "}
              <button className="font-medium underline-offset-2 hover:underline" onClick={() => go("planner", { tourId: t.tour_id })}>
                open in planner
              </button>
            </div>
          )}
        </div>
      </div>

      {g.phase !== "past" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {inHouse.length > 0 && (
            <Button
              variant="primary"
              icon={<SignOut size={15} />}
              onClick={() => mutate(async (api) => { for (const s of inHouse) await api.updateStay(s.id, { checked_out_at: new Date().toISOString() }); }, `Checked out ${inHouse.length} room${inHouse.length === 1 ? "" : "s"}`)}
            >
              Check out all {inHouse.length}
            </Button>
          )}
          {notArrived.length > 0 && future.length === 0 && (
            <Button icon={<CheckCircle size={15} />} onClick={() => mutate(async (api) => { for (const s of notArrived) await api.updateStay(s.id, { arrived_at: new Date().toISOString() }); }, "Marked as arrived")}>
              Mark all arrived
            </Button>
          )}
          {future.length > 0 && (
            <Button
              variant="primary"
              icon={<CheckCircle size={15} />}
              onClick={() => mutate(async (api) => { for (const s of future) await api.updateStay(s.id, { check_in: new Date().toISOString(), arrived_at: new Date().toISOString() }); }, "Checked in")}
            >
              They're here, check in {future.length}
            </Button>
          )}
          {leave && live.length > 0 && (
            <Button
              icon={<CalendarPlus size={15} />}
              onClick={() => mutate(async (api) => { for (const s of live) if (s.check_out) await api.updateStay(s.id, { check_out: checkoutAt(addDays(dayKey(Date.parse(s.check_out)), 1)).toISOString() }); }, "Extended by one night")}
            >
              Extend one night
            </Button>
          )}
          {future.length > 0 && (
            <Button variant="ghost" icon={<XCircle size={15} />} onClick={() => mutate(async (api) => { for (const s of future) await api.updateStay(s.id, { cancelled_at: new Date().toISOString() }); }, "Booking cancelled")}>
              Cancel booking
            </Button>
          )}
        </div>
      )}

      <div className="mt-5 divide-y divide-rule">
        {g.stays.map((s) => {
          const r = room.get(s.room_id);
          if (!r) return null;
          return (
            <button key={s.id} onClick={() => openRoom(r.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-well/50">
              <KeyFob room={r} status={startMs(s) > now ? "arriving" : endMs(s) <= now ? "blocked" : Number.isFinite(endMs(s)) && diffDays(today, dayKey(endMs(s))) <= 1 ? "departing" : "occupied"} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">
                  {building.get(r.building_id)?.name} · {floorLabel(r.floor)} · {r.room_type}
                </div>
                <div className="truncate text-[12px] text-ink-3">
                  in {fmtWhen(startMs(s))} · {Number.isFinite(endMs(s)) ? `out ${fmtWhen(endMs(s))}` : "open-ended"}
                  {s.notes ? ` · ${s.notes}` : ""}
                </div>
              </div>
              <span className="text-[13px] tnum text-ink-2">
                {s.pax ?? "?"}/{r.beds}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

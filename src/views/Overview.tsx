import { useMemo, useState } from "react";
import { ArrowRight, Bed, SignIn, SignOut, Sparkle } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import type { Room, Stay } from "@/lib/types";
import { coversNight, floorLabel, leaveKey, roomState, startMs, STATUS_META, STATUS_ORDER, stayLabel, type RoomState, type RoomStatus } from "@/lib/status";
import { addDays, dayKey, fmtDay, fmtShort, relDay, weekdayShort, type DayKey } from "@/lib/time";
import { fmtHijri } from "@/lib/hijri";
import { Button, Card, cx, Empty, Eyebrow, StatusDot } from "@/components/ui";
import { KeyFob } from "@/components/RoomTile";

type Entry = { room: Room; st: RoomState };

export function Overview() {
  const { rooms, byRoom, buildings } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { go, openRoom, setFloor, setDialog } = useUi();

  const entries: Entry[] = useMemo(() => rooms.filter((r) => r.room_type !== "Staff Room").map((room) => ({ room, st: roomState(room, byRoom.get(room.id), now) })), [rooms, byRoom, now]);
  const counts = useMemo(() => {
    const c: Record<RoomStatus, number> = { free: 0, arriving: 0, departing: 0, occupied: 0, blocked: 0 };
    for (const e of entries) c[e.st.status]++;
    return c;
  }, [entries]);

  const usable = entries.filter((e) => e.st.status !== "blocked");
  const bedsTotal = usable.reduce((n, e) => n + e.room.beds, 0);
  const bedsUsed = usable.reduce((n, e) => n + (e.st.partial ? e.st.used : e.st.current.length ? e.room.beds : 0), 0);
  const roomsUsed = usable.filter((e) => e.st.current.length && !e.st.partial).length;
  const pct = bedsTotal ? Math.round((bedsUsed / bedsTotal) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1360px] space-y-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-end">
        <div>
          <Eyebrow>Tonight across both buildings</Eyebrow>
          <div className="mt-2 flex items-end gap-4">
            <div className="text-[64px] leading-[0.9] font-semibold tracking-[-0.045em] tnum sm:text-[84px]">
              {pct}
              <span className="text-[0.45em] tracking-[-0.02em] text-ink-3">%</span>
            </div>
            <div className="pb-1.5 text-[13.5px] leading-snug text-ink-2">
              <div>
                <span className="font-semibold text-ink-1 tnum">{bedsUsed}</span> of {bedsTotal} beds in use
              </div>
              <div>
                <span className="font-semibold text-ink-1 tnum">{roomsUsed}</span> of {usable.length} rooms occupied
              </div>
            </div>
          </div>
        </div>
        <StatusBar counts={counts} onPick={() => go("rooms")} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {buildings.map((b) => (
          <BuildingCard key={b.id} name={b.name} entries={entries.filter((e) => e.room.building_id === b.id)} onFloor={(f) => { setFloor(b.id, f); go("floors", { buildingId: b.id, floor: f }); }} onRoom={openRoom} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Departures entries={entries} today={today} onRoom={openRoom} />
        <Arrivals entries={entries} today={today} now={now} onRoom={openRoom} />
        <FreeNow entries={entries} onFind={() => go("allocate")} onCheckIn={() => setDialog({ type: "checkin" })} />
      </section>

      <Forecast today={today} />
    </div>
  );
}

function StatusBar({ counts, onPick }: { counts: Record<RoomStatus, number>; onPick: () => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {STATUS_ORDER.map((s) =>
          counts[s] ? <div key={s} className={cx("h-full first:rounded-l-full last:rounded-r-full", s === "blocked" && "hatch")} style={{ width: `${(counts[s] / total) * 100}%`, background: s === "blocked" ? undefined : STATUS_META[s].color }} /> : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <button key={s} onClick={onPick} className="press group text-left">
            <div className="flex items-center gap-1.5 text-[12px] text-ink-3 group-hover:text-ink-1">
              <StatusDot status={s} />
              {STATUS_META[s].label}
            </div>
            <div className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tnum">{counts[s]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BuildingCard({ name, entries, onFloor, onRoom }: { name: string; entries: Entry[]; onFloor: (f: string) => void; onRoom: (id: string) => void }) {
  const floors = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) m.set(e.room.floor, [...(m.get(e.room.floor) ?? []), e]);
    return [...m.entries()].sort((a, b) => a[1][0].room.floor_sort - b[1][0].room.floor_sort);
  }, [entries]);
  const usable = entries.filter((e) => e.st.status !== "blocked");
  const free = entries.filter((e) => e.st.status === "free" && !e.st.partial).length;
  const occ = usable.length ? Math.round((usable.filter((e) => e.st.current.length).length / usable.length) * 100) : 0;
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.02em]">{name}</h2>
        <div className="text-[13px] text-ink-3">
          <span className="font-semibold text-ink-1 tnum">{occ}%</span> occupied · <span className="font-semibold text-ink-1 tnum">{free}</span> free rooms
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {floors.map(([floor, list]) => (
          <div key={floor} className="grid grid-cols-[76px_1fr_auto] items-center gap-3">
            <button onClick={() => onFloor(floor)} className="press text-left text-[12.5px] font-medium text-ink-2 hover:text-ink-1">
              {floorLabel(floor)}
            </button>
            <div className="flex flex-wrap gap-[3px]">
              {list.map((e) => (
                <button
                  key={e.room.id}
                  onClick={() => onRoom(e.room.id)}
                  title={`${e.room.number} · ${STATUS_META[e.st.status].label}${e.st.current[0] ? ` · ${stayLabel(e.st.current[0])}` : ""}`}
                  className={cx("press h-[18px] w-[22px] rounded-[3px] hover:ring-2 hover:ring-ink-1 hover:ring-offset-1 hover:ring-offset-card", e.st.status === "blocked" && "hatch ring-1 ring-inset ring-blocked/40")}
                  style={{ background: e.st.status === "blocked" ? undefined : e.st.partial ? `color-mix(in oklab, var(--free) 55%, transparent)` : STATUS_META[e.st.status].color }}
                />
              ))}
            </div>
            <button onClick={() => onFloor(floor)} className="press grid size-7 place-items-center rounded-sm text-ink-3 hover:bg-well hover:text-ink-1" aria-label={`Open ${floorLabel(floor)}`}>
              <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function groupByLabel(list: { room: Room; stay: Stay }[]) {
  const m = new Map<string, { label: string; tourId: string | null; rooms: Room[]; pax: number }>();
  for (const { room, stay } of list) {
    const label = stayLabel(stay) || "Guest";
    const e = m.get(label) ?? { label, tourId: stay.tour_id, rooms: [], pax: 0 };
    e.rooms.push(room);
    e.pax += stay.pax ?? 0;
    m.set(label, e);
  }
  return [...m.values()].sort((a, b) => b.rooms.length - a.rooms.length);
}

function ListCard({ title, icon, sub, children, empty }: { title: string; icon: React.ReactNode; sub: string; children: React.ReactNode; empty: boolean }) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3 px-5 pt-5 pb-3">
        <div className="grid size-8 place-items-center rounded-sm bg-well text-ink-2">{icon}</div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
          <div className="text-[12.5px] text-ink-3">{sub}</div>
        </div>
      </div>
      <div className="scrollbar-thin max-h-[340px] flex-1 overflow-y-auto px-2 pb-3">{empty ? <Empty title="Nothing here" /> : children}</div>
    </Card>
  );
}

function GroupRow({ g, onRoom, note }: { g: ReturnType<typeof groupByLabel>[number]; onRoom: (id: string) => void; note?: string }) {
  return (
    <div className="rounded-sm px-3 py-2.5 hover:bg-well/60">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13.5px] font-medium">{g.label}</span>
        <span className="shrink-0 text-[12px] text-ink-3 tnum">
          {g.rooms.length} room{g.rooms.length > 1 ? "s" : ""}
          {g.pax ? ` · ${g.pax} pax` : ""}
          {note ? ` · ${note}` : ""}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {g.rooms.map((r) => (
          <button key={r.id} onClick={() => onRoom(r.id)} className="press rounded-[4px] bg-well px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:bg-ink-1 hover:text-canvas tnum">
            {r.number}
          </button>
        ))}
      </div>
    </div>
  );
}

function Departures({ entries, today, onRoom }: { entries: Entry[]; today: DayKey; onRoom: (id: string) => void }) {
  const tomorrow = addDays(today, 1);
  const leaving = entries.flatMap((e) => e.st.current.filter((s) => s.category !== "blocked" && leaveKey(s) && leaveKey(s)! <= tomorrow).map((stay) => ({ room: e.room, stay })));
  const todayList = groupByLabel(leaving.filter((x) => leaveKey(x.stay) === today));
  const tomList = groupByLabel(leaving.filter((x) => leaveKey(x.stay) === tomorrow));
  return (
    <ListCard title="Checking out" icon={<SignOut size={16} />} sub={`${leaving.length} rooms by 08:00 · they free up on their own`} empty={!leaving.length}>
      {todayList.length > 0 && <div className="px-3 pt-1 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">This morning</div>}
      {todayList.map((g) => (
        <GroupRow key={g.label} g={g} onRoom={onRoom} />
      ))}
      {tomList.length > 0 && <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">Tomorrow {fmtShort(tomorrow)}</div>}
      {tomList.map((g) => (
        <GroupRow key={g.label} g={g} onRoom={onRoom} />
      ))}
    </ListCard>
  );
}

function Arrivals({ entries, today, now, onRoom }: { entries: Entry[]; today: DayKey; now: number; onRoom: (id: string) => void }) {
  const { byRoom } = useData();
  const until = addDays(today, 2);
  const list = entries.flatMap((e) => (byRoom.get(e.room.id) ?? []).filter((s) => startMs(s) > now && dayKey(startMs(s)) < until && s.category !== "blocked").map((stay) => ({ room: e.room, stay })));
  const notArrived = entries.flatMap((e) => e.st.current.filter((s) => s.source === "app" && !s.arrived_at && s.category === "tour").map((stay) => ({ room: e.room, stay })));
  const byDay = (k: DayKey) => groupByLabel(list.filter((x) => dayKey(startMs(x.stay)) === k));
  return (
    <ListCard title="Arriving" icon={<SignIn size={16} />} sub={`${list.length} rooms booked for today and tomorrow`} empty={!list.length && !notArrived.length}>
      {notArrived.length > 0 && (
        <>
          <div className="px-3 pt-1 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-departing">Expected, not marked arrived</div>
          {groupByLabel(notArrived).map((g) => (
            <GroupRow key={g.label} g={g} onRoom={onRoom} />
          ))}
        </>
      )}
      {[today, addDays(today, 1)].map((k) => {
        const gs = byDay(k);
        if (!gs.length) return null;
        return (
          <div key={k}>
            <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">{relDay(k, today) === "today" ? "Later today" : `Tomorrow ${fmtShort(k)}`}</div>
            {gs.map((g) => (
              <GroupRow key={g.label} g={g} onRoom={onRoom} />
            ))}
          </div>
        );
      })}
    </ListCard>
  );
}

function FreeNow({ entries, onFind, onCheckIn }: { entries: Entry[]; onFind: () => void; onCheckIn: () => void }) {
  const free = entries.filter((e) => e.st.status === "free");
  const sizes = [2, 3, 4, 5].map((n) => ({
    n,
    rooms: free.filter((e) => !e.st.partial && (n === 5 ? e.room.beds >= 5 : e.room.beds === n)),
  }));
  const sharing = free.filter((e) => e.st.partial || e.room.sharing !== "none");
  const beds = free.reduce((n, e) => n + (e.st.partial ? e.st.capacity - e.st.used : e.room.beds), 0);
  const { openRoom } = useUi();
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-8 place-items-center rounded-sm bg-well text-ink-2">
          <Bed size={16} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Free right now</h3>
          <div className="text-[12.5px] text-ink-3">
            {free.length} rooms · {beds} beds
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {sizes.map(({ n, rooms }) => (
          <div key={n}>
            <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
              <span className="text-ink-2">{n === 5 ? "5+ beds" : `${n} beds`}</span>
              <span className="font-semibold tnum">{rooms.length}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {rooms.slice(0, 14).map((e) => (
                <button key={e.room.id} onClick={() => openRoom(e.room.id)} className="press">
                  <KeyFob room={e.room} status="free" size="sm" />
                </button>
              ))}
              {rooms.length > 14 && <span className="self-center text-[12px] text-ink-3">+{rooms.length - 14}</span>}
            </div>
          </div>
        ))}
        {sharing.length > 0 && (
          <div className="text-[12.5px] text-ink-3">
            Sharing: {sharing.map((e) => `${e.room.number} (${e.st.capacity - e.st.used} free, ${e.room.sharing})`).join(", ")}
          </div>
        )}
      </div>
      <div className="mt-auto flex gap-2 pt-5">
        <Button variant="primary" icon={<Sparkle size={15} weight="fill" />} onClick={onFind} className="flex-1">
          Rooms for a group
        </Button>
        <Button onClick={onCheckIn}>Check in</Button>
      </div>
    </Card>
  );
}

function Forecast({ today }: { today: DayKey }) {
  const { rooms, byRoom, snap } = useData();
  const { hijriAdjust, go } = useUi();
  const [hover, setHover] = useState<number | null>(null);
  const DAYS = 21;
  const data = useMemo(() => {
    const guestRooms = rooms.filter((r) => r.room_type !== "Staff Room");
    const allocatedTours = new Set(snap.stays.filter((s) => s.tour_id).map((s) => s.tour_id!));
    return Array.from({ length: DAYS }, (_, i) => {
      const k = addDays(today, i);
      let inHouse = 0;
      let booked = 0;
      let blocked = 0;
      let cap = 0;
      for (const r of guestRooms) {
        const stays = (byRoom.get(r.id) ?? []).filter((s) => coversNight(s, k));
        if (stays.some((s) => s.category === "blocked")) {
          blocked += r.beds;
          continue;
        }
        cap += r.beds;
        for (const s of stays) {
          const n = Math.min(r.beds || 1, s.pax ?? (r.sharing === "none" ? r.beds : 1));
          if (Date.parse(s.check_in) > Date.now()) booked += n;
          else inHouse += n;
        }
      }
      // ERP tours that still need rooms that night
      let demand = 0;
      for (const t of snap.tours) {
        if (t.status !== "open" || allocatedTours.has(t.tour_id) || !t.karbala_in || !t.karbala_out) continue;
        const tin = Date.parse(t.karbala_in);
        const tout = Date.parse(t.karbala_out);
        if (tin < Date.parse(`${addDays(k, 1)}T05:00:00+03:00`) && tout > Date.parse(`${addDays(k, 1)}T04:59:00+03:00`)) demand += t.pax_required;
      }
      return { k, inHouse: Math.min(inHouse, cap), booked: Math.min(booked, Math.max(0, cap - inHouse)), demand, cap, blocked };
    });
  }, [rooms, byRoom, snap.tours, snap.stays, today]);
  const max = Math.max(...data.map((d) => Math.max(d.cap, d.inHouse + d.booked + d.demand))) || 1;
  const H = 180;
  const h = hover !== null ? data[hover] : null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Next three weeks</h3>
          <div className="text-[12.5px] text-ink-3">Beds used each night, against the beds you have</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          <LegendItem swatch={<span className="size-2.5 rounded-[2px] bg-occupied" />}>In house</LegendItem>
          <LegendItem swatch={<span className="size-2.5 rounded-[2px] bg-arriving" />}>Booked</LegendItem>
          <LegendItem swatch={<span className="hatch size-2.5 rounded-[2px] ring-1 ring-inset ring-ink-3" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--ink-3) 0 1.5px, transparent 1.5px 4px)" }} />}>Planner tours with no rooms yet</LegendItem>
          <LegendItem swatch={<span className="h-0 w-3 border-t border-dashed border-ink-2" />}>Beds available</LegendItem>
        </div>
      </div>
      <div className="relative mt-5" onMouseLeave={() => setHover(null)}>
        <div className="flex items-end gap-[3px]" style={{ height: H }}>
          {data.map((d, i) => {
            const y = (v: number) => (v / max) * H;
            const over = d.inHouse + d.booked + d.demand > d.cap;
            return (
              <div key={d.k} className="relative flex h-full flex-1 cursor-default flex-col justify-end" onMouseEnter={() => setHover(i)} onClick={() => go("timeline")}>
                <div className="absolute inset-x-0 border-t border-dashed border-ink-3/70" style={{ bottom: y(d.cap) }} />
                {d.demand > 0 && (
                  <div
                    className={cx("w-full rounded-t-[4px] ring-1 ring-inset", over ? "ring-occupied" : "ring-ink-3")}
                    style={{ height: y(d.demand), backgroundImage: `repeating-linear-gradient(135deg, ${over ? "var(--occupied)" : "var(--ink-3)"} 0 1.5px, transparent 1.5px 5px)`, marginBottom: 2 }}
                  />
                )}
                {d.booked > 0 && <div className={cx("w-full bg-arriving", d.demand ? "" : "rounded-t-[4px]")} style={{ height: y(d.booked), marginBottom: d.inHouse ? 2 : 0 }} />}
                <div className={cx("w-full bg-occupied", !d.booked && !d.demand && "rounded-t-[4px]")} style={{ height: y(d.inHouse) }} />
                {hover === i && <div className="absolute inset-x-[-1px] top-0 bottom-0 rounded-[4px] bg-ink-1/[0.04]" />}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-[3px]">
          {data.map((d, i) => (
            <div key={d.k} className={cx("flex-1 text-center text-[10.5px] tnum", i === 0 ? "font-semibold text-ink-1" : "text-ink-4")}>
              <div>{weekdayShort(d.k).slice(0, 2)}</div>
              <div>{Number(d.k.slice(8))}</div>
            </div>
          ))}
        </div>
        {h && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-[220px] rounded-md bg-raised p-3 text-[12.5px] shadow-lift-high"
            style={{ left: `clamp(0px, calc(${((hover! + 0.5) / DAYS) * 100}% - 110px), calc(100% - 220px))` }}
          >
            <div className="font-semibold">Night of {fmtDay(h.k)}</div>
            <div className="mb-2 text-[11.5px] text-ink-3">{fmtHijri(h.k, hijriAdjust)}</div>
            <Row label="In house" value={h.inHouse} />
            <Row label="Booked" value={h.booked} />
            {h.demand > 0 && <Row label="Planner, unassigned" value={h.demand} />}
            <Row label="Beds available" value={h.cap} />
            <div className="mt-1.5 border-t border-rule pt-1.5">
              <Row label="Spare" value={h.cap - h.inHouse - h.booked - h.demand} strong />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink-2">{label}</span>
      <span className={cx("tnum", strong ? "font-semibold" : "", value < 0 && "text-occupied")}>{value}</span>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}


import { useMemo, useRef, useState } from "react";
import { Cube, GridFour, SignOut } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import type { Room } from "@/lib/types";
import { SHARING_LABEL } from "@/lib/types";
import { floorLabel, leaveKey, roomState, STATUS_META, STATUS_ORDER, stayLabel, type RoomState, type RoomStatus } from "@/lib/status";
import { addDays, at, dayKey, diffDays, fmtDay, fmtShort, relDay, weekdayShort, type DayKey } from "@/lib/time";
import { fmtHijri } from "@/lib/hijri";
import { Card, Chip, cx, Empty, Eyebrow, Segmented, StatusDot } from "@/components/ui";
import { describeState, KeyFob, RoomTile } from "@/components/RoomTile";

type Entry = { room: Room; st: RoomState };

export function Floors() {
  const { rooms, byRoom, buildings } = useData();
  const realNow = useNow();
  const ui = useUi();
  const [mode, setMode] = useState<"3d" | "plan">(() => (matchMedia("(max-width: 640px)").matches ? "plan" : "3d"));
  const [offset, setOffset] = useState(0);
  const [only, setOnly] = useState<RoomStatus | null>(null);
  const [type, setType] = useState<string | null>(null);

  const today = dayKey(realNow);
  const viewDay = addDays(today, offset);
  // Looking ahead shows each room as it will be that evening.
  const now = offset === 0 ? realNow : +at(viewDay, "20:00");

  const buildingId = ui.buildingId && buildings.some((b) => b.id === ui.buildingId) ? ui.buildingId : buildings[0]?.id;
  const inBuilding = useMemo(() => rooms.filter((r) => r.building_id === buildingId && r.room_type !== "Staff Room"), [rooms, buildingId]);
  const floors = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const room of inBuilding) {
      const e = { room, st: roomState(room, byRoom.get(room.id), now) };
      m.set(room.floor, [...(m.get(room.floor) ?? []), e]);
    }
    return [...m.entries()].sort((a, b) => b[1][0].room.floor_sort - a[1][0].room.floor_sort);
  }, [inBuilding, byRoom, now]);
  const busiest = [...floors].sort((a, b) => b[1].length - a[1].length || a[1][0].room.floor_sort - b[1][0].room.floor_sort)[0]?.[0];
  const floor = ui.floor && floors.some(([f]) => f === ui.floor) ? ui.floor : busiest;
  const entries = floors.find(([f]) => f === floor)?.[1] ?? [];
  const types = useMemo(() => [...new Set(inBuilding.map((r) => r.room_type))].sort(), [inBuilding]);

  const match = (e: Entry) => (!only || e.st.status === only) && (!type || e.room.room_type === type);

  if (!buildingId) return <Empty title="No buildings yet" />;

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Floors</Eyebrow>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">
            {buildings.find((b) => b.id === buildingId)?.name}
            <span className="text-ink-3"> · {floor ? floorLabel(floor) : ""}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={buildingId} onChange={(b) => ui.setFloor(b, null)} options={buildings.map((b) => ({ value: b.id, label: b.name }))} />
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "3d", label: <span className="flex items-center gap-1.5"><Cube size={15} /> 3D</span> },
              { value: "plan", label: <span className="flex items-center gap-1.5"><GridFour size={15} /> Plan</span> },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Lift floors={floors} current={floor} onPick={(f) => ui.setFloor(buildingId, f)} />

        <div className="min-w-0 space-y-4">
          <DayScrubber today={today} offset={offset} onChange={setOffset} />
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={!only} onClick={() => setOnly(null)}>
              All rooms
            </Chip>
            {STATUS_ORDER.map((s) => {
              const n = entries.filter((e) => e.st.status === s).length;
              return n ? (
                <Chip key={s} dot={s} active={only === s} onClick={() => setOnly(only === s ? null : s)}>
                  {STATUS_META[s].label} <span className="tnum opacity-60">{n}</span>
                </Chip>
              ) : null;
            })}
            <select
              value={type ?? ""}
              onChange={(e) => setType(e.target.value || null)}
              className="h-8 rounded-full bg-raised px-3 text-[13px] font-medium text-ink-2 shadow-lift outline-none"
              aria-label="Room type"
            >
              <option value="">Every room type</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          {mode === "3d" ? (
            <Card className="overflow-hidden">
              <Iso entries={entries} match={match} onOpen={ui.openRoom} today={viewDay} selected={ui.roomId} />
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {entries.map((e) => (
                <div key={e.room.id} className={cx("transition-opacity", !match(e) && "opacity-30")}>
                  <RoomTile room={e.room} list={byRoom.get(e.room.id)} now={now} onOpen={ui.openRoom} selected={ui.roomId === e.room.id} />
                </div>
              ))}
            </div>
          )}

          <Leaving entries={entries} today={today} onOpen={ui.openRoom} title={`Checking out of ${floor ? floorLabel(floor).toLowerCase() : "this floor"}`} />
        </div>
      </div>
    </div>
  );
}

/** Floors stacked like a lift panel: top floor first, each with its own little status strip. */
function Lift({ floors, current, onPick }: { floors: [string, Entry[]][]; current?: string; onPick: (f: string) => void }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
      {floors.map(([f, list]) => {
        const free = list.filter((e) => e.st.status === "free" && !e.st.partial).length;
        const out = list.filter((e) => e.st.status === "departing").length;
        const active = f === current;
        return (
          <button
            key={f}
            onClick={() => onPick(f)}
            className={cx(
              "press min-w-[150px] shrink-0 rounded-md px-3 py-2.5 text-left lg:min-w-0",
              active ? "bg-raised shadow-lift-high" : "hover:bg-well",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={cx("text-[13.5px] font-semibold", !active && "text-ink-2")}>{floorLabel(f)}</span>
              <span className="text-[11.5px] text-ink-3 tnum">{list.length} rooms</span>
            </div>
            <div className="mt-2 flex h-[6px] gap-[2px]">
              {list.map((e) => (
                <span
                  key={e.room.id}
                  className={cx("flex-1 rounded-[1.5px]", e.st.status === "blocked" && "hatch")}
                  style={{ background: e.st.status === "blocked" ? undefined : STATUS_META[e.st.status].color, opacity: e.st.partial ? 0.55 : 1 }}
                />
              ))}
            </div>
            <div className="mt-1.5 text-[11.5px] text-ink-3">
              <span className="font-medium text-ink-2 tnum">{free}</span> free
              {out > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-ink-2 tnum">{out}</span> leaving
                </>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DayScrubber({ today, offset, onChange }: { today: DayKey; offset: number; onChange: (n: number) => void }) {
  const hijriAdjust = useUi((s) => s.hijriAdjust);
  const days = Array.from({ length: 15 }, (_, i) => addDays(today, i));
  return (
    <div className="flex items-center gap-3">
      <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
        {days.map((k, i) => (
          <button
            key={k}
            onClick={() => onChange(i)}
            title={fmtHijri(k, hijriAdjust)}
            className={cx(
              "press flex h-12 min-w-[44px] flex-1 flex-col items-center justify-center rounded-sm text-[11px] leading-tight",
              offset === i ? "bg-ink-1 text-canvas" : "text-ink-3 hover:bg-well hover:text-ink-1",
            )}
          >
            <span>{i === 0 ? "Now" : weekdayShort(k)}</span>
            <span className={cx("text-[14px] font-semibold tnum", offset !== i && "text-ink-1")}>{Number(k.slice(8))}</span>
          </button>
        ))}
      </div>
      <div className="hidden w-[150px] shrink-0 text-right text-[12px] leading-snug text-ink-3 md:block">
        {offset === 0 ? "As it is right now" : `Evening of ${fmtDay(addDays(today, offset))}`}
        <div className="truncate">{fmtHijri(addDays(today, offset), hijriAdjust, true)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- isometric floor

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const U = 34; // pixels per unit
const DEPTH = 2.6;
const HALL = 1.3;
const GAP = 0.16;

const HEIGHT: Record<RoomStatus, number> = { occupied: 1.25, departing: 0.8, arriving: 0.45, free: 0.14, blocked: 0.6 };

function proj(x: number, y: number, z: number): [number, number] {
  return [(x - y) * COS * U, ((x + y) * SIN - z) * U];
}
const pts = (p: [number, number][]) => p.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

interface Box {
  e: Entry;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

const PAIR = DEPTH * 2 + HALL + 1.1;

/** Rooms in double-loaded corridors: two rows face each other, long floors get more corridors. */
function layout(entries: Entry[]): { boxes: Box[]; len: number; pairs: number } {
  const per = Math.min(10, Math.max(2, Math.ceil(entries.length / 2)));
  const rows: Entry[][] = [];
  for (let i = 0; i < entries.length; i += per) rows.push(entries.slice(i, i + per));
  const width = (r: Room) => 1.9 + Math.min(r.beds + r.extra_beds, 10) * 0.2;
  const lens = rows.map((row) => row.reduce((n, e) => n + width(e.room) + GAP, -GAP));
  const len = Math.max(...lens, 4);
  const boxes: Box[] = [];
  rows.forEach((row, ri) => {
    const pair = Math.floor(ri / 2);
    const side = ri % 2;
    // the facing row runs back the other way, like walking down and back up the corridor
    const ordered = side ? [...row].reverse() : row;
    let x = side ? len - lens[ri] : 0;
    for (const e of ordered) {
      const w = width(e.room);
      let h = HEIGHT[e.st.status];
      if (e.st.partial) h = 0.2 + (e.st.used / Math.max(1, e.st.capacity)) * 1.3;
      boxes.push({ e, x, y: pair * PAIR + (side ? DEPTH + HALL : 0), w, d: DEPTH, h });
      x += w + GAP;
    }
  });
  return { boxes, len, pairs: Math.ceil(rows.length / 2) };
}

function Iso({ entries, match, onOpen, today, selected }: { entries: Entry[]; match: (e: Entry) => boolean; onOpen: (id: string) => void; today: DayKey; selected: string | null }) {
  const { boxes, len, pairs } = useMemo(() => layout(entries), [entries]);
  const [hover, setHover] = useState<{ box: Box; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  if (!entries.length) return <Empty title="No rooms on this floor" />;

  const M = 0.7;
  const D = pairs * PAIR - 1.1;
  const plate: [number, number][] = [proj(-M, -M, 0), proj(len + M, -M, 0), proj(len + M, D + M, 0), proj(-M, D + M, 0)];
  const plateSide: [number, number][][] = [
    [proj(-M, D + M, 0), proj(len + M, D + M, 0), proj(len + M, D + M, -0.35), proj(-M, D + M, -0.35)],
    [proj(len + M, -M, 0), proj(len + M, D + M, 0), proj(len + M, D + M, -0.35), proj(len + M, -M, -0.35)],
  ];
  const all = [...plate, ...plateSide.flat(), ...boxes.map((b) => proj(b.x, b.y, 2.2))];
  const minX = Math.min(...all.map((p) => p[0])) - 16;
  const maxX = Math.max(...all.map((p) => p[0])) + 16;
  const minY = Math.min(...all.map((p) => p[1])) - 16;
  const maxY = Math.max(...all.map((p) => p[1])) + 16;
  const halls = Array.from({ length: pairs }, (_, p): [number, number][] => {
    const y0 = p * PAIR + DEPTH + 0.15;
    const y1 = p * PAIR + DEPTH + HALL - 0.15;
    return [proj(-M * 0.5, y0, 0), proj(len + M * 0.5, y0, 0), proj(len + M * 0.5, y1, 0), proj(-M * 0.5, y1, 0)];
  });

  // painter's order: further back first
  const order = [...boxes].sort((a, b) => a.x + a.w + a.y + a.d - (b.x + b.w + b.y + b.d));

  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        className="mx-auto block h-auto max-h-[64vh] w-full select-none"
        style={{ maxWidth: Math.round((maxX - minX) * 1.1) }} role="img" aria-label="Floor in 3D">
        <defs>
          <pattern id="iso-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--well)" />
            <rect width="2" height="6" fill="color-mix(in oklab, var(--blocked) 45%, transparent)" />
          </pattern>
        </defs>
        {plateSide.map((p, i) => (
          <polygon key={i} points={pts(p)} fill={i ? "color-mix(in oklab, var(--rule-strong) 100%, var(--well))" : "var(--rule-strong)"} />
        ))}
        <polygon points={pts(plate)} fill="var(--well)" stroke="var(--rule-strong)" strokeWidth={1} />
        {halls.map((h, i) => (
          <polygon key={i} points={pts(h)} fill="color-mix(in oklab, var(--ink-1) 4%, var(--card))" />
        ))}
        {order.map((b) => (
          <Block
            key={b.e.room.id}
            b={b}
            dim={!match(b.e)}
            active={selected === b.e.room.id || hover?.box === b}
            onEnter={(ev) => {
              const r = wrap.current!.getBoundingClientRect();
              setHover({ box: b, x: ev.clientX - r.left, y: ev.clientY - r.top });
            }}
            onClick={() => onOpen(b.e.room.id)}
          />
        ))}
        {/* labels last, so a tall room in front never hides the number of the room behind it */}
        {order.map((b) => (
          <Label key={b.e.room.id} b={b} dim={!match(b.e)} today={today} />
        ))}
      </svg>
      {hover && <IsoTip box={hover.box} x={hover.x} y={hover.y} today={today} width={wrap.current?.clientWidth ?? 0} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-4 py-2.5 text-[12px] text-ink-3">
        <span>Taller means busier.</span>
        {STATUS_ORDER.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <StatusDot status={s} /> {STATUS_META[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Label({ b, dim, today }: { b: Box; dim: boolean; today: DayKey }) {
  const { x, y, w, d, h, e } = b;
  const s = e.st.status;
  const [cx_, cy] = proj(x + w / 2, y + d / 2, h);
  const cur = e.st.current[0];
  const lk = cur ? leaveKey(cur) : null;
  const sub = s === "free" ? (e.st.partial ? `${e.st.capacity - e.st.used} free` : "") : s === "arriving" ? "due" : lk ? (lk === today ? "out today" : diffDays(today, lk) === 1 ? "out tmrw" : `out ${fmtShort(lk)}`) : s === "blocked" ? "" : "long stay";
  const blocked = s === "blocked";
  const ink = blocked ? "var(--ink-2)" : "#fff";
  const halo = blocked ? "var(--well)" : e.st.partial ? `color-mix(in oklab, ${STATUS_META[s].color} 70%, var(--card))` : STATUS_META[s].color;
  const style = { fill: ink, stroke: halo, strokeWidth: 4, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
  return (
    <g className="pointer-events-none" style={{ opacity: dim ? 0.18 : 1, transition: "opacity 200ms ease" }}>
      <text x={cx_} y={sub ? cy - 6 : cy + 1} textAnchor="middle" dominantBaseline="middle" className="font-mono text-[19px] font-semibold" style={style}>
        {e.room.number.replace(/^Q /, "Q")}
      </text>
      {sub && (
        <text x={cx_} y={cy + 12} textAnchor="middle" dominantBaseline="middle" className="text-[13px] font-medium" style={style}>
          {sub}
        </text>
      )}
    </g>
  );
}

function Block({ b, dim, active, onEnter, onClick }: { b: Box; dim: boolean; active: boolean; onEnter: (e: React.MouseEvent) => void; onClick: () => void }) {
  const { x, y, w, d, h, e } = b;
  const s = e.st.status;
  const c = STATUS_META[s].color;
  const blocked = s === "blocked";
  const top = [proj(x, y, h), proj(x + w, y, h), proj(x + w, y + d, h), proj(x, y + d, h)];
  const front = [proj(x, y + d, h), proj(x + w, y + d, h), proj(x + w, y + d, 0), proj(x, y + d, 0)];
  const side = [proj(x + w, y, h), proj(x + w, y + d, h), proj(x + w, y + d, 0), proj(x + w, y, 0)];
  return (
    <g
      onMouseMove={onEnter}
      onClick={onClick}
      className="cursor-pointer"
      style={{ opacity: dim ? 0.18 : 1, transition: "opacity 200ms ease" }}
      role="button"
      aria-label={`Room ${e.room.number}, ${STATUS_META[s].label}`}
    >
      <polygon points={pts(front)} fill={blocked ? "var(--rule-strong)" : `color-mix(in oklab, ${c} 72%, #000)`} />
      <polygon points={pts(side)} fill={blocked ? "color-mix(in oklab, var(--rule-strong) 100%, var(--well))" : `color-mix(in oklab, ${c} 56%, #000)`} />
      <polygon
        points={pts(top)}
        fill={blocked ? "url(#iso-hatch)" : e.st.partial ? `color-mix(in oklab, ${c} 70%, var(--card))` : c}
        stroke={active ? "var(--ink-1)" : "rgba(0,0,0,.12)"}
        strokeWidth={active ? 2 : 0.75}
        strokeLinejoin="round"
      />
    </g>
  );
}

function IsoTip({ box, x, y, today, width }: { box: Box; x: number; y: number; today: DayKey; width: number }) {
  const { room, st } = box.e;
  const d = describeState(st, today);
  const left = Math.max(8, Math.min(x + 14, width - 248));
  return (
    <div className="pointer-events-none absolute z-10 w-[240px] rounded-md bg-raised p-3 shadow-lift-high" style={{ left, top: Math.max(8, y - 20) }}>
      <div className="flex items-center gap-2">
        <KeyFob room={room} status={st.status} size="sm" />
        <span className="text-[12px] text-ink-3">{room.room_type}</span>
      </div>
      <div className="mt-2 text-[13px] font-medium">{d.who}</div>
      <div className="text-[12px] text-ink-3">{d.when}</div>
      <div className="mt-2 border-t border-rule pt-2 text-[12px] text-ink-3">
        {room.sharing !== "none" ? `${SHARING_LABEL[room.sharing]} · ${st.used}/${st.capacity} places` : `${room.beds} beds${room.extra_beds ? ` + ${room.extra_beds} mattress` : ""}`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- leaving list

export function Leaving({ entries, today, onOpen, title, days = 4 }: { entries: Entry[]; today: DayKey; onOpen: (id: string) => void; title: string; days?: number }) {
  const hijriAdjust = useUi((s) => s.hijriAdjust);
  const groups = useMemo(() => {
    const m = new Map<DayKey, { room: Room; label: string; status: RoomStatus }[]>();
    for (const e of entries) {
      for (const s of e.st.current) {
        if (s.category === "blocked") continue;
        const lk = leaveKey(s);
        if (!lk || diffDays(today, lk) >= days) continue;
        m.set(lk, [...(m.get(lk) ?? []), { room: e.room, label: stayLabel(s), status: e.st.status }]);
      }
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [entries, today, days]);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <SignOut size={16} className="text-departing" />
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      </div>
      {groups.length === 0 ? (
        <div className="mt-3 text-[13px] text-ink-3">Nobody checks out in the next {days} days.</div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map(([k, list]) => (
            <div key={k}>
              <div className="text-[13px] font-semibold capitalize">{relDay(k, today)} · 08:00</div>
              <div className="mb-2 text-[11.5px] text-ink-3">
                {fmtDay(k)} · {fmtHijri(k, hijriAdjust, true)}
              </div>
              <div className="space-y-1">
                {list.map((x, i) => (
                  <button key={x.room.id + i} onClick={() => onOpen(x.room.id)} className="press flex w-full items-center gap-2 rounded-sm py-0.5 text-left hover:bg-well">
                    <KeyFob room={x.room} status={x.status} size="sm" />
                    <span className="truncate text-[12.5px] text-ink-2">{x.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

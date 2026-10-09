import { useMemo, useState } from "react";
import { DownloadSimple, GridFour, ListBullets, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import { CATEGORY_LABEL, SHARING_LABEL } from "@/lib/types";
import { availability, floorLabel, leaveKey, roomState, STATUS_META, STATUS_ORDER, stayLabel, type RoomStatus } from "@/lib/status";
import { addDays, checkoutAt, at, dayKey, fmtDay, fmtShort } from "@/lib/time";
import { downloadXls } from "@/lib/exportXls";
import { Chip, cx, Empty, Eyebrow, Segmented, StatusPill, Card } from "@/components/ui";
import { describeState, KeyFob, NightStrip, RoomTile } from "@/components/RoomTile";

type Size = "any" | "1-2" | "3-4" | "5+";

export function Rooms() {
  const { rooms, byRoom, buildings, building } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { openRoom, roomId } = useUi();

  const [bld, setBld] = useState<string | null>(null);
  const [floor, setFloor] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [size, setSize] = useState<Size>("any");
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [staff, setStaff] = useState(false);

  const all = useMemo(() => rooms.map((room) => ({ room, st: roomState(room, byRoom.get(room.id), now) })), [rooms, byRoom, now]);
  const types = useMemo(() => [...new Set(rooms.map((r) => r.room_type))].filter((t) => t !== "Staff Room").sort(), [rooms]);
  const floors = useMemo(
    () => [...new Map(rooms.filter((r) => !bld || r.building_id === bld).map((r) => [r.floor, r.floor_sort])).entries()].sort((a, b) => a[1] - b[1]).map(([f]) => f),
    [rooms, bld],
  );

  const list = all.filter(({ room, st }) => {
    if (!staff && room.room_type === "Staff Room") return false;
    if (bld && room.building_id !== bld) return false;
    if (floor && room.floor !== floor) return false;
    if (type && room.room_type !== type) return false;
    const cap = room.beds;
    if (size === "1-2" && cap > 2) return false;
    if (size === "3-4" && (cap < 3 || cap > 4)) return false;
    if (size === "5+" && cap < 5) return false;
    if (status && st.status !== status) return false;
    if (range) {
      const a = availability(room, byRoom.get(room.id), +at(range.from, "12:00"), +checkoutAt(range.to), 1);
      if (!a.ok) return false;
    }
    const n = q.trim().toLowerCase().replace(/\s/g, "");
    if (n) {
      const hay = [room.number, room.room_type, ...st.current.map((s) => `${s.tour_id ?? ""} ${s.group_name ?? ""} ${s.guest_name ?? ""}`)].join(" ").toLowerCase().replace(/\s/g, "");
      if (!hay.includes(n)) return false;
    }
    return true;
  });

  const bedsShown = list.reduce((n, x) => n + x.room.beds, 0);
  const reset = () => {
    setBld(null);
    setFloor(null);
    setType(null);
    setSize("any");
    setStatus(null);
    setQ("");
    setRange(null);
  };
  const filtered = bld || floor || type || size !== "any" || status || q || range;

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Rooms</Eyebrow>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">
            {list.length} rooms <span className="text-ink-3">· {bedsShown} beds</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              downloadXls(
                `Karbala rooms ${today}`,
                "Rooms",
                ["Building", "Floor", "Room", "Type", "Beds", "Mattresses", "Sharing", "Status", "Occupant", "Tour ID", "Pax", "Check-out"],
                list.map(({ room, st }) => {
                  const s = st.current[0];
                  const lk = s ? leaveKey(s) : null;
                  return [
                    building.get(room.building_id)?.name,
                    floorLabel(room.floor),
                    room.number,
                    room.room_type,
                    room.beds,
                    room.extra_beds,
                    SHARING_LABEL[room.sharing],
                    STATUS_META[st.status].label,
                    s ? stayLabel(s) || CATEGORY_LABEL[s.category] : "",
                    s?.tour_id ?? "",
                    st.used || "",
                    lk ? fmtDay(lk) : s ? "open" : "",
                  ];
                }),
              )
            }
            className="press grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-well hover:text-ink-1"
            aria-label="Export to Excel"
            title="Export to Excel"
          >
            <DownloadSimple size={18} />
          </button>
          <Segmented
            value={layout}
            onChange={setLayout}
            options={[
              { value: "grid", label: <GridFour size={16} /> },
              { value: "list", label: <ListBullets size={16} /> },
            ]}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[220px]">
            <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Room, tour ID or group"
              className="h-8 w-full rounded-full bg-raised pr-3 pl-8 text-[13px] shadow-lift outline-none focus:ring-2 focus:ring-ink-1"
            />
          </div>
          <Chip active={!bld} onClick={() => { setBld(null); setFloor(null); }}>
            Both buildings
          </Chip>
          {buildings.map((b) => (
            <Chip key={b.id} active={bld === b.id} onClick={() => { setBld(b.id); setFloor(null); }}>
              {b.name}
            </Chip>
          ))}
          <Pick value={floor} onChange={setFloor} placeholder="Any floor" options={floors.map((f) => ({ value: f, label: floorLabel(f) }))} />
          <Pick value={type} onChange={setType} placeholder="Any room type" options={types.map((t) => ({ value: t, label: t }))} />
          <Pick
            value={size === "any" ? null : size}
            onChange={(v) => setSize((v as Size) ?? "any")}
            placeholder="Any size"
            options={[
              { value: "1-2", label: "1 to 2 beds" },
              { value: "3-4", label: "3 to 4 beds" },
              { value: "5+", label: "5 beds or more" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_ORDER.map((s) => (
            <Chip key={s} dot={s} active={status === s} onClick={() => setStatus(status === s ? null : s)}>
              {STATUS_META[s].label} <span className="tnum opacity-60">{all.filter((x) => x.st.status === s && x.room.room_type !== "Staff Room").length}</span>
            </Chip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-rule-strong sm:block" />
          {range ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink-1 pr-1 pl-3 text-[13px] font-medium text-canvas">
              Free
              <input type="date" value={range.from} min={today} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: e.target.value >= range.to ? addDays(e.target.value, 1) : range.to })} className="w-[118px] bg-transparent outline-none [color-scheme:dark]" />
              to
              <input type="date" value={range.to} min={addDays(range.from, 1)} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className="w-[118px] bg-transparent outline-none [color-scheme:dark]" />
              <button onClick={() => setRange(null)} className="grid size-6 place-items-center rounded-full hover:bg-white/15" aria-label="Clear dates">
                <X size={12} />
              </button>
            </span>
          ) : (
            <Chip onClick={() => setRange({ from: today, to: addDays(today, 3) })}>Free between dates…</Chip>
          )}
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-ink-3">
            <input type="checkbox" checked={staff} onChange={(e) => setStaff(e.target.checked)} className="accent-[var(--ink-1)]" /> Staff rooms
          </label>
          {filtered && (
            <button onClick={reset} className="text-[12.5px] font-medium text-ink-2 underline-offset-2 hover:text-ink-1 hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <Empty title="No room matches">Loosen a filter, or clear them all.</Empty>
        </Card>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {list.map(({ room }) => (
            <RoomTile key={room.id} room={room} list={byRoom.get(room.id)} now={now} onOpen={openRoom} selected={roomId === room.id} />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_72px_minmax(0,1.4fr)_minmax(0,1fr)_140px] gap-4 border-b border-rule px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3 md:grid">
            <span>Room</span>
            <span>Where</span>
            <span>Type</span>
            <span className="text-right">Beds</span>
            <span>Who</span>
            <span>Status</span>
            <span>Next 10 nights</span>
          </div>
          {list.map(({ room, st }) => {
            const d = describeState(st, today);
            return (
              <button
                key={room.id}
                onClick={() => openRoom(room.id)}
                className={cx(
                  "grid w-full grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5 text-left last:border-b-0 hover:bg-well/60 md:grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_72px_minmax(0,1.4fr)_minmax(0,1fr)_140px]",
                  roomId === room.id && "bg-well",
                )}
              >
                <KeyFob room={room} status={st.status} size="sm" />
                <span className="truncate text-[13px] text-ink-2">
                  {building.get(room.building_id)?.name} · {floorLabel(room.floor)}
                </span>
                <span className="hidden truncate text-[13px] text-ink-2 md:block">{room.room_type}</span>
                <span className="hidden text-right text-[13px] tnum md:block">
                  {room.beds}
                  {room.extra_beds ? <span className="text-ink-3">+{room.extra_beds}</span> : null}
                </span>
                <span className="col-span-2 min-w-0 md:col-span-1">
                  <span className="block truncate text-[13px] font-medium">{d.who}</span>
                  <span className="block truncate text-[12px] text-ink-3">{d.when}</span>
                </span>
                <span className="hidden md:block">
                  <StatusPill status={st.status}>{st.partial ? `${st.capacity - st.used} places free` : undefined}</StatusPill>
                </span>
                <NightStrip list={byRoom.get(room.id)} from={today} className="hidden md:flex" />
              </button>
            );
          })}
        </Card>
      )}
      {range && <div className="text-center text-[12.5px] text-ink-3">Showing rooms with nobody booked from {fmtShort(range.from)} 12:00 until {fmtShort(range.to)} 08:00.</div>}
    </div>
  );
}

function Pick({ value, onChange, placeholder, options }: { value: string | null; onChange: (v: string | null) => void; placeholder: string; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cx("h-8 rounded-full px-3 text-[13px] font-medium outline-none", value ? "bg-ink-1 text-canvas" : "bg-raised text-ink-2 shadow-lift")}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

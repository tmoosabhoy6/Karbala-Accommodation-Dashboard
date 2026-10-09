import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import type { Room } from "@/lib/types";
import { availability, floorLabel, roomState } from "@/lib/status";
import { KeyFob } from "./RoomTile";
import { Chip, cx } from "./ui";

export interface PickerProps {
  from: number;
  to: number;
  pax: number;
  value: string | null;
  onChange: (roomId: string) => void;
  ignoreStayId?: string;
  excludeRoomId?: string;
  nearRoom?: Room;
}

/** Every room, sorted so the ones that fit the dates and group come first. */
export function RoomPicker({ from, to, pax, value, onChange, ignoreStayId, excludeRoomId, nearRoom }: PickerProps) {
  const { rooms, byRoom, buildings } = useData();
  const now = useNow();
  const [q, setQ] = useState("");
  const [bld, setBld] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^q\s*/, "q");
    return rooms
      .filter((r) => r.id !== excludeRoomId && r.room_type !== "Staff Room")
      .filter((r) => !bld || r.building_id === bld)
      .filter((r) => !needle || r.number.toLowerCase().replace(/^q\s*/, "q").replace(/\s/g, "").includes(needle.replace(/\s/g, "")) || r.room_type.toLowerCase().includes(needle))
      .map((r) => {
        const a = availability(r, byRoom.get(r.id), from, to, pax, ignoreStayId);
        const fitsBeds = r.sharing === "none" ? r.beds + r.extra_beds >= pax : a.free >= pax;
        const near = nearRoom ? (r.building_id === nearRoom.building_id ? 0 : 2) + (r.floor === nearRoom.floor ? 0 : 1) : 0;
        return { r, a, fitsBeds, score: (a.ok ? 0 : 100) + (fitsBeds ? 0 : 50) + near * 3 + Math.abs(r.beds - pax) };
      })
      .sort((x, y) => x.score - y.score || x.r.sort - y.r.sort);
  }, [rooms, byRoom, from, to, pax, q, bld, ignoreStayId, excludeRoomId, nearRoom]);

  const good = list.filter((x) => x.a.ok && x.fitsBeds);
  const shown = showAll || q ? list : good;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Room number or type"
            className="h-9 w-full rounded-sm bg-well pr-3 pl-8 text-[13.5px] outline-none ring-1 ring-inset ring-rule focus:ring-2 focus:ring-ink-1"
          />
        </div>
        <Chip active={!bld} onClick={() => setBld(null)}>
          All
        </Chip>
        {buildings.map((b) => (
          <Chip key={b.id} active={bld === b.id} onClick={() => setBld(b.id)}>
            {b.name}
          </Chip>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-ink-3">
        {good.length} room{good.length === 1 ? "" : "s"} free for these dates with space for {pax}
        {!q && (
          <button type="button" className="ml-2 font-medium text-ink-1 underline-offset-2 hover:underline" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Only show free rooms" : "Show all rooms"}
          </button>
        )}
      </div>
      <div className="scrollbar-thin mt-2 max-h-[300px] space-y-1 overflow-y-auto pr-1">
        {shown.length === 0 && <div className="py-8 text-center text-[13px] text-ink-3">No room fits. Try fewer nights, or show all rooms.</div>}
        {shown.map(({ r, a, fitsBeds }) => {
          const st = roomState(r, byRoom.get(r.id), now);
          const disabled = !a.ok;
          return (
            <button
              key={r.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(r.id)}
              className={cx(
                "press flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left",
                value === r.id ? "bg-ink-1 text-canvas" : "hover:bg-well",
                disabled && "opacity-50",
              )}
            >
              <KeyFob room={r} status={st.status} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {r.room_type} · {floorLabel(r.floor)}
                </span>
                <span className={cx("block truncate text-[12px]", value === r.id ? "text-canvas/70" : "text-ink-3")}>
                  {disabled ? a.reason : r.sharing !== "none" ? `${a.free} places free · sharing` : `${r.beds} beds${r.extra_beds ? ` + ${r.extra_beds} mattress` : ""}${!fitsBeds ? " · too small" : ""}`}
                </span>
              </span>
              <span className={cx("text-[11.5px]", value === r.id ? "text-canvas/70" : "text-ink-4")}>{buildings.find((b) => b.id === r.building_id)?.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

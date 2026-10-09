import { Command } from "cmdk";
import * as RDialog from "@radix-ui/react-dialog";
import { useMemo } from "react";
import { MagnifyingGlass, SignIn, UsersThree } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import { endMs, floorLabel, roomState, stayLabel } from "@/lib/status";
import { KeyFob } from "./RoomTile";
import { dayKey, fmtShort } from "@/lib/time";

export function CommandMenu() {
  const { search, setSearch, openRoom, go, setDialog } = useUi();
  const { rooms, byRoom, building, snap } = useData();
  const now = useNow();

  const groups = useMemo(() => {
    const m = new Map<string, { tourId: string | null; label: string; rooms: string[]; until: number }>();
    for (const s of snap.stays) {
      if (s.cancelled_at || endMs(s) < now) continue;
      const label = stayLabel(s);
      if (!label) continue;
      const k = s.tour_id || label.toLowerCase();
      const e = m.get(k) ?? { tourId: s.tour_id, label, rooms: [], until: endMs(s) };
      e.rooms.push(s.room_id);
      m.set(k, e);
    }
    return [...m.values()];
  }, [snap.stays, now]);

  const close = () => setSearch(false);

  return (
    <RDialog.Root open={search} onOpenChange={setSearch}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed top-[10vh] left-1/2 z-50 w-[min(94vw,600px)] -translate-x-1/2 overflow-hidden rounded-lg bg-raised shadow-lift-high outline-none">
          <RDialog.Title className="sr-only">Search</RDialog.Title>
          <RDialog.Description className="sr-only">Find a room, tour or group</RDialog.Description>
          <Command loop>
            <div className="flex items-center gap-2 border-b border-rule px-4">
              <MagnifyingGlass size={17} className="text-ink-3" />
              <Command.Input autoFocus placeholder="Room number, tour ID or group…" className="h-13 w-full bg-transparent text-[15px] outline-none placeholder:text-ink-4" />
            </div>
            <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-[13px] text-ink-3">Nothing matches.</Command.Empty>
              <Command.Group heading="Actions" className="text-[11px] text-ink-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                <Item
                  value="check in new guest"
                  onSelect={() => {
                    close();
                    setDialog({ type: "checkin" });
                  }}
                >
                  <SignIn size={16} /> Check someone in
                </Item>
                <Item
                  value="allocate rooms for a group"
                  onSelect={() => {
                    close();
                    go("allocate");
                  }}
                >
                  <UsersThree size={16} /> Find rooms for a group
                </Item>
              </Command.Group>
              <Command.Group heading="In house and booked" className="text-[11px] text-ink-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {groups.map((g) => (
                  <Item
                    key={g.tourId ?? g.label}
                    value={`${g.tourId ?? ""} ${g.label}`}
                    onSelect={() => {
                      close();
                      if (g.rooms.length === 1) openRoom(g.rooms[0]);
                      else go("tours", { tourId: g.tourId ?? g.label });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{g.label}</span>
                    <span className="shrink-0 text-[12px] text-ink-3">
                      {g.rooms.length} room{g.rooms.length > 1 ? "s" : ""}
                      {Number.isFinite(g.until) ? ` · out ${fmtShort(dayKey(g.until))}` : ""}
                    </span>
                  </Item>
                ))}
              </Command.Group>
              <Command.Group heading="Rooms" className="text-[11px] text-ink-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {rooms.map((r) => {
                  const st = roomState(r, byRoom.get(r.id), now);
                  return (
                    <Item
                      key={r.id}
                      value={`room ${r.number} ${r.number.replace(/\s/g, "")} ${building.get(r.building_id)?.name} ${r.room_type}`}
                      onSelect={() => {
                        close();
                        openRoom(r.id);
                      }}
                    >
                      <KeyFob room={r} status={st.status} size="sm" />
                      <span className="min-w-0 flex-1 truncate">
                        {building.get(r.building_id)?.name} · {floorLabel(r.floor)} · {r.room_type}
                      </span>
                      <span className="shrink-0 text-[12px] text-ink-3">{st.current[0] ? stayLabel(st.current[0]) : "vacant"}</span>
                    </Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function Item({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex h-10 cursor-pointer items-center gap-3 rounded-sm px-2 text-[13.5px] text-ink-1 data-[selected=true]:bg-well">
      {children}
    </Command.Item>
  );
}

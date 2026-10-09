import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle, Minus, Plus, WarningCircle } from "@phosphor-icons/react";
import { useData, useMutate, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import { CATEGORY_LABEL, type Category, type Room, type Sharing, type Stay } from "@/lib/types";
import { availability, endMs, floorLabel, roomState, startMs, stayLabel } from "@/lib/status";
import { addDays, checkoutAt, dayKey, diffDays, fmtDay, fmtWhen, fromLocalInput, toLocalInput, CHECKOUT_TIME } from "@/lib/time";
import { Button, cx, Field, Input, Modal, Segmented, Select, Textarea } from "./ui";
import { KeyFob } from "./RoomTile";
import { RoomPicker } from "./RoomPicker";

export function Dialogs() {
  const { dialog, setDialog } = useUi();
  const close = () => setDialog(null);
  if (!dialog) return null;
  switch (dialog.type) {
    case "checkin":
      return <CheckInDialog key={JSON.stringify(dialog)} init={dialog} onClose={close} />;
    case "transfer":
      return <TransferDialog stayId={dialog.stayId} onClose={close} />;
    case "dates":
      return <DatesDialog stayId={dialog.stayId} onClose={close} />;
    case "edit":
      return <EditStayDialog stayId={dialog.stayId} onClose={close} />;
    case "room":
      return <RoomDialog roomId={dialog.roomId} onClose={close} />;
    case "block":
      return <BlockDialog roomId={dialog.roomId} onClose={close} />;
  }
}

const WHO: { value: Category; label: string }[] = [
  { value: "tour", label: "Tour" },
  { value: "group_leader", label: "GL" },
  { value: "khidmat_guzar", label: "KG" },
  { value: "hr_mawaid", label: "HR" },
  { value: "staff", label: "Staff" },
];

function Stepper({ value, onChange, min = 1, max = 60 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex h-10 items-center rounded-sm bg-well ring-1 ring-inset ring-rule">
      <button type="button" className="press grid h-full w-10 place-items-center text-ink-2 hover:text-ink-1 disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Fewer">
        <Minus size={14} weight="bold" />
      </button>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="h-full w-full min-w-0 bg-transparent text-center text-[15px] font-semibold outline-none tnum"
      />
      <button type="button" className="press grid h-full w-10 place-items-center text-ink-2 hover:text-ink-1 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
        <Plus size={14} weight="bold" />
      </button>
    </div>
  );
}

function AvailabilityLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-sm px-3 py-2.5 text-[13px]"
      style={{ background: `color-mix(in oklab, ${ok ? "var(--free)" : "var(--occupied)"} 11%, transparent)`, color: `color-mix(in oklab, ${ok ? "var(--free)" : "var(--occupied)"} 75%, var(--ink-1))` }}
    >
      {ok ? <CheckCircle size={17} weight="fill" className="mt-px shrink-0" /> : <WarningCircle size={17} weight="fill" className="mt-px shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

type CheckInInit = Extract<NonNullable<ReturnType<typeof useUi.getState>["dialog"]>, { type: "checkin" }>;

function CheckInDialog({ init, onClose }: { init: CheckInInit; onClose: () => void }) {
  const { room, byRoom, tour } = useData();
  const now = useNow();
  const mutate = useMutate();
  const { openRoom } = useUi();

  const [roomId, setRoomId] = useState<string | null>(init.roomId ?? null);
  const [category, setCategory] = useState<Category>("tour");
  const [tourId, setTourId] = useState(init.tourId ?? "");
  const [group, setGroup] = useState(init.groupName ?? "");
  const [pax, setPax] = useState(init.pax ?? 2);
  const [guest, setGuest] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [later, setLater] = useState(!!init.from && init.from > now + 15 * 60000);
  const [fromInput, setFromInput] = useState(toLocalInput(init.from ?? now));
  const from = later ? +fromLocalInput(fromInput) : now;
  const [nights, setNights] = useState(init.to ? Math.max(1, diffDays(dayKey(from), dayKey(init.to))) : 4);
  const [openEnded, setOpenEnded] = useState(false);
  const [pickRoom, setPickRoom] = useState(!init.roomId);

  const outKey = addDays(dayKey(from), nights);
  const to = openEnded ? Number.POSITIVE_INFINITY : +checkoutAt(outKey);
  const r = roomId ? room.get(roomId) : undefined;
  const avail = r ? availability(r, byRoom.get(r.id), from, to, pax) : null;
  const known = tourId ? tour.get(tourId.trim()) : undefined;

  useEffect(() => {
    if (known && !group) setGroup(known.office ?? "");
  }, [known, group]);

  useEffect(() => {
    if (r) setPax((p) => (init.pax ? p : Math.min(Math.max(p, 1), r.sharing === "none" ? r.beds || p : p)));
    // only when the room changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const needsTour = category === "tour" && !tourId.trim() && !group.trim();
  const canSave = !!r && !!avail?.ok && !needsTour && pax > 0;

  async function save() {
    if (!r) return;
    const ok = await mutate(
      (api) =>
        api.createStays([
          {
            room_id: r.id,
            category,
            tour_id: tourId.trim() || null,
            group_name: group.trim() || null,
            guest_name: guest.trim() || null,
            phone: phone.trim() || null,
            pax,
            notes: notes.trim() || null,
            check_in: new Date(from).toISOString(),
            check_out: openEnded ? null : checkoutAt(outKey).toISOString(),
            arrived_at: later ? null : new Date().toISOString(),
          },
        ]),
      later ? `Booked ${r.number} from ${fmtDay(dayKey(from))}` : `Checked in to ${r.number}`,
    );
    if (ok) {
      onClose();
      openRoom(r.id);
    }
  }

  return (
    <Modal open onClose={onClose} title={later ? "Book a room" : "Check in"} description="Check-in time is when you save. Check-out is 08:00." width={560}>
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-ink-2">Who</div>
          <Segmented value={category} onChange={(v) => { setCategory(v); if (v === "staff") setOpenEnded(true); }} options={WHO} />
          <div className="mt-1.5 text-[12px] text-ink-3">{CATEGORY_LABEL[category]}</div>
        </div>

        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Field label="Tour ID" hint={known ? "found" : undefined}>
            <Input value={tourId} onChange={(e) => setTourId(e.target.value)} placeholder="2429" className="font-mono" inputMode="numeric" autoFocus={!init.tourId} />
          </Field>
          <Field label={category === "tour" ? "Group or agent" : "Name"}>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder={category === "tour" ? "Vana Tours" : "Name"} />
          </Field>
        </div>
        {known && (
          <div className="-mt-2 text-[12.5px] text-ink-3">
            {known.office} · {known.pax_required} pax need rooms · in Iraq {known.arrival ? fmtDay(dayKey(Date.parse(known.arrival))) : "?"} to {known.departure ? fmtDay(dayKey(Date.parse(known.departure))) : "?"}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pax in this room">
            <Stepper value={pax} onChange={setPax} max={40} />
          </Field>
          <Field label="Nights" hint={openEnded ? undefined : `out ${fmtDay(outKey)}, ${CHECKOUT_TIME}`}>
            {openEnded ? (
              <Button className="h-10 w-full" onClick={() => setOpenEnded(false)}>
                Open-ended · set nights
              </Button>
            ) : (
              <Stepper value={nights} onChange={setNights} max={90} />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={later ? "later" : "now"}
            onChange={(v) => setLater(v === "later")}
            options={[
              { value: "now", label: "Arriving now" },
              { value: "later", label: "Later" },
            ]}
          />
          {later && <Input type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} className="h-9 w-auto" />}
          {!openEnded && (
            <button type="button" className="text-[12.5px] text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline" onClick={() => setOpenEnded(true)}>
              No checkout date
            </button>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-2">Room</span>
            {r && !pickRoom && (
              <button type="button" className="text-[12.5px] font-medium text-ink-1 underline-offset-2 hover:underline" onClick={() => setPickRoom(true)}>
                Change room
              </button>
            )}
          </div>
          {r && !pickRoom ? (
            <div className="flex items-center gap-3 rounded-sm bg-well px-3 py-2.5 ring-1 ring-inset ring-rule">
              <KeyFob room={r} status={roomState(r, byRoom.get(r.id), now).status} />
              <div className="text-[13px]">
                <div className="font-medium">
                  {r.room_type} · {floorLabel(r.floor)}
                </div>
                <div className="text-ink-3">
                  {r.sharing !== "none" ? "Sharing room" : `${r.beds} beds${r.extra_beds ? ` + ${r.extra_beds} mattress` : ""}`}
                </div>
              </div>
            </div>
          ) : (
            <RoomPicker
              from={from}
              to={to}
              pax={pax}
              value={roomId}
              onChange={(id) => {
                setRoomId(id);
                setPickRoom(false);
              }}
            />
          )}
        </div>

        {r && avail && (
          <AvailabilityLine ok={avail.ok}>
            {avail.ok
              ? `Room ${r.number} is free ${openEnded ? `from ${fmtDay(dayKey(from))}` : `${fmtDay(dayKey(from))} to ${fmtDay(outKey)}`}.${r.sharing === "none" && pax > r.beds ? ` ${pax - r.beds} will need mattresses.` : ""}`
              : `Room ${r.number}: ${avail.reason}.`}
          </AvailabilityLine>
        )}

        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-ink-2 hover:text-ink-1">+ Contact and notes</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Lead guest">
              <Input value={guest} onChange={(e) => setGuest(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </details>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={!canSave} onClick={save}>
            {later ? "Book room" : "Check in"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function useStay(stayId: string): { stay?: Stay; room?: Room } {
  const { snap, room } = useData();
  const stay = snap.stays.find((s) => s.id === stayId);
  return { stay, room: stay ? room.get(stay.room_id) : undefined };
}

function TransferDialog({ stayId, onClose }: { stayId: string; onClose: () => void }) {
  const { stay, room } = useStay(stayId);
  const { openRoom } = useUi();
  const now = useNow();
  const mutate = useMutate();
  const [target, setTarget] = useState<string | null>(null);
  const { room: rooms } = useData();
  if (!stay || !room) return null;
  const upcoming = startMs(stay) > now;
  const from = upcoming ? startMs(stay) : now;
  const to = endMs(stay);
  const t = target ? rooms.get(target) : undefined;
  return (
    <Modal open onClose={onClose} title={upcoming ? "Move booking" : "Transfer to another room"} description={`${stayLabel(stay) || CATEGORY_LABEL[stay.category]} · ${stay.pax ?? "?"} pax · leaves ${Number.isFinite(to) ? fmtDay(dayKey(to)) : "open-ended"}`} width={560}>
      <div className="space-y-4">
        <RoomPicker from={from} to={to} pax={stay.pax ?? 1} value={target} onChange={setTarget} ignoreStayId={stay.id} excludeRoomId={room.id} nearRoom={room} />
        {t && (
          <div className="flex items-center justify-center gap-3 rounded-md bg-well py-3">
            <KeyFob room={room} status="occupied" />
            <ArrowRight size={18} className="text-ink-3" />
            <KeyFob room={t} status="free" />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!t}
            onClick={async () => {
              if (!t) return;
              const ok = await mutate((api) => api.transferStay(stay.id, t.id), `${upcoming ? "Moved" : "Transferred"} to ${t.number}`);
              if (ok) {
                onClose();
                openRoom(t.id);
              }
            }}
          >
            {t ? `${upcoming ? "Move" : "Transfer"} to ${t.number}` : "Pick a room"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DatesDialog({ stayId, onClose }: { stayId: string; onClose: () => void }) {
  const { stay, room } = useStay(stayId);
  const { byRoom } = useData();
  const now = useNow();
  const mutate = useMutate();
  const [inInput, setInInput] = useState(stay ? toLocalInput(startMs(stay)) : "");
  const [outKey, setOutKey] = useState(stay && stay.check_out ? dayKey(Date.parse(stay.check_out)) : addDays(dayKey(now), 1));
  const [open, setOpen] = useState(!!stay && !stay.check_out);
  if (!stay || !room) return null;
  const started = startMs(stay) <= now;
  const from = started ? startMs(stay) : +fromLocalInput(inInput);
  const to = open ? Number.POSITIVE_INFINITY : +checkoutAt(outKey);
  const a = availability(room, byRoom.get(room.id), from, to, stay.pax ?? 1, stay.id);
  const valid = to > from && (open || +checkoutAt(outKey) > now || started);
  return (
    <Modal open onClose={onClose} title="Change dates" description={`${stayLabel(stay) || CATEGORY_LABEL[stay.category]} in room ${room.number}`}>
      <div className="space-y-4">
        <Field label="Check-in">{started ? <div className="h-10 rounded-sm bg-well px-3 text-[14px] leading-10 text-ink-2 tnum">{fmtWhen(startMs(stay))}</div> : <Input type="datetime-local" value={inInput} onChange={(e) => setInInput(e.target.value)} />}</Field>
        <Field label="Check-out" hint="at 08:00">
          {open ? (
            <Button className="h-10 w-full" onClick={() => setOpen(false)}>
              Open-ended · set a date
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input type="date" value={outKey} onChange={(e) => setOutKey(e.target.value)} />
              <Button className="h-10" onClick={() => setOutKey((k) => addDays(k, -1))} aria-label="One night less">
                −1
              </Button>
              <Button className="h-10" onClick={() => setOutKey((k) => addDays(k, 1))} aria-label="One night more">
                +1
              </Button>
            </div>
          )}
        </Field>
        {!open && (
          <button type="button" className="text-[12.5px] text-ink-3 hover:text-ink-1" onClick={() => setOpen(true)}>
            Make it open-ended
          </button>
        )}
        <AvailabilityLine ok={a.ok && valid}>{!valid ? "Check-out must be after check-in." : a.ok ? `Room ${room.number} is free for these dates.` : `${a.reason}.`}</AvailabilityLine>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!a.ok || !valid}
            onClick={async () => {
              const ok = await mutate(
                (api) => api.updateStay(stay.id, { check_in: new Date(from).toISOString(), check_out: open ? null : checkoutAt(outKey).toISOString() }),
                "Dates updated",
              );
              if (ok) onClose();
            }}
          >
            Save dates
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditStayDialog({ stayId, onClose }: { stayId: string; onClose: () => void }) {
  const { stay, room } = useStay(stayId);
  const mutate = useMutate();
  const [f, setF] = useState(() => ({
    category: stay?.category ?? "tour",
    tour_id: stay?.tour_id ?? "",
    group_name: stay?.group_name ?? "",
    guest_name: stay?.guest_name ?? "",
    phone: stay?.phone ?? "",
    pax: stay?.pax ?? 1,
    notes: stay?.notes ?? "",
  }));
  if (!stay || !room) return null;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open onClose={onClose} title="Edit details" description={`Room ${room.number}`}>
      <div className="space-y-4">
        {f.category !== "blocked" && <Segmented value={f.category} onChange={(v) => set("category", v)} options={WHO} />}
        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
          <Field label="Tour ID">
            <Input className="font-mono" value={f.tour_id} onChange={(e) => set("tour_id", e.target.value)} />
          </Field>
          <Field label={f.category === "blocked" ? "Reason" : "Group or agent"}>
            <Input value={f.group_name} onChange={(e) => set("group_name", e.target.value)} />
          </Field>
        </div>
        {f.category !== "blocked" && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Pax">
              <Stepper value={f.pax} onChange={(n) => set("pax", n)} max={40} />
            </Field>
            <Field label="Lead guest">
              <Input value={f.guest_name} onChange={(e) => set("guest_name", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              const ok = await mutate(
                (api) =>
                  api.updateStay(stay.id, {
                    category: f.category,
                    tour_id: f.tour_id.trim() || null,
                    group_name: f.group_name.trim() || null,
                    guest_name: f.guest_name.trim() || null,
                    phone: f.phone.trim() || null,
                    pax: f.category === "blocked" ? null : f.pax,
                    notes: f.notes.trim() || null,
                  }),
                "Saved",
              );
              if (ok) onClose();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RoomDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { room, rooms } = useData();
  const r = room.get(roomId);
  const mutate = useMutate();
  const types = useMemo(() => [...new Set(rooms.map((x) => x.room_type))].sort(), [rooms]);
  const [f, setF] = useState({ room_type: r?.room_type ?? "", beds: r?.beds ?? 0, extra_beds: r?.extra_beds ?? 0, sharing: (r?.sharing ?? "none") as Sharing, notes: r?.notes ?? "" });
  if (!r) return null;
  return (
    <Modal open onClose={onClose} title={`Room ${r.number}`} description="Room details used for allocation">
      <div className="space-y-4">
        <Field label="Room type">
          <Input list="room-types" value={f.room_type} onChange={(e) => setF({ ...f, room_type: e.target.value })} />
          <datalist id="room-types">
            {types.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Beds">
            <Stepper value={f.beds} min={0} max={30} onChange={(n) => setF({ ...f, beds: n })} />
          </Field>
          <Field label="Extra mattresses">
            <Stepper value={f.extra_beds} min={0} max={10} onChange={(n) => setF({ ...f, extra_beds: n })} />
          </Field>
        </div>
        <Field label="Use" hint="sharing rooms can hold several tours">
          <Select value={f.sharing} onChange={(e) => setF({ ...f, sharing: e.target.value as Sharing })}>
            <option value="none">Private (one tour)</option>
            <option value="male">Male sharing</option>
            <option value="female">Female sharing</option>
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="AC weak, near lift…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              const ok = await mutate((api) => api.updateRoom(r.id, { ...f, room_type: f.room_type.trim() || "Standard", notes: f.notes.trim() || null }), "Room updated");
              if (ok) onClose();
            }}
          >
            Save room
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const BLOCK_REASONS = ["Faiz Room", "Maintenance", "Store", "Reserved"];

function BlockDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { room, byRoom } = useData();
  const now = useNow();
  const mutate = useMutate();
  const r = room.get(roomId);
  const [reason, setReason] = useState("Maintenance");
  const [untilKey, setUntilKey] = useState(addDays(dayKey(now), 2));
  const [open, setOpen] = useState(false);
  if (!r) return null;
  const to = open ? Number.POSITIVE_INFINITY : +checkoutAt(untilKey);
  const a = availability(r, byRoom.get(r.id), now, to, 1);
  return (
    <Modal open onClose={onClose} title={`Block room ${r.number}`} description="A blocked room never shows as available.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {BLOCK_REASONS.map((x) => (
            <button key={x} type="button" onClick={() => setReason(x)} className={cx("press h-8 rounded-full px-3 text-[13px] font-medium", reason === x ? "bg-ink-1 text-canvas" : "bg-raised shadow-lift")}>
              {x}
            </button>
          ))}
        </div>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="Until" hint="opens again at 08:00">
          {open ? (
            <Button className="h-10 w-full" onClick={() => setOpen(false)}>
              Until further notice · set a date
            </Button>
          ) : (
            <Input type="date" value={untilKey} onChange={(e) => setUntilKey(e.target.value)} />
          )}
        </Field>
        {!open && (
          <button type="button" className="text-[12.5px] text-ink-3 hover:text-ink-1" onClick={() => setOpen(true)}>
            Until further notice
          </button>
        )}
        <AvailabilityLine ok={a.ok}>{a.ok ? "Nobody is booked in this room for that time." : `${a.reason}. Move them first.`}</AvailabilityLine>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!a.ok || !reason.trim()}
            onClick={async () => {
              const ok = await mutate(
                (api) => api.createStays([{ room_id: r.id, category: "blocked", group_name: reason.trim(), check_in: new Date().toISOString(), check_out: open ? null : checkoutAt(untilKey).toISOString() }]),
                `Room ${r.number} blocked`,
              );
              if (ok) onClose();
            }}
          >
            Block room
          </Button>
        </div>
      </div>
    </Modal>
  );
}


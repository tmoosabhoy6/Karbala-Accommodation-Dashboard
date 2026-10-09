import { useEffect, useMemo, useState } from "react";
import { ArrowCounterClockwise, CheckCircle, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { useData, useMutate, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import type { Room, Tour } from "@/lib/types";
import { availability, floorLabel, roomState } from "@/lib/status";
import { autofit, distribute, type Candidate } from "@/lib/autofit";
import { addDays, at, checkoutAt, dayKey, fmtDay, CHECKOUT_TIME } from "@/lib/time";
import { fmtHijri } from "@/lib/hijri";
import { Button, Card, Chip, cx, Eyebrow, Field, Input, Segmented } from "@/components/ui";
import { KeyFob } from "@/components/RoomTile";

export function Allocate() {
  const { rooms, byRoom, buildings, building, tour } = useData();
  const now = useNow();
  const today = dayKey(now);
  const mutate = useMutate();
  const { hijriAdjust, go } = useUi();

  const [tourId, setTourId] = useState("");
  const [group, setGroup] = useState("");
  const [pax, setPax] = useState(10);
  const [gender, setGender] = useState<"family" | "male" | "female">("family");
  const [when, setWhen] = useState<"now" | "date">("now");
  const [day, setDay] = useState(addDays(today, 1));
  const [nights, setNights] = useState(3);
  const [prefer, setPrefer] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const known: Tour | undefined = tourId.trim() ? tour.get(tourId.trim()) : undefined;

  useEffect(() => {
    if (!known) return;
    if (!group) setGroup(known.office ?? known.to_name ?? "");
    if (known.pax_required) setPax(known.pax_required);
    if (known.gender) setGender(known.gender);
    // fill once per tour
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known?.tour_id]);

  const from = when === "now" ? now : +at(day, "12:00");
  const startDay = when === "now" ? today : day;
  const outKey = addDays(startDay, nights);
  const to = +checkoutAt(outKey);

  const cands: Candidate[] = useMemo(() => {
    const out: Candidate[] = [];
    for (const r of rooms) {
      if (r.room_type === "Staff Room" || r.beds <= 0) continue;
      if (r.sharing !== "none" && r.sharing !== gender) continue;
      const a = availability(r, byRoom.get(r.id), from, to, 1);
      if (!a.ok) continue;
      const places = r.sharing === "none" ? r.beds : a.free;
      out.push({ room: r, places, max: places + r.extra_beds });
    }
    return out;
  }, [rooms, byRoom, from, to, gender]);

  const fit = useMemo(() => autofit(cands, pax, prefer), [cands, pax, prefer]);
  useEffect(() => setPicked(null), [pax, nights, day, when, gender, prefer]);

  const chosenIds = picked ?? new Set(fit?.rooms.map((x) => x.room.id) ?? []);
  const chosen = cands.filter((c) => chosenIds.has(c.room.id));
  const beds = chosen.reduce((n, c) => n + c.places, 0);
  const max = chosen.reduce((n, c) => n + c.max, 0);
  const plan = distribute(chosen, pax, beds < pax);
  const short = pax - max;
  const freeBeds = cands.reduce((n, c) => n + c.places, 0);

  const toggle = (id: string) => {
    const next = new Set(chosenIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  async function save() {
    const label = tourId.trim() || group.trim();
    const ok = await mutate(
      (api) =>
        api.createStays(
          plan
            .filter((p) => p.pax > 0)
            .map((p) => ({
              room_id: p.room.id,
              category: "tour" as const,
              tour_id: tourId.trim() || null,
              group_name: group.trim() || null,
              pax: p.pax,
              check_in: new Date(from).toISOString(),
              check_out: new Date(to).toISOString(),
              arrived_at: when === "now" ? new Date().toISOString() : null,
            })),
        ),
      `${when === "now" ? "Checked in" : "Booked"} ${label} in ${plan.filter((p) => p.pax > 0).length} rooms`,
    );
    if (ok) {
      setPicked(null);
      setTourId("");
      setGroup("");
      if (tourId.trim()) go("tours", { tourId: tourId.trim() });
    }
  }

  const byBuilding = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of cands) m.set(c.room.building_id, [...(m.get(c.room.building_id) ?? []), c]);
    return m;
  }, [cands]);

  return (
    <div className="mx-auto max-w-[1360px] space-y-6">
      <div>
        <Eyebrow>Allocate</Eyebrow>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">Find rooms for a group</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20">
          <div className="grid grid-cols-[1fr_1.3fr] gap-3">
            <Field label="Tour ID" hint={known ? "found" : undefined}>
              <Input value={tourId} onChange={(e) => setTourId(e.target.value)} placeholder="2429" className="font-mono" inputMode="numeric" autoFocus />
            </Field>
            <Field label="Group">
              <Input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Vana Tours" />
            </Field>
          </div>
          {known && (
            <div className="-mt-2 text-[12px] text-ink-3">
              {known.pax_required} need rooms · {known.arrival ? fmtDay(dayKey(Date.parse(known.arrival))) : "?"} to {known.departure ? fmtDay(dayKey(Date.parse(known.departure))) : "?"} in Iraq
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pax">
              <Input type="number" min={1} max={300} value={pax} onChange={(e) => setPax(Math.max(1, Math.min(300, Number(e.target.value) || 1)))} className="text-[15px] font-semibold tnum" />
            </Field>
            <Field label="Nights" hint={`out ${fmtDay(outKey)} ${CHECKOUT_TIME}`}>
              <Input type="number" min={1} max={60} value={nights} onChange={(e) => setNights(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} className="text-[15px] font-semibold tnum" />
            </Field>
          </div>
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-ink-2">Arriving</div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={when}
                onChange={setWhen}
                options={[
                  { value: "now", label: "Now" },
                  { value: "date", label: "On a date" },
                ]}
              />
              {when === "date" && <Input type="date" value={day} min={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-9 w-auto" />}
            </div>
            {when === "date" && <div className="mt-1 text-[12px] text-ink-3">{fmtHijri(day, hijriAdjust)}</div>}
          </div>
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-ink-2">Group</div>
            <Segmented
              size="sm"
              value={gender}
              onChange={setGender}
              options={[
                { value: "family", label: "Mixed" },
                { value: "male", label: "Men only" },
                { value: "female", label: "Women only" },
              ]}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[12px] font-medium text-ink-2">Building</div>
            <div className="flex flex-wrap gap-2">
              <Chip active={!prefer} onClick={() => setPrefer(null)}>
                Either
              </Chip>
              {buildings.map((b) => (
                <Chip key={b.id} active={prefer === b.id} onClick={() => setPrefer(b.id)}>
                  {b.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="border-t border-rule pt-4 text-[12.5px] text-ink-3">
            <span className="font-semibold text-ink-1 tnum">{freeBeds}</span> beds in <span className="font-semibold text-ink-1 tnum">{cands.length}</span> rooms are free for these nights.
          </div>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[15px] font-semibold">
                  <Sparkle size={17} weight="fill" className="text-tile" />
                  {picked ? "Your selection" : fit ? "Suggested rooms" : "Nothing fits"}
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink-3">
                  {fit && !picked
                    ? `${fit.rooms.length} room${fit.rooms.length === 1 ? "" : "s"}, kept ${fit.scope.endsWith("*") ? (fit.scope === "*" ? "across both buildings" : `in ${building.get(fit.scope.split("|")[0])?.name}`) : `on one floor`}, ${fit.spare ? `${fit.spare} spare bed${fit.spare === 1 ? "" : "s"}` : "no spare beds"}${fit.usesMattresses ? ", using extra mattresses" : ""}.`
                    : !fit
                      ? `Only ${freeBeds} beds are free for these nights. Try fewer nights, another date, or split the group.`
                      : "Tap rooms below to add or remove them."}
                </div>
              </div>
              {picked && (
                <Button variant="ghost" size="sm" icon={<ArrowCounterClockwise size={14} />} onClick={() => setPicked(null)}>
                  Back to suggestion
                </Button>
              )}
            </div>
            {chosen.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.map((p) => (
                  <button key={p.room.id} onClick={() => toggle(p.room.id)} className="press flex items-center gap-2 rounded-md bg-well py-1.5 pr-3 pl-1.5 ring-1 ring-inset ring-rule hover:ring-ink-3">
                    <KeyFob room={p.room} status="free" size="sm" />
                    <span className="text-[12.5px]">
                      <span className="font-semibold tnum">{p.pax}</span> <span className="text-ink-3">of {p.room.beds}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
              <div
                className="flex flex-1 items-center gap-2 text-[13px]"
                style={{ color: short > 0 ? "var(--occupied)" : beds < pax ? "color-mix(in oklab, var(--departing) 80%, var(--ink-1))" : "var(--ink-2)" }}
              >
                {short > 0 ? <WarningCircle size={17} weight="fill" /> : <CheckCircle size={17} weight="fill" className="text-free" />}
                {short > 0 ? `${short} more beds needed` : beds < pax ? `${pax - beds} on extra mattresses` : `${beds} beds for ${pax} pax`}
              </div>
              <Button variant="primary" size="lg" disabled={short > 0 || !chosen.length || (!tourId.trim() && !group.trim())} onClick={save}>
                {when === "now" ? "Check in group" : `Book from ${fmtDay(startDay)}`}
              </Button>
            </div>
          </Card>

          {buildings.map((b) => {
            const list = byBuilding.get(b.id) ?? [];
            if (!list.length) return null;
            const floors = new Map<string, Candidate[]>();
            for (const c of list) floors.set(c.room.floor, [...(floors.get(c.room.floor) ?? []), c]);
            return (
              <div key={b.id}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-[15px] font-semibold">{b.name}</h3>
                  <span className="text-[12.5px] text-ink-3">
                    {list.length} free rooms · {list.reduce((n, c) => n + c.places, 0)} beds
                  </span>
                </div>
                <div className="space-y-3">
                  {[...floors.entries()]
                    .sort((a, c) => a[1][0].room.floor_sort - c[1][0].room.floor_sort)
                    .map(([f, cs]) => (
                      <div key={f} className="grid gap-2 sm:grid-cols-[96px_1fr]">
                        <div className="pt-1.5 text-[12px] font-medium text-ink-3">{floorLabel(f)}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {cs.map((c) => (
                            <FreeRoom key={c.room.id} room={c.room} places={c.places} on={chosenIds.has(c.room.id)} onClick={() => toggle(c.room.id)} />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FreeRoom({ room, places, on, onClick }: { room: Room; places: number; on: boolean; onClick: () => void }) {
  const { byRoom } = useData();
  const now = useNow();
  const st = roomState(room, byRoom.get(room.id), now);
  return (
    <button
      onClick={onClick}
      title={`${room.room_type}${room.extra_beds ? ` · +${room.extra_beds} mattress` : ""}`}
      className={cx("press flex items-center gap-2 rounded-md py-1 pr-2.5 pl-1 text-[12px]", on ? "bg-ink-1 text-canvas" : "bg-raised shadow-lift hover:shadow-lift-high")}
    >
      <KeyFob room={room} status={st.status} size="sm" />
      <span className="tnum">
        {places}
        {room.sharing !== "none" ? " places" : room.extra_beds ? `+${room.extra_beds}` : ""}
      </span>
    </button>
  );
}

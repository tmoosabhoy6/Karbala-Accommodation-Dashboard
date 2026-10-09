import { useDeferredValue, useMemo, useRef, useState } from "react";
import { AirplaneLanding, AirplaneTakeoff, CaretDown, CheckCircle, DownloadSimple, FileArrowUp, Info, MagnifyingGlass, Warning, X } from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { toast } from "sonner";
import { useData, useMutate, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import type { Tour } from "@/lib/types";
import type { Api } from "@/data/api";
import { DEFAULT_RULE, optimise, ORDER_LABEL, split, type NightLoad, type Order, type Plan, type PlanRow, type RowStatus, type SplitRule } from "@/lib/optimise";
import { parseErpFile, planImport, type ImportPlan, type ErpTour } from "@/lib/erp";
import { downloadXls } from "@/lib/exportXls";
import { addDays, dayKey, diffDays, fmtDay, fmtShort, monthName, weekdayShort } from "@/lib/time";
import { fmtHijri } from "@/lib/hijri";
import { floorLabel } from "@/lib/status";
import { Button, Card, Chip, cx, Empty, Eyebrow, Meter, Modal, Segmented } from "@/components/ui";
import { KeyFob } from "@/components/RoomTile";

const RULE_KEY = "krb-split-rule";

function loadRule(): SplitRule {
  try {
    return { ...DEFAULT_RULE, ...JSON.parse(localStorage.getItem(RULE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_RULE;
  }
}

const STATUS_TEXT: Record<RowStatus, string> = {
  placed: "Fits",
  booked: "Rooms booked",
  no_space: "No room",
  no_dates: "Missing dates",
  skipped: "Left out",
  not_needed: "No rooms needed",
};

type Filter = "all" | "placed" | "booked" | "problem" | "not_needed";

export function Planner() {
  const { snap, rooms, byRoom } = useData();
  const now = useNow();
  const [rule, setRuleState] = useState<SplitRule>(loadRule);
  const setRule = (r: SplitRule) => {
    setRuleState(r);
    try {
      localStorage.setItem(RULE_KEY, JSON.stringify(r));
    } catch {
      /* private mode */
    }
  };
  const tours = useDeferredValue(snap.tours);
  // The plan only changes when tours, rooms or bookings change, not every clock tick.
  const hour = Math.floor(now / 3600000);
  const plan = useMemo(() => optimise({ tours, rooms, byRoom, rule, now: hour * 3600000 }), [tours, rooms, byRoom, rule, hour]);

  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(useUi.getState().tourId);

  const shown = plan.rows.filter((r) => {
    if (filter === "placed" && r.status !== "placed") return false;
    if (filter === "booked" && r.status !== "booked") return false;
    if (filter === "problem" && !["no_space", "no_dates", "skipped"].includes(r.status) && !r.tour.erp_changed) return false;
    if (filter === "not_needed" && r.status !== "not_needed") return false;
    if (filter === "all" && r.status === "not_needed") return false;
    const n = q.trim().toLowerCase();
    return !n || [r.tour.tour_id, r.tour.office, r.tour.to_name, r.tour.country, r.tour.tour_ref].some((v) => v?.toLowerCase().includes(n));
  });
  const count = (f: (r: PlanRow) => boolean) => plan.rows.filter(f).length;

  return (
    <div className="mx-auto max-w-[1360px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Month planner</Eyebrow>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">Who we can fit in Karbala</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-ink-3">
            Upload the ERP pending tours report. Each trip is split between Najaf and Karbala, and the planner picks the order and the rooms that give a bed to the most people.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RulePopover rule={rule} onChange={setRule} />
          <ExportButton plan={plan} rule={rule} />
          <ImportButton tours={snap.tours} plannedIds={new Set(plan.rows.filter((r) => r.stays.length).map((r) => r.tour.tour_id))} />
        </div>
      </div>

      {plan.rows.length === 0 ? (
        <Card>
          <Empty title="No tours yet" icon={<FileArrowUp size={32} />}>
            Upload the Pending Tours Report from the ERP (the .xls exactly as it downloads). Only Karbala details are kept.
          </Empty>
        </Card>
      ) : (
        <>
          <PlanHero plan={plan} />
          <MonthLoad nightly={plan.nightly} />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                Needs rooms <span className="tnum opacity-60">{count((r) => r.status !== "not_needed")}</span>
              </Chip>
              <Chip active={filter === "placed"} onClick={() => setFilter("placed")}>
                Fits, not booked <span className="tnum opacity-60">{count((r) => r.status === "placed")}</span>
              </Chip>
              <Chip active={filter === "booked"} onClick={() => setFilter("booked")}>
                Booked <span className="tnum opacity-60">{count((r) => r.status === "booked")}</span>
              </Chip>
              <Chip active={filter === "problem"} onClick={() => setFilter("problem")}>
                Needs a look <span className="tnum opacity-60">{count((r) => ["no_space", "no_dates", "skipped"].includes(r.status) || !!r.tour.erp_changed)}</span>
              </Chip>
              <Chip active={filter === "not_needed"} onClick={() => setFilter("not_needed")}>
                No rooms needed <span className="tnum opacity-60">{count((r) => r.status === "not_needed")}</span>
              </Chip>
              <div className="relative ml-auto w-full sm:w-[240px]">
                <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tour ID, office or country"
                  className="h-9 w-full rounded-sm bg-well pr-3 pl-8 text-[13.5px] outline-none ring-1 ring-inset ring-rule focus:ring-2 focus:ring-ink-1"
                />
              </div>
            </div>
            <BookBar plan={plan} rows={shown} />
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[88px_minmax(0,1.6fr)_64px_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.4fr)_28px] gap-4 border-b border-rule px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3 lg:grid">
                <span>Tour</span>
                <span>Group</span>
                <span className="text-right">Pax</span>
                <span>In Iraq</span>
                <span>Karbala</span>
                <span>Rooms</span>
                <span />
              </div>
              {shown.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-3">No tours match.</div>}
              {shown.map((r) => (
                <TourRow key={r.tour.tour_id} row={r} rule={rule} open={open === r.tour.tour_id} onToggle={() => setOpen(open === r.tour.tour_id ? null : r.tour.tour_id)} />
              ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- hero

function PlanHero({ plan }: { plan: Plan }) {
  const fit = plan.placed + plan.booked;
  const all = fit >= plan.demand;
  const peak = plan.nightly.reduce<NightLoad | null>((m, n) => (!m || n.existing + n.planned > m.existing + m.planned ? n : m), null);
  const mattress = plan.rows.filter((r) => r.status === "placed" && r.usesMattresses).length;
  const hijriAdjust = useUi((s) => s.hijriAdjust);
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
      <div>
        <div className="flex items-end gap-4">
          <div className="text-[64px] leading-[0.9] font-semibold tracking-[-0.045em] tnum sm:text-[80px]">
            {fit.toLocaleString()}
            <span className="text-[0.4em] tracking-[-0.02em] text-ink-3"> / {plan.demand.toLocaleString()}</span>
          </div>
        </div>
        <div className="mt-2 text-[14px] text-ink-2">
          {all ? "Everyone who asked for rooms fits in Karbala." : `people fit in Karbala. ${plan.demand - fit} still need a bed.`}{" "}
          <span className="text-ink-3">
            {plan.toursPlaced} of {plan.toursTotal} tours.
          </span>
        </div>
        <Meter value={fit} max={plan.demand} color="var(--tile)" className="mt-4 h-2 max-w-md" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Busiest night" value={peak ? `${fmtShort(peak.key)}` : "none"} sub={peak ? `${peak.existing + peak.planned} of ${peak.beds} beds · ${fmtHijri(peak.key, hijriAdjust, true)}` : ""} />
        <Stat label="Booked already" value={plan.booked.toLocaleString()} sub={`${plan.rows.filter((r) => r.status === "booked").length} tours have rooms`} />
        <Stat label="On mattresses" value={String(mattress)} sub={mattress ? "tours need extra mattresses" : "every planned guest has a bed"} />
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em] tnum">{value}</div>
      <div className="text-[11.5px] leading-snug text-ink-3">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------- month chart

function MonthLoad({ nightly }: { nightly: NightLoad[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const hijriAdjust = useUi((s) => s.hijriAdjust);
  if (!nightly.length) return null;
  const max = Math.max(...nightly.map((n) => Math.max(n.beds, n.existing + n.planned + n.unmet))) || 1;
  const H = 160;
  const y = (v: number) => (v / max) * H;
  const h = hover !== null ? nightly[hover] : null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Beds each night in Karbala</h3>
          <div className="text-[12.5px] text-ink-3">
            {fmtDay(nightly[0].key)} to {fmtDay(nightly[nightly.length - 1].key)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
          <Legend swatch={<span className="size-2.5 rounded-[2px] bg-arriving" />}>Booked</Legend>
          <Legend swatch={<span className="size-2.5 rounded-[2px] bg-tile" />}>This plan</Legend>
          <Legend swatch={<span className="size-2.5 rounded-[2px] ring-1 ring-inset ring-occupied" style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--occupied) 0 1.5px, transparent 1.5px 4px)" }} />}>No bed yet</Legend>
          <Legend swatch={<span className="h-0 w-3 border-t border-dashed border-ink-2" />}>Beds in both buildings</Legend>
        </div>
      </div>
      <div className="relative mt-5" onMouseLeave={() => setHover(null)}>
        <div className="flex items-end gap-[2px]" style={{ height: H }}>
          {nightly.map((n, i) => (
            <div key={n.key} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)}>
              <div className="absolute inset-x-0 border-t border-dashed border-ink-3/70" style={{ bottom: y(n.beds) }} />
              {n.unmet > 0 && (
                <div className="w-full rounded-t-[3px] ring-1 ring-inset ring-occupied" style={{ height: y(n.unmet), marginBottom: 2, backgroundImage: "repeating-linear-gradient(135deg, var(--occupied) 0 1.5px, transparent 1.5px 5px)" }} />
              )}
              {n.planned > 0 && <div className={cx("w-full bg-tile", !n.unmet && "rounded-t-[3px]")} style={{ height: y(n.planned), marginBottom: n.existing ? 2 : 0 }} />}
              {n.existing > 0 && <div className={cx("w-full bg-arriving", !n.unmet && !n.planned && "rounded-t-[3px]")} style={{ height: y(n.existing) }} />}
              {hover === i && <div className="absolute inset-x-[-1px] inset-y-0 rounded-[3px] bg-ink-1/[0.05]" />}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-[2px]">
          {nightly.map((n, i) => (
            <div key={n.key} className={cx("min-w-0 flex-1 text-center text-[10px] tnum", i % 2 && nightly.length > 24 ? "invisible sm:visible" : "", "text-ink-4")}>
              {Number(n.key.slice(8))}
            </div>
          ))}
        </div>
        {h && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-[220px] rounded-md bg-raised p-3 text-[12.5px] shadow-lift-high"
            style={{ left: `clamp(0px, calc(${((hover! + 0.5) / nightly.length) * 100}% - 110px), calc(100% - 220px))` }}
          >
            <div className="font-semibold">Night of {fmtDay(h.key)}</div>
            <div className="mb-2 text-[11.5px] text-ink-3">{fmtHijri(h.key, hijriAdjust)}</div>
            <TipRow label="Booked" value={h.existing} />
            <TipRow label="This plan" value={h.planned} hint={h.people !== h.planned ? `${h.people} people` : undefined} />
            {h.unmet > 0 && <TipRow label="No bed yet" value={h.unmet} />}
            <TipRow label="Beds" value={h.beds} />
            <div className="mt-1.5 border-t border-rule pt-1.5">
              <TipRow label="Spare" value={h.beds - h.existing - h.planned} strong />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function TipRow({ label, value, strong, hint }: { label: string; value: number; strong?: boolean; hint?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-ink-2">
        {label}
        {hint && <span className="text-ink-4"> · {hint}</span>}
      </span>
      <span className={cx("tnum", strong && "font-semibold", value < 0 && "text-occupied")}>{value}</span>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------- rows

function TripBar({ row }: { row: PlanRow }) {
  const n = row.nights ?? 0;
  const w = row.chosen ?? (row.stays.length ? null : row.options.find((o) => o.order === (row.preferred ?? "karbala_first")));
  if (!n || n > 31) return null;
  const arrDay = dayKey(Date.parse(row.tour.arrival!));
  const kIn = w ? dayKey(w.from) : row.stays.length ? dayKey(Date.parse(row.stays[0].check_in)) : null;
  const kOut = w ? dayKey(w.to) : row.stays.length && row.stays[0].check_out ? dayKey(Date.parse(row.stays[0].check_out)) : null;
  return (
    <div className="flex gap-[2px]" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const k = addDays(arrDay, i);
        const karbala = kIn && kOut && k >= kIn && k < kOut;
        return <span key={k} title={`${fmtShort(k)} · ${karbala ? "Karbala" : "Najaf"}`} className={cx("h-[6px] flex-1 rounded-[1.5px]", karbala ? "bg-tile" : "bg-rule-strong")} />;
      })}
    </div>
  );
}

function TourRow({ row, rule, open, onToggle }: { row: PlanRow; rule: SplitRule; open: boolean; onToggle: () => void }) {
  const t = row.tour;
  const { room: roomMap } = useData();
  const hijriAdjust = useUi((s) => s.hijriAdjust);
  const arr = t.arrival ? dayKey(Date.parse(t.arrival)) : null;
  const dep = t.departure ? dayKey(Date.parse(t.departure)) : null;
  const w = row.chosen;
  const bookedIn = row.stays.length ? Math.min(...row.stays.map((s) => Date.parse(s.check_in))) : null;
  const bookedOut = row.stays.length ? Math.max(...row.stays.map((s) => (s.check_out ? Date.parse(s.check_out) : 0))) : null;
  const kIn = w ? dayKey(w.from) : bookedIn ? dayKey(bookedIn) : null;
  const kOut = w ? dayKey(w.to) : bookedOut ? dayKey(bookedOut) : null;
  const sp = row.nights ? split(row.nights, rule) : null;
  const problem = row.status === "no_space" || row.status === "no_dates";
  const rooms = row.status === "booked" ? row.stays.map((s) => ({ room: roomMap.get(s.room_id)!, pax: s.pax ?? 0 })).filter((x) => x.room) : row.rooms;

  return (
    <div className={cx("border-b border-rule last:border-b-0", open && "bg-raised")}>
      <button onClick={onToggle} className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-3 text-left hover:bg-well/60 lg:grid-cols-[88px_minmax(0,1.6fr)_64px_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,1.4fr)_28px] lg:items-center">
        <div className="flex items-center gap-2 lg:block">
          <div className="font-mono text-[14px] font-semibold tnum">{t.tour_id}</div>
          <StatusTag row={row} />
        </div>
        <div className="col-start-1 min-w-0 lg:col-start-auto">
          <div className="truncate text-[13.5px] font-medium">{t.office || t.to_name || "Unnamed"}</div>
          <div className="truncate text-[12px] text-ink-3">{[t.to_name !== t.office ? t.to_name : null, t.country].filter(Boolean).join(" · ") || " "}</div>
        </div>
        <div className="row-start-1 text-right lg:row-start-auto">
          <div className="text-[15px] font-semibold tnum">{t.pax_required}</div>
          {t.pax !== t.pax_required && <div className="text-[11px] text-ink-3 tnum">of {t.pax}</div>}
        </div>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <div className="text-[12.5px] text-ink-2 tnum">
            {arr ? fmtShort(arr) : "?"} – {dep ? fmtShort(dep) : "?"} <span className="text-ink-3">· {row.nights ?? "?"} nights</span>
          </div>
          <div className="mt-1.5 max-w-[180px]">
            <TripBar row={row} />
          </div>
        </div>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          {kIn && kOut ? (
            <>
              <div className="text-[13px] font-medium tnum">
                {weekdayShort(kIn)} {fmtShort(kIn)} → {fmtShort(kOut)}
                <span className="font-normal text-ink-3"> · {diffDays(kIn, kOut)} nights</span>
              </div>
              <div className="text-[12px] text-ink-3">{w ? `${ORDER_LABEL[w.order]}, ${w.najaf} in Najaf` : "booked"}</div>
            </>
          ) : (
            <div className="text-[12.5px] text-ink-3">{row.reason ?? (sp ? `${sp.karbala} nights in Karbala` : "")}</div>
          )}
        </div>
        <div className="col-span-2 flex min-w-0 flex-wrap gap-1 lg:col-span-1">
          {rooms.slice(0, 6).map((fr) => (
            <KeyFob key={fr.room.id} room={fr.room} status={row.status === "booked" ? "arriving" : "free"} size="sm" />
          ))}
          {rooms.length > 6 && <span className="self-center text-[12px] text-ink-3">+{rooms.length - 6}</span>}
          {problem && <span className="text-[12.5px] text-occupied">{row.reason}</span>}
        </div>
        <CaretDown size={14} className={cx("hidden text-ink-3 transition-transform lg:block", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid gap-5 px-4 pt-1 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {t.erp_changed && <ErpChanged tour={t} />}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[12.5px]">
              <Fact label="Reference">{t.tour_ref}</Fact>
              <Fact label="Tour operator">{t.to_name}</Fact>
              <Fact label={<span className="inline-flex items-center gap-1"><AirplaneLanding size={13} /> Arrives</span>}>
                {t.arrival ? `${fmtDay(arr!)}, ${new Date(t.arrival).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}` : "?"}
                <div className="text-ink-3">{[t.entry_port, t.arrival_flight].filter(Boolean).join(" · ")}</div>
              </Fact>
              <Fact label={<span className="inline-flex items-center gap-1"><AirplaneTakeoff size={13} /> Leaves</span>}>
                {t.departure ? `${fmtDay(dep!)}, ${new Date(t.departure).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" })}` : "?"}
                <div className="text-ink-3">{[t.exit_port, t.departure_flight].filter(Boolean).join(" · ")}</div>
              </Fact>
              {kIn && (
                <Fact label="Karbala in">
                  {fmtDay(kIn)}
                  <div className="text-ink-3">{fmtHijri(kIn, hijriAdjust, true)}</div>
                </Fact>
              )}
              {kOut && (
                <Fact label="Karbala out, 08:00">
                  {fmtDay(kOut)}
                  <div className="text-ink-3">{fmtHijri(kOut, hijriAdjust, true)}</div>
                </Fact>
              )}
              <Fact label="Pax">
                {t.pax_required} need rooms{t.pax_not_required ? `, ${t.pax_not_required} don't` : ""}
              </Fact>
              {t.mawaid !== null && <Fact label="Mawaid">{t.mawaid ? "Yes" : "No"}</Fact>}
            </dl>
            {row.preferred && (
              <div className="flex items-start gap-2 text-[12.5px] text-ink-3">
                <Info size={15} className="mt-px shrink-0" />
                {row.preferred === "najaf_first" ? "Lands in Najaf, so Najaf first suits the flights." : "Flies out of Najaf, so Karbala first suits the flights."}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <TourControls row={row} />
            {rooms.length > 0 && (
              <div>
                <div className="mb-2 text-[12px] font-medium text-ink-2">{row.status === "booked" ? "Booked rooms" : "Rooms the planner picked"}</div>
                <div className="space-y-1">
                  {rooms.map((fr) => (
                    <div key={fr.room.id} className="flex items-center gap-3 text-[12.5px]">
                      <KeyFob room={fr.room} status={row.status === "booked" ? "arriving" : "free"} size="sm" />
                      <span className="flex-1 truncate text-ink-2">
                        {fr.room.room_type} · {floorLabel(fr.room.floor)}
                      </span>
                      <span className="tnum text-ink-3">
                        {fr.pax} of {fr.room.beds} beds
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink-1">{children || "none"}</dd>
    </div>
  );
}

function StatusTag({ row }: { row: PlanRow }) {
  const tone =
    row.status === "booked" ? "var(--arriving)" : row.status === "placed" ? "var(--tile)" : row.status === "not_needed" || row.status === "skipped" ? "var(--ink-3)" : "var(--occupied)";
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] font-medium" style={{ color: tone }}>
      {row.tour.erp_changed ? <Warning size={12} weight="fill" className="text-departing" /> : null}
      {STATUS_TEXT[row.status]}
    </span>
  );
}

function ErpChanged({ tour }: { tour: Tour }) {
  const mutate = useMutate();
  return (
    <div className="flex items-start gap-2 rounded-sm px-3 py-2.5 text-[12.5px]" style={{ background: "color-mix(in oklab, var(--departing) 12%, transparent)" }}>
      <Warning size={16} weight="fill" className="mt-px shrink-0 text-departing" />
      <div className="flex-1">
        <div className="font-medium">The ERP changed after rooms were booked</div>
        <div className="text-ink-2">{tour.erp_changed}</div>
      </div>
      <button className="press grid size-6 place-items-center rounded-sm text-ink-3 hover:text-ink-1" aria-label="Dismiss" onClick={() => mutate((api) => api.updateTour(tour.tour_id, { erp_changed: null }), "Marked as checked")}>
        <X size={14} />
      </button>
    </div>
  );
}

function TourControls({ row }: { row: PlanRow }) {
  const t = row.tour;
  const mutate = useMutate();
  const now = useNow();
  if (row.status === "not_needed") {
    return (
      <Button size="sm" onClick={() => mutate((api) => api.updateTour(t.tour_id, { status: "open", pax_required: t.pax_required || t.pax }), "Added to the plan")}>
        Plan rooms for this tour anyway
      </Button>
    );
  }
  if (row.status === "booked") {
    const future = row.stays.filter((s) => Date.parse(s.check_in) > now);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-ink-3">Rooms are booked. Release them to let the planner place this tour again.</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!future.length}
          onClick={() =>
            mutate(async (api) => {
              for (const s of future) await api.updateStay(s.id, { cancelled_at: new Date().toISOString() });
              await api.updateTour(t.tour_id, { erp_changed: null });
            }, `Released ${future.length} room${future.length === 1 ? "" : "s"}`)
          }
        >
          Release rooms
        </Button>
      </div>
    );
  }
  const value = t.plan_order ?? "auto";
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[12px] font-medium text-ink-2">Route</div>
        <Segmented
          size="sm"
          value={value}
          onChange={(v) => mutate((api) => api.updateTour(t.tour_id, { plan_order: v === "auto" ? null : (v as Order | "skip") }))}
          options={[
            { value: "auto", label: "Best fit" },
            { value: "karbala_first", label: "Karbala first" },
            { value: "najaf_first", label: "Najaf first" },
            { value: "skip", label: "Leave out" },
          ]}
        />
      </div>
      <div>
        <div className="mb-1.5 text-[12px] font-medium text-ink-2">Group</div>
        <Segmented
          size="sm"
          value={t.gender ?? "family"}
          onChange={(v) => mutate((api) => api.updateTour(t.tour_id, { gender: v as Tour["gender"] }))}
          options={[
            { value: "family", label: "Mixed" },
            { value: "male", label: "Men only" },
            { value: "female", label: "Women only" },
          ]}
        />
        <div className="mt-1 text-[11.5px] text-ink-3">Men-only or women-only groups can also use the sharing rooms.</div>
      </div>
      {row.status === "placed" && <BookOne row={row} />}
    </div>
  );
}

// ---------------------------------------------------------------- booking

async function bookRow(api: Api, row: PlanRow) {
  const w = row.chosen!;
  await api.createStays(
    row.rooms.map((fr) => ({
      room_id: fr.room.id,
      category: "tour" as const,
      tour_id: row.tour.tour_id,
      group_name: row.tour.office || row.tour.to_name,
      pax: fr.pax,
      check_in: new Date(w.from).toISOString(),
      check_out: new Date(w.to).toISOString(),
      notes: `Month plan: ${ORDER_LABEL[w.order]}, ${w.najaf} nights in Najaf`,
    })),
  );
  await api.updateTour(row.tour.tour_id, { karbala_in: new Date(w.from).toISOString(), karbala_out: new Date(w.to).toISOString(), erp_changed: null });
}

function BookOne({ row }: { row: PlanRow }) {
  const mutate = useMutate();
  return (
    <Button variant="primary" size="sm" icon={<CheckCircle size={15} weight="fill" />} onClick={() => mutate((api) => bookRow(api, row), `Booked ${row.rooms.length} room${row.rooms.length === 1 ? "" : "s"} for ${row.tour.tour_id}`)}>
      Book these {row.rooms.length} room{row.rooms.length === 1 ? "" : "s"}
    </Button>
  );
}

function BookBar({ plan, rows }: { plan: Plan; rows: PlanRow[] }) {
  const mutate = useMutate();
  const [busy, setBusy] = useState(false);
  const placed = rows.filter((r) => r.status === "placed");
  const allPlaced = plan.rows.filter((r) => r.status === "placed");
  if (!allPlaced.length) return null;
  const target = placed.length ? placed : allPlaced;
  const pax = target.reduce((n, r) => n + r.tour.pax_required, 0);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md px-4 py-3" style={{ background: "color-mix(in oklab, var(--tile) 10%, transparent)" }}>
      <div className="flex-1 text-[13px]">
        <span className="font-semibold">{target.length} tours</span> ({pax} people) fit and are not booked yet. Booking holds their rooms in blue on the timeline. You can move any of them later.
      </div>
      <Button
        variant="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          let done = 0;
          const failed: string[] = [];
          const id = toast.loading(`Booking 0 of ${target.length} tours…`);
          // One refresh at the end instead of one per tour.
          await mutate(async (api) => {
            for (const r of target) {
              try {
                await bookRow(api, r);
                done++;
              } catch {
                failed.push(r.tour.tour_id);
              }
              toast.loading(`Booking ${done} of ${target.length} tours…`, { id });
            }
          });
          toast.dismiss(id);
          if (failed.length) toast.error(`Booked ${done}. These need a look: ${failed.join(", ")}`);
          else toast.success(`Booked rooms for ${done} tours`);
          setBusy(false);
        }}
      >
        {busy ? "Booking…" : `Book all ${target.length}`}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- rule, export, import

function RulePopover({ rule, onChange }: { rule: SplitRule; onChange: (r: SplitRule) => void }) {
  const field = (k: keyof SplitRule, label: string) => (
    <label className="flex items-center justify-between gap-4 text-[13px]">
      <span className="text-ink-2">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={10}
          value={rule[k]}
          onChange={(e) => onChange({ ...rule, [k]: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })}
          className="h-8 w-14 rounded-sm bg-well text-center text-[13.5px] font-semibold outline-none ring-1 ring-inset ring-rule tnum focus:ring-2 focus:ring-ink-1"
        />
        <span className="w-[72px] text-ink-3">in Najaf</span>
      </span>
    </label>
  );
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="secondary">Najaf split</Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[320px] space-y-3 rounded-md bg-raised p-4 shadow-lift-high">
          <div className="text-[13.5px] font-semibold">How trips are split</div>
          {field("short", "Trips of 4 to 6 nights")}
          {field("week", "Trips of 7 nights")}
          {field("long", "Trips of 8 nights or more")}
          <p className="text-[12px] leading-relaxed text-ink-3">
            Karbala gets the rest of the trip. The planner tries both orders, Karbala first or Najaf first, and keeps the one that fits the most people, leaning towards whichever matches the
            flights.
          </p>
          {(rule.short !== DEFAULT_RULE.short || rule.week !== DEFAULT_RULE.week || rule.long !== DEFAULT_RULE.long) && (
            <button className="text-[12.5px] font-medium underline-offset-2 hover:underline" onClick={() => onChange(DEFAULT_RULE)}>
              Back to 2, 3 and 4 nights
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ExportButton({ plan, rule }: { plan: Plan; rule: SplitRule }) {
  const { room } = useData();
  return (
    <Button
      icon={<DownloadSimple size={15} />}
      disabled={!plan.rows.length}
      onClick={() => {
        const rows = plan.rows.map((r) => {
          const t = r.tour;
          const sp = r.nights ? split(r.nights, rule) : null;
          const w = r.chosen;
          const stayIn = r.stays.length ? Math.min(...r.stays.map((s) => Date.parse(s.check_in))) : null;
          const stayOut = r.stays.length ? Math.max(...r.stays.map((s) => (s.check_out ? Date.parse(s.check_out) : 0))) : null;
          const kin = w ? w.from : stayIn;
          const kout = w ? w.to : stayOut;
          const roomList = r.status === "booked" ? r.stays.map((s) => `${room.get(s.room_id)?.number ?? s.room_id} (${s.pax ?? "?"})`) : r.rooms.map((fr) => `${fr.room.number} (${fr.pax})`);
          return [
            t.tour_id,
            t.tour_ref,
            t.office,
            t.to_name,
            t.country,
            t.pax,
            t.pax_required,
            t.arrival ? fmtDay(dayKey(Date.parse(t.arrival))) : "",
            t.departure ? fmtDay(dayKey(Date.parse(t.departure))) : "",
            t.entry_port,
            t.exit_port,
            r.nights ?? "",
            w ? ORDER_LABEL[w.order] : r.status === "booked" ? "Booked" : "",
            sp?.najaf ?? "",
            kin ? fmtDay(dayKey(kin)) : "",
            kout ? fmtDay(dayKey(kout)) : "",
            kin && kout ? diffDays(dayKey(kin), dayKey(kout)) : "",
            roomList.join(", "),
            STATUS_TEXT[r.status],
          ];
        });
        const first = plan.nightly[0]?.key ?? dayKey(Date.now());
        downloadXls(
          `Karbala plan ${monthName(first, true)} ${first.slice(0, 4)}`,
          "Karbala plan",
          ["Tour ID", "Tour reference", "Office", "Tour operator", "Country", "Pax", "Pax needing rooms", "Arrives Iraq", "Leaves Iraq", "Entry port", "Exit port", "Trip nights", "Route", "Najaf nights", "Karbala in", "Karbala out (08:00)", "Karbala nights", "Rooms (pax)", "Status"],
          rows,
        );
      }}
    >
      Export
    </Button>
  );
}

function ImportButton({ tours, plannedIds }: { tours: Tour[]; plannedIds: Set<string> }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: string; rows: ErpTour[]; plan: ImportPlan } | null>(null);
  const [busy, setBusy] = useState(false);
  const mutate = useMutate();
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".xls,.html,.htm,.csv"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const rows = await parseErpFile(f);
            if (!rows.length) throw new Error("No tours found in that file.");
            setPreview({ file: f.name, rows, plan: planImport(rows, new Map(tours.map((t) => [t.tour_id, t])), plannedIds) });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't read that file");
          }
        }}
      />
      <Button variant="primary" icon={<FileArrowUp size={16} />} onClick={() => input.current?.click()}>
        Upload ERP report
      </Button>
      {preview && (
        <Modal open onClose={() => setPreview(null)} title="Import tours" description={preview.file} width={560}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="New tours" value={String(preview.plan.inserts.length)} sub={`${preview.plan.inserts.filter((t) => (t.pax_required ?? 0) > 0).length} need rooms`} />
              <Stat label="Changed" value={String(preview.plan.updates.length)} sub={`${preview.plan.updates.filter((u) => u.patch.erp_changed).length} already booked`} />
              <Stat label="Unchanged" value={String(preview.plan.unchanged)} sub="skipped" />
            </div>
            {preview.plan.updates.some((u) => u.changes.length) && (
              <div className="scrollbar-thin max-h-[220px] space-y-1.5 overflow-y-auto rounded-sm bg-well p-3 text-[12.5px]">
                {preview.plan.updates
                  .filter((u) => u.changes.length)
                  .map((u) => (
                    <div key={u.tour_id}>
                      <span className="font-mono font-semibold">{u.tour_id}</span> <span className="text-ink-2">{u.changes.join("; ")}</span>
                      {u.patch.erp_changed && <span className="text-departing"> · has rooms</span>}
                    </div>
                  ))}
              </div>
            )}
            <p className="text-[12.5px] text-ink-3">Only Karbala details are kept: tour, office, pax needing rooms, Iraq arrival and departure, ports and flights. Najaf-only and transport flags are dropped.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={busy || (!preview.plan.inserts.length && !preview.plan.updates.length)}
                onClick={async () => {
                  setBusy(true);
                  const ok = await mutate(
                    (api) =>
                      api.importTours(
                        preview.plan.inserts,
                        preview.plan.updates.map(({ tour_id, patch }) => ({ tour_id, patch })),
                        { file_name: preview.file, tours_total: preview.rows.length, tours_new: preview.plan.inserts.length, tours_changed: preview.plan.updates.length },
                      ),
                    `Imported ${preview.rows.length} tours`,
                  );
                  setBusy(false);
                  if (ok) setPreview(null);
                }}
              >
                {busy ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

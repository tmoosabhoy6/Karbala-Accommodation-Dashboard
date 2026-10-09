import { useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import type { Stay } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { endMs, floorLabel, roomState, startMs, stayLabel } from "@/lib/status";
import { addDays, at, checkoutAt, dayKey, diffDays, fmtDay, fmtWhen, monthName, weekdayShort, type DayKey } from "@/lib/time";
import { fmtHijri, toHijri } from "@/lib/hijri";
import { Button, Chip, cx, Eyebrow } from "@/components/ui";
import { KeyFob } from "@/components/RoomTile";

const COL = 46;
const ROW = 34;
const DAY = 86400000;

export function Timeline() {
  const { rooms, byRoom, buildings, building } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { openRoom, setDialog, hijriAdjust } = useUi();
  const [start, setStart] = useState<DayKey>(addDays(today, -2));
  const [span] = useState(28);
  const [bld, setBld] = useState<string | null>(null);
  const [onlyFree, setOnlyFree] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(start, i)), [start, span]);
  const t0 = +at(start, "00:00");
  const t1 = t0 + span * DAY;
  const x = (ms: number) => ((Math.min(Math.max(ms, t0), t1) - t0) / DAY) * COL;

  const shown = useMemo(
    () =>
      rooms.filter((r) => {
        if (r.room_type === "Staff Room") return false;
        if (bld && r.building_id !== bld) return false;
        if (onlyFree) {
          const st = roomState(r, byRoom.get(r.id), now);
          return st.status === "free" || st.status === "departing";
        }
        return true;
      }),
    [rooms, bld, onlyFree, byRoom, now],
  );

  // Group header rows per building and floor
  const groups = useMemo(() => {
    const out: { key: string; label: string; rooms: typeof shown }[] = [];
    for (const r of shown) {
      const key = `${r.building_id}|${r.floor}`;
      const last = out[out.length - 1];
      if (last?.key === key) last.rooms.push(r);
      else out.push({ key, label: `${building.get(r.building_id)?.name} · ${floorLabel(r.floor)}`, rooms: [r] });
    }
    return out;
  }, [shown, building]);

  const months = useMemo(() => {
    const m: { label: string; n: number }[] = [];
    for (const d of days) {
      const label = `${monthName(d, true)} ${d.slice(0, 4)}`;
      if (m[m.length - 1]?.label === label) m[m.length - 1].n++;
      else m.push({ label, n: 1 });
    }
    return m;
  }, [days]);

  const width = span * COL;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Timeline</Eyebrow>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">
            {fmtDay(days[0])} <span className="text-ink-3">to</span> {fmtDay(days[days.length - 1])}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={!bld} onClick={() => setBld(null)}>
            Both
          </Chip>
          {buildings.map((b) => (
            <Chip key={b.id} active={bld === b.id} onClick={() => setBld(b.id)}>
              {b.name}
            </Chip>
          ))}
          <Chip active={onlyFree} onClick={() => setOnlyFree((v) => !v)}>
            Free or leaving
          </Chip>
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={() => setStart(addDays(start, -7))} aria-label="Earlier">
              <CaretLeft size={15} />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setStart(addDays(today, -2))}>
              Today
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStart(addDays(start, 7))} aria-label="Later">
              <CaretRight size={15} />
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md bg-card shadow-lift">
        <div ref={scroller} className="scrollbar-thin max-h-[calc(100dvh-210px)] overflow-auto">
          <div style={{ width: width + 112 }} className="relative">
            {/* header */}
            <div className="sticky top-0 z-20 flex border-b border-rule bg-card">
              <div className="sticky left-0 z-10 w-[112px] shrink-0 border-r border-rule bg-card" />
              <div>
                <div className="flex h-6 border-b border-rule">
                  {months.map((m) => (
                    <div key={m.label} style={{ width: m.n * COL }} className="truncate border-r border-rule px-2 text-[11px] leading-6 font-medium text-ink-3">
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {days.map((d) => {
                    const h = toHijri(d, hijriAdjust);
                    const isToday = d === today;
                    const fri = weekdayShort(d) === "Fri";
                    return (
                      <div key={d} style={{ width: COL }} className={cx("flex h-12 flex-col items-center justify-center border-r border-rule text-center leading-tight", fri && "bg-well/70")}>
                        <span className={cx("text-[10.5px]", isToday ? "font-semibold text-ink-1" : "text-ink-3")}>{weekdayShort(d)}</span>
                        <span className={cx("grid size-6 place-items-center rounded-full text-[13px] font-semibold tnum", isToday && "bg-ink-1 text-canvas")}>{Number(d.slice(8))}</span>
                        <span className="text-[9.5px] text-ink-4 tnum" title={fmtHijri(d, hijriAdjust)}>
                          {h.day}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* now line */}
            {now > t0 && now < t1 && <div className="pointer-events-none absolute top-[72px] bottom-0 z-10 w-px bg-occupied" style={{ left: 112 + x(now) }} />}

            {groups.map((g) => (
              <div key={g.key}>
                <div className="sticky left-0 z-[5] flex h-7 items-center border-b border-rule bg-well/80 px-3 text-[11.5px] font-medium text-ink-2 backdrop-blur" style={{ width: width + 112 }}>
                  <span className="sticky left-3">{g.label}</span>
                </div>
                {g.rooms.map((r) => {
                  const list = (byRoom.get(r.id) ?? []).filter((s) => startMs(s) < t1 && endMs(s) > t0);
                  const st = roomState(r, byRoom.get(r.id), now);
                  return (
                    <div key={r.id} className="group flex border-b border-rule" style={{ height: ROW }}>
                      <button onClick={() => openRoom(r.id)} className="sticky left-0 z-[6] flex w-[112px] shrink-0 items-center gap-2 border-r border-rule bg-card px-2 hover:bg-well">
                        <KeyFob room={r} status={st.status} size="sm" />
                        <span className="text-[11px] text-ink-3 tnum">{r.beds}</span>
                      </button>
                      <div
                        className="relative cursor-cell"
                        style={{ width }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const i = Math.floor((e.clientX - rect.left) / COL);
                          const d = days[i];
                          if (!d || d < today) return;
                          const from = d === today ? now : +at(d, "12:00");
                          setDialog({ type: "checkin", roomId: r.id, from, to: +checkoutAt(addDays(d, 2)) });
                        }}
                      >
                        <div className="pointer-events-none absolute inset-0 flex">
                          {days.map((d) => (
                            <div key={d} style={{ width: COL }} className={cx("h-full border-r border-rule/60", weekdayShort(d) === "Fri" && "bg-well/50", d < today && "bg-well/30")} />
                          ))}
                        </div>
                        {list.map((s) => (
                          <Bar key={s.id} s={s} left={x(startMs(s))} right={x(endMs(s))} now={now} today={today} cut={{ l: startMs(s) < t0, r: endMs(s) > t1 }} onOpen={() => openRoom(r.id)} sharing={r.sharing !== "none"} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-3">
        <span>Tap an empty day to book that room. Bars start at check-in and end at 08:00 on the checkout day.</span>
        <span>Small numbers under each date are the Hijri day.</span>
      </div>
    </div>
  );
}

function Bar({ s, left, right, now, today, cut, onOpen, sharing }: { s: Stay; left: number; right: number; now: number; today: DayKey; cut: { l: boolean; r: boolean }; onOpen: () => void; sharing: boolean }) {
  const past = endMs(s) <= now;
  const future = startMs(s) > now;
  const leaving = !past && !future && Number.isFinite(endMs(s)) && diffDays(today, dayKey(endMs(s))) <= 1;
  const blocked = s.category === "blocked";
  const tone = blocked ? "var(--blocked)" : past ? "var(--ink-4)" : future ? "var(--arriving)" : leaving ? "var(--departing)" : "var(--occupied)";
  const w = Math.max(6, right - left - 2);
  const label = stayLabel(s) || CATEGORY_LABEL[s.category];
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${label} · ${s.pax ?? "?"} pax · in ${fmtWhen(startMs(s))}${Number.isFinite(endMs(s)) ? ` · out ${fmtWhen(endMs(s))}` : " · open-ended"}`}
      className={cx("press absolute top-[5px] flex items-center overflow-hidden px-2 text-left text-[11.5px] font-medium whitespace-nowrap", blocked && "hatch", cut.l ? "rounded-l-none" : "rounded-l-[6px]", cut.r ? "rounded-r-none" : "rounded-r-[6px]")}
      style={{
        left: left + 1,
        width: w,
        height: sharing ? ROW - 14 : ROW - 10,
        background: blocked ? undefined : `color-mix(in oklab, ${tone} ${past ? 14 : 20}%, var(--card))`,
        boxShadow: `inset 3px 0 0 ${tone}`,
        color: past ? "var(--ink-3)" : "var(--ink-1)",
      }}
    >
      {s.tour_id && <span className="mr-1 font-mono font-semibold">{s.tour_id}</span>}
      <span className="truncate">{s.tour_id ? s.group_name : label}</span>
      {s.pax ? <span className="ml-1 text-ink-3">· {s.pax}</span> : null}
    </button>
  );
}

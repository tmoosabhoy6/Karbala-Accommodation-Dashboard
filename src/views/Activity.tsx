import { useMemo, useState } from "react";
import { ArrowsLeftRight, CalendarCheck, ClockCounterClockwise, Lock, PencilSimple, Robot, SignIn, SignOut, XCircle } from "@phosphor-icons/react";
import { useData, useNow } from "@/data/store";
import { useUi } from "@/state/ui";
import { ago, clock, dayKey, fmtDay, relDay } from "@/lib/time";
import { Card, Chip, Empty, Eyebrow } from "@/components/ui";

const ICON: Record<string, typeof SignIn> = {
  check_in: SignIn,
  reserve: CalendarCheck,
  check_out: SignOut,
  auto_check_out: Robot,
  transfer: ArrowsLeftRight,
  move: ArrowsLeftRight,
  cancel: XCircle,
  block: Lock,
  edit: PencilSimple,
  dates: CalendarCheck,
};

const KINDS: { key: string; label: string; match: (a: string) => boolean }[] = [
  { key: "all", label: "Everything", match: () => true },
  { key: "in", label: "Check-ins", match: (a) => a === "check_in" || a === "reserve" },
  { key: "out", label: "Check-outs", match: (a) => a.includes("check_out") },
  { key: "moves", label: "Moves", match: (a) => a === "transfer" || a === "move" },
  { key: "changes", label: "Changes", match: (a) => ["edit", "dates", "cancel", "block", "undo_check_out"].includes(a) },
];

export function Activity() {
  const { snap } = useData();
  const now = useNow();
  const today = dayKey(now);
  const { openRoom } = useUi();
  const [kind, setKind] = useState("all");
  const match = KINDS.find((k) => k.key === kind)!.match;
  const days = useMemo(() => {
    const m = new Map<string, typeof snap.activity>();
    for (const a of snap.activity) {
      if (!match(a.action)) continue;
      const k = dayKey(Date.parse(a.at));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [snap.activity, match]);

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div>
        <Eyebrow>Activity</Eyebrow>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.025em]">Everything that changed</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">Every check-in, move and check-out is written down here, including the automatic 08:00 check-outs.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>
            {k.label}
          </Chip>
        ))}
      </div>
      {days.length === 0 ? (
        <Card>
          <Empty title="Nothing yet" icon={<ClockCounterClockwise size={32} />}>
            Changes made in the dashboard will show up here.
          </Empty>
        </Card>
      ) : (
        days.map(([k, list]) => (
          <section key={k}>
            <div className="mb-2 text-[12px] font-medium text-ink-3">
              <span className="capitalize text-ink-1">{Math.abs(Date.parse(k) - Date.parse(today)) <= 86400000 ? relDay(k, today) : fmtDay(k)}</span>
              {Math.abs(Date.parse(k) - Date.parse(today)) <= 86400000 && ` · ${fmtDay(k)}`}
            </div>
            <Card className="divide-y divide-rule">
              {list.map((a) => {
                const Icon = ICON[a.action] ?? PencilSimple;
                return (
                  <button key={a.id} onClick={() => a.room_id && openRoom(a.room_id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-well/50">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-well text-ink-2">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{a.summary}</span>
                    <span className="shrink-0 text-[12px] text-ink-3 tnum" title={ago(Date.parse(a.at), now)}>
                      {clock(Date.parse(a.at))}
                    </span>
                  </button>
                );
              })}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

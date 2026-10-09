import { useEffect, useState, type ReactNode } from "react";
import {
  Buildings,
  CalendarCheck,
  ClockCounterClockwise,
  DoorOpen,
  GearSix,
  MagnifyingGlass,
  Moon,
  Rows,
  SignIn,
  SquaresFour,
  Sun,
  UsersThree,
  Sparkle,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { useUi, type View } from "@/state/ui";
import { useApi, useNow, useSnapshot } from "@/data/store";
import { clock, dayKey, weekday } from "@/lib/time";
import { fmtHijri } from "@/lib/hijri";
import { Button, cx, Kbd, Segmented } from "./ui";

const NAV: { view: View; label: string; icon: typeof SquaresFour; group?: string }[] = [
  { view: "overview", label: "Today", icon: SquaresFour },
  { view: "floors", label: "Floors", icon: Buildings },
  { view: "rooms", label: "Rooms", icon: DoorOpen },
  { view: "timeline", label: "Timeline", icon: Rows },
  { view: "allocate", label: "Allocate", icon: Sparkle, group: "Plan" },
  { view: "planner", label: "Month planner", icon: CalendarCheck, group: "Plan" },
  { view: "tours", label: "Tours", icon: UsersThree, group: "Plan" },
  { view: "activity", label: "Activity", icon: ClockCounterClockwise, group: "Plan" },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--ink-1)" />
        <rect x="7" y="7" width="8" height="8" rx="1.5" fill="var(--free)" />
        <rect x="17" y="7" width="8" height="8" rx="1.5" fill="var(--occupied)" />
        <rect x="7" y="17" width="8" height="8" rx="1.5" fill="var(--departing)" />
        <rect x="17" y="17" width="8" height="8" rx="1.5" fill="var(--arriving)" />
      </svg>
      <div className="leading-tight">
        <div className="text-[14px] font-semibold tracking-[-0.01em]">Karbala Rooms</div>
        <div className="text-[11.5px] text-ink-3">Amatullah · Qasr</div>
      </div>
    </div>
  );
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("krb-theme", dark ? "dark" : "light");
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

function Connection() {
  const api = useApi();
  const q = useSnapshot();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  const state = api?.mode === "demo" ? "demo" : !online || q.isError ? "offline" : q.isFetching ? "syncing" : "live";
  const label = { demo: "Demo data (this browser only)", offline: "Offline, showing saved copy", syncing: "Syncing", live: "Live, saved to the cloud" }[state];
  const color = { demo: "var(--departing)", offline: "var(--occupied)", syncing: "var(--arriving)", live: "var(--free)" }[state];
  return (
    <div className="flex items-center gap-2 px-2 text-[12px] text-ink-3" title={q.dataUpdatedAt ? `Last updated ${new Date(q.dataUpdatedAt).toLocaleTimeString()}` : undefined}>
      <span className="relative flex size-2">
        {state === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-40" style={{ background: color }} />}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
      </span>
      {label}
    </div>
  );
}

function Settings() {
  const [dark, setDark] = useTheme();
  const { hijriAdjust, setHijriAdjust } = useUi();
  const today = dayKey(useNow());
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="press flex size-9 items-center justify-center rounded-sm text-ink-3 hover:bg-well hover:text-ink-1" aria-label="Settings">
          <GearSix size={18} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} className="z-50 w-[280px] rounded-md bg-raised p-4 shadow-lift-high">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-[12px] font-medium text-ink-2">Appearance</div>
              <Segmented
                value={dark ? "dark" : "light"}
                onChange={(v) => setDark(v === "dark")}
                options={[
                  { value: "light", label: <span className="flex items-center gap-1.5"><Sun size={14} /> Day</span> },
                  { value: "dark", label: <span className="flex items-center gap-1.5"><Moon size={14} /> Night</span> },
                ]}
              />
            </div>
            <div>
              <div className="mb-1 text-[12px] font-medium text-ink-2">Hijri date</div>
              <div className="mb-2 text-[12px] text-ink-3">Today shows as {fmtHijri(today, hijriAdjust)}. Shift it if it is a day off.</div>
              <Segmented
                size="sm"
                value={String(hijriAdjust)}
                onChange={(v) => setHijriAdjust(Number(v))}
                options={[
                  { value: "-1", label: "−1 day" },
                  { value: "0", label: "As is" },
                  { value: "1", label: "+1 day" },
                ]}
              />
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { view, go, setDialog, setSearch, hijriAdjust } = useUi();
  const now = useNow();
  const today = dayKey(now);
  const tours = useSnapshot().data?.tours ?? [];
  const pendingPlans = tours.filter((t) => t.status === "open" && t.erp_changed).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [setSearch]);

  let lastGroup: string | undefined;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule px-3 py-4 lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-1 flex-col gap-0.5">
          {NAV.map((n) => {
            const header = n.group && n.group !== lastGroup;
            lastGroup = n.group;
            return (
              <div key={n.view}>
                {header && <div className="mt-5 mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-4">{n.group}</div>}
                <button
                  onClick={() => go(n.view)}
                  className={cx(
                    "press flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] font-medium",
                    view === n.view ? "bg-raised text-ink-1 shadow-lift" : "text-ink-2 hover:bg-well hover:text-ink-1",
                  )}
                >
                  <n.icon size={17} weight={view === n.view ? "fill" : "regular"} />
                  {n.label}
                  {n.view === "planner" && pendingPlans > 0 && (
                    <span className="ml-auto rounded-full bg-departing/15 px-1.5 text-[11px] text-departing tnum">{pendingPlans}</span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="flex items-center justify-between">
          <Connection />
          <Settings />
        </div>
      </aside>

      <div className="min-w-0 pb-24 lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-rule bg-canvas/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <div className="lg:hidden">
              <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
                <rect width="32" height="32" rx="8" fill="var(--ink-1)" />
                <rect x="7" y="7" width="8" height="8" rx="1.5" fill="var(--free)" />
                <rect x="17" y="7" width="8" height="8" rx="1.5" fill="var(--occupied)" />
                <rect x="7" y="17" width="8" height="8" rx="1.5" fill="var(--departing)" />
                <rect x="17" y="17" width="8" height="8" rx="1.5" fill="var(--arriving)" />
              </svg>
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13.5px] font-medium">
                {weekday(today)} {new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}
                <span className="ml-2 font-mono text-ink-3 tnum">{clock(now)}</span>
              </div>
              <div className="truncate text-[12px] text-ink-3">{fmtHijri(today, hijriAdjust)}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setSearch(true)}
                className="press hidden h-9 w-[260px] items-center gap-2 rounded-sm bg-well px-3 text-[13px] text-ink-3 ring-1 ring-inset ring-rule hover:text-ink-2 md:flex"
              >
                <MagnifyingGlass size={15} />
                Room, tour ID or group
                <span className="ml-auto flex gap-0.5">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
              <button onClick={() => setSearch(true)} className="press grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-well md:hidden" aria-label="Search">
                <MagnifyingGlass size={18} />
              </button>
              <Button variant="primary" icon={<SignIn size={16} weight="bold" />} onClick={() => setDialog({ type: "checkin" })}>
                Check in
              </Button>
            </div>
          </div>
        </header>
        <main className="px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-canvas/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="no-scrollbar flex overflow-x-auto">
          {NAV.map((n) => (
            <button
              key={n.view}
              onClick={() => go(n.view)}
              className={cx("flex min-w-[72px] flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium", view === n.view ? "text-ink-1" : "text-ink-3")}
            >
              <n.icon size={21} weight={view === n.view ? "fill" : "regular"} />
              {n.label.replace("Month planner", "Planner")}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

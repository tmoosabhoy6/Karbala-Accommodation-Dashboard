import { create } from "zustand";

export type View = "overview" | "floors" | "rooms" | "timeline" | "allocate" | "planner" | "tours" | "activity";

export type Dialog =
  | { type: "checkin"; roomId?: string; from?: number; to?: number; tourId?: string; groupName?: string; pax?: number }
  | { type: "transfer"; stayId: string }
  | { type: "dates"; stayId: string }
  | { type: "edit"; stayId: string }
  | { type: "room"; roomId: string }
  | { type: "block"; roomId: string }
  | null;

interface UiState {
  view: View;
  buildingId: string | null;
  floor: string | null;
  roomId: string | null;
  tourId: string | null;
  dialog: Dialog;
  search: boolean;
  hijriAdjust: number;
  go: (view: View, extra?: Partial<Pick<UiState, "buildingId" | "floor" | "tourId">>) => void;
  openRoom: (roomId: string | null) => void;
  setDialog: (d: Dialog) => void;
  setSearch: (open: boolean) => void;
  setFloor: (buildingId: string, floor: string | null) => void;
  setHijriAdjust: (n: number) => void;
}

const VIEWS: View[] = ["overview", "floors", "rooms", "timeline", "allocate", "planner", "tours", "activity"];

function fromHash(): Partial<UiState> {
  const [view, a, b] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (!VIEWS.includes(view as View)) return { view: "overview" };
  if (view === "floors") return { view, buildingId: a || null, floor: b || null };
  if (view === "planner" || view === "tours") return { view, tourId: a || null };
  return { view: view as View };
}

function toHash(s: Pick<UiState, "view" | "buildingId" | "floor" | "tourId">) {
  const parts: string[] = [s.view];
  if (s.view === "floors" && s.buildingId) parts.push(s.buildingId, ...(s.floor ? [s.floor] : []));
  if ((s.view === "planner" || s.view === "tours") && s.tourId) parts.push(s.tourId);
  const next = `#/${parts.map(encodeURIComponent).join("/")}`;
  if (location.hash !== next) history.replaceState(null, "", next);
}

const savedAdjust = (() => {
  try {
    return Number(localStorage.getItem("krb-hijri-adjust") ?? 0) || 0;
  } catch {
    return 0;
  }
})();

export const useUi = create<UiState>((set, get) => ({
  view: "overview",
  buildingId: null,
  floor: null,
  roomId: null,
  tourId: null,
  dialog: null,
  search: false,
  hijriAdjust: savedAdjust,
  ...fromHash(),
  go: (view, extra) => {
    set({ view, ...extra });
    toHash({ ...get(), view, ...extra });
    window.scrollTo({ top: 0 });
  },
  openRoom: (roomId) => set({ roomId }),
  setDialog: (dialog) => set({ dialog }),
  setSearch: (search) => set({ search }),
  setFloor: (buildingId, floor) => {
    set({ buildingId, floor });
    toHash({ ...get(), buildingId, floor });
  },
  setHijriAdjust: (n) => {
    try {
      localStorage.setItem("krb-hijri-adjust", String(n));
    } catch {
      /* private mode */
    }
    set({ hijriAdjust: n });
  },
}));

window.addEventListener("hashchange", () => useUi.setState(fromHash()));

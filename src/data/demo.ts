import type { Api } from "./api";
import type { Activity, Building, Room, Stay, Tour } from "@/lib/types";
import { availability, indexStays, stayLabel } from "@/lib/status";

// Browser-only stand-in for the database, used when no Supabase keys are configured
// (local development and previews). Mirrors the database rules closely enough to try the app.
interface DemoDb {
  buildings: Building[];
  rooms: Room[];
  stays: Stay[];
  tours: Tour[];
  activity: Activity[];
}

const KEY = "krb-demo-db";

export async function demoApi(): Promise<Api> {
  let db: DemoDb;
  const saved = localStorage.getItem(KEY);
  if (saved) db = JSON.parse(saved);
  else {
    const res = await fetch("/demo-seed.json");
    db = res.ok ? await res.json() : { buildings: [], rooms: [], stays: [], tours: [], activity: [] };
  }
  const listeners = new Set<() => void>();
  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(db));
    listeners.forEach((l) => l());
  };
  const now = () => new Date().toISOString();
  let seq = db.activity.reduce((n, a) => Math.max(n, a.id), 0);
  const log = (action: string, s: Stay, summary: string) =>
    db.activity.unshift({ id: ++seq, at: now(), action, room_id: s.room_id, stay_id: s.id, tour_id: s.tour_id, summary });
  const roomNo = (id: string) => db.rooms.find((r) => r.id === id)?.number ?? id;

  function check(s: Stay) {
    const room = db.rooms.find((r) => r.id === s.room_id)!;
    const end = s.checked_out_at ?? s.check_out;
    const a = availability(room, indexStays(db.stays).get(room.id), Date.parse(s.check_in), end ? Date.parse(end) : Infinity, s.pax ?? 1, s.id);
    if (!a.ok) throw new Error(`Room ${room.number}: ${a.reason}`);
  }

  function autoCheckout() {
    const t = Date.now();
    for (const s of db.stays) {
      if (!s.checked_out_at && !s.cancelled_at && s.check_out && Date.parse(s.check_out) <= t) {
        s.checked_out_at = s.check_out;
        s.auto_checked_out = true;
        log("auto_check_out", s, `${stayLabel(s)} auto checked out of ${roomNo(s.room_id)}`);
      }
    }
  }

  return {
    mode: "demo",
    async load() {
      autoCheckout();
      return structuredClone(db);
    },
    async createStays(rows) {
      const made: Stay[] = [];
      for (const r of rows) {
        const s: Stay = {
          id: crypto.randomUUID(),
          tour_id: null,
          group_name: null,
          guest_name: null,
          phone: null,
          pax: null,
          notes: null,
          check_out: null,
          checked_out_at: null,
          auto_checked_out: false,
          cancelled_at: null,
          transferred_from: null,
          transferred_to: null,
          arrived_at: null,
          source: "app",
          created_at: now(),
          updated_at: now(),
          ...r,
        };
        check(s);
        db.stays.push(s);
        made.push(s);
      }
      for (const s of made) {
        const soon = Date.parse(s.check_in) <= Date.now() + 600000;
        log(s.category === "blocked" ? "block" : soon ? "check_in" : "reserve", s, `${stayLabel(s)} ${soon ? "checked in to" : "booked into"} ${roomNo(s.room_id)}`);
      }
      save();
    },
    async updateStay(id, patch) {
      const s = db.stays.find((x) => x.id === id);
      if (!s) throw new Error("Stay not found");
      const next = { ...s, ...patch, updated_at: now() };
      if (!next.cancelled_at) check(next);
      Object.assign(s, next);
      if (patch.checked_out_at) log("check_out", s, `${stayLabel(s)} checked out of ${roomNo(s.room_id)}`);
      else if (patch.cancelled_at) log("cancel", s, `${stayLabel(s)} cancelled in ${roomNo(s.room_id)}`);
      else log("edit", s, `${stayLabel(s)} updated in ${roomNo(s.room_id)}`);
      save();
    },
    async transferStay(id, roomId) {
      const s = db.stays.find((x) => x.id === id);
      if (!s) throw new Error("Stay not found");
      const t = now();
      if (Date.parse(s.check_in) > Date.now()) {
        const moved = { ...s, room_id: roomId };
        check(moved);
        Object.assign(s, moved);
        log("move", s, `${stayLabel(s)} booking moved to ${roomNo(roomId)}`);
      } else {
        const n: Stay = { ...s, id: crypto.randomUUID(), room_id: roomId, check_in: t, transferred_from: s.id, created_at: t, updated_at: t };
        check(n);
        db.stays.push(n);
        s.checked_out_at = t;
        s.transferred_to = n.id;
        log("transfer", s, `${stayLabel(s)} moved from ${roomNo(s.room_id)} to ${roomNo(roomId)}`);
      }
      save();
    },
    async updateRoom(id, patch) {
      Object.assign(db.rooms.find((r) => r.id === id)!, patch);
      save();
    },
    async importTours(inserts, updates) {
      for (const t of inserts) db.tours.push({ status: "open", ...t } as Tour);
      for (const u of updates) Object.assign(db.tours.find((t) => t.tour_id === u.tour_id)!, u.patch);
      save();
    },
    async upsertTour(tour) {
      const old = db.tours.find((t) => t.tour_id === tour.tour_id);
      if (old) Object.assign(old, tour);
      else db.tours.push({ pax: 0, pax_required: 0, pax_not_required: 0, status: "open", ...tour } as Tour);
      save();
    },
    async updateTour(id, patch) {
      Object.assign(db.tours.find((t) => t.tour_id === id)!, patch);
      save();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

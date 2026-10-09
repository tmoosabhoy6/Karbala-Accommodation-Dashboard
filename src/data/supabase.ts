import { createClient, type PostgrestError } from "@supabase/supabase-js";
import type { Api } from "./api";
import type { Activity, Building, Room, Stay, Tour } from "@/lib/types";

const HISTORY_DAYS = 75;

function fail(error: PostgrestError | null): void {
  if (!error) return;
  // Messages raised by the database triggers are written for people; pass them through.
  throw new Error(error.message || "Couldn't save. Check the connection and try again.");
}

export function supabaseApi(url: string, key: string): Api {
  const db = createClient(url, key, { auth: { persistSession: false } });

  async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build(from, from + 999);
      fail(error);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  }

  return {
    mode: "live",
    async load() {
      const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
      const [buildings, rooms, stays, tours, activity] = await Promise.all([
        all<Building>((a, b) => db.from("buildings").select("*").order("sort").range(a, b)),
        all<Room>((a, b) => db.from("rooms").select("*").order("sort").range(a, b)),
        all<Stay>((a, b) =>
          db.from("stays").select("*").is("cancelled_at", null).or(`check_out.is.null,check_out.gte.${since}`).order("check_in").range(a, b),
        ),
        all<Tour>((a, b) => db.from("tours").select("*").or(`departure.is.null,departure.gte.${since}`).order("arrival").range(a, b)),
        db
          .from("activity")
          .select("*")
          .order("at", { ascending: false })
          .limit(300)
          .then(({ data, error }) => {
            fail(error);
            return (data ?? []) as Activity[];
          }),
      ]);
      return { buildings, rooms, stays, tours, activity };
    },
    async createStays(rows) {
      const { error } = await db.from("stays").insert(rows.map((r) => ({ ...r, source: "app" })));
      fail(error);
    },
    async updateStay(id, patch) {
      const { error } = await db.from("stays").update(patch).eq("id", id);
      fail(error);
    },
    async transferStay(id, roomId) {
      const { error } = await db.rpc("transfer_stay", { p_stay: id, p_room: roomId });
      fail(error);
    },
    async updateRoom(id, patch) {
      const { error } = await db.from("rooms").update(patch).eq("id", id);
      fail(error);
    },
    async importTours(inserts, updates, meta) {
      const { data, error } = await db.from("imports").insert(meta).select("id").single();
      fail(error);
      const importId = data?.id ?? null;
      for (let i = 0; i < inserts.length; i += 200) {
        const { error: e } = await db.from("tours").insert(inserts.slice(i, i + 200).map((t) => ({ ...t, import_id: importId })));
        fail(e);
      }
      for (const u of updates) {
        const { error: e } = await db.from("tours").update({ ...u.patch, import_id: importId }).eq("tour_id", u.tour_id);
        fail(e);
      }
    },
    async upsertTour(tour) {
      const { error } = await db.from("tours").upsert(tour, { onConflict: "tour_id" });
      fail(error);
    },
    async updateTour(id, patch) {
      const { error } = await db.from("tours").update(patch).eq("tour_id", id);
      fail(error);
    },
    subscribe(onChange) {
      const channel = db
        .channel("krb-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "stays" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, onChange)
        .on("postgres_changes", { event: "*", schema: "public", table: "tours" }, onChange)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, onChange)
        .subscribe();
      return () => {
        void db.removeChannel(channel);
      };
    },
  };
}

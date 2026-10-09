import type { Activity, Building, Room, Snapshot, Stay, Tour } from "@/lib/types";

export type NewStay = Pick<Stay, "room_id" | "category" | "check_in"> &
  Partial<Pick<Stay, "tour_id" | "group_name" | "guest_name" | "phone" | "pax" | "notes" | "check_out" | "arrived_at">>;

export type StayPatch = Partial<
  Pick<Stay, "tour_id" | "group_name" | "guest_name" | "phone" | "pax" | "notes" | "check_in" | "check_out" | "checked_out_at" | "cancelled_at" | "category" | "arrived_at" | "room_id">
>;

export type RoomPatch = Partial<Pick<Room, "room_type" | "beds" | "extra_beds" | "sharing" | "notes" | "active">>;

export interface ImportMeta {
  file_name: string;
  tours_total: number;
  tours_new: number;
  tours_changed: number;
}

export interface Api {
  mode: "live" | "demo";
  load(): Promise<Omit<Snapshot, "loadedAt">>;
  createStays(rows: NewStay[]): Promise<void>;
  updateStay(id: string, patch: StayPatch): Promise<void>;
  transferStay(id: string, roomId: string): Promise<void>;
  updateRoom(id: string, patch: RoomPatch): Promise<void>;
  importTours(inserts: Partial<Tour>[], updates: { tour_id: string; patch: Partial<Tour> }[], meta: ImportMeta): Promise<void>;
  upsertTour(tour: Partial<Tour> & { tour_id: string }): Promise<void>;
  updateTour(id: string, patch: Partial<Tour>): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export type { Activity, Building };

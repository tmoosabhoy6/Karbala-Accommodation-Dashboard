export type Sharing = "none" | "male" | "female";
export type Category = "tour" | "group_leader" | "khidmat_guzar" | "hr_mawaid" | "staff" | "blocked";

export interface Building {
  id: string;
  name: string;
  code: string;
  sort: number;
}

export interface Room {
  id: string;
  building_id: string;
  number: string;
  floor: string;
  floor_sort: number;
  room_type: string;
  beds: number;
  extra_beds: number;
  sharing: Sharing;
  notes: string | null;
  sort: number;
  active: boolean;
}

export interface Stay {
  id: string;
  room_id: string;
  category: Category;
  tour_id: string | null;
  group_name: string | null;
  guest_name: string | null;
  phone: string | null;
  pax: number | null;
  notes: string | null;
  check_in: string;
  check_out: string | null;
  checked_out_at: string | null;
  auto_checked_out: boolean;
  cancelled_at: string | null;
  transferred_from: string | null;
  transferred_to: string | null;
  arrived_at: string | null;
  source: "app" | "sheet";
  created_at: string;
  updated_at: string;
}

export interface Tour {
  tour_id: string;
  tour_ref: string | null;
  office: string | null;
  to_name: string | null;
  to_its: string | null;
  country: string | null;
  city: string | null;
  arrival: string | null;
  departure: string | null;
  entry_port: string | null;
  exit_port: string | null;
  arrival_flight: string | null;
  departure_flight: string | null;
  pax: number;
  pax_required: number;
  pax_not_required: number;
  approved_option: string | null;
  mawaid: boolean | null;
  karbala_in: string | null;
  karbala_out: string | null;
  preferred_building: string | null;
  gender: "family" | "male" | "female" | null;
  notes: string | null;
  status: "open" | "cancelled" | "not_needed";
  /** Supervisor override for the month planner. Null lets the planner decide. */
  plan_order: "karbala_first" | "najaf_first" | "skip" | null;
  erp_changed: string | null;
  import_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  at: string;
  action: string;
  room_id: string | null;
  stay_id: string | null;
  tour_id: string | null;
  summary: string;
}

export interface Snapshot {
  buildings: Building[];
  rooms: Room[];
  stays: Stay[];
  tours: Tour[];
  activity: Activity[];
  loadedAt: number;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  tour: "Tour",
  group_leader: "Group Leader",
  khidmat_guzar: "Khidmat Guzar",
  hr_mawaid: "HR Mawaid",
  staff: "Staff",
  blocked: "Blocked",
};

export const SHARING_LABEL: Record<Sharing, string> = {
  none: "Private",
  male: "Male sharing",
  female: "Female sharing",
};

import type { Tour } from "./types";
import { at, CHECKOUT_TIME, dayKey } from "./time";

/** One tour row from the ERP "Pending Tours Report", keeping only what matters in Karbala. */
export interface ErpTour {
  tour_id: string;
  tour_ref: string;
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
}

const COLS = {
  ref: "tour reference no.",
  its: "to/partner its no.",
  toName: "to name",
  office: "office name",
  country: "country name",
  city: "city name",
  entry: "entry port",
  exit: "exit port",
  arrival: "arrival date",
  departure: "departure date",
  pax: "pax count",
  required: "pax required accommodation",
  notRequired: "pax not required accommodation",
  approved: "approved accommodation option",
  mawaid: "is mawaid required?",
  arrMode: "arrival transport mode",
  arrCode: "arrival transport code",
  depMode: "departure transport mode",
  depCode: "departure transport code",
} as const;

/** "'01-11-2026 10:00 AM" (Karbala time) to ISO. */
export function parseErpDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.replace(/^'/, "").trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
  if (!m) return null;
  const [, d, mo, y, hh = "12", mm = "00", ap] = m;
  let h = Number(hh);
  if (ap) {
    if (ap.toUpperCase() === "PM" && h < 12) h += 12;
    if (ap.toUpperCase() === "AM" && h === 12) h = 0;
  }
  const key = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return at(key, `${String(h).padStart(2, "0")}:${mm}`).toISOString();
}

function rowsFromHtml(text: string): string[][] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const tables = [...doc.querySelectorAll("table")];
  const table = tables.sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!table) return [];
  return [...table.rows].map((r) => [...r.cells].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()));
}

function rowsFromCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) out.push([...row, cell.trim()]);
  return out;
}

export async function parseErpFile(file: File): Promise<ErpTour[]> {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0x50 && head[1] === 0x4b) {
    throw new Error("This is a modern .xlsx file. Upload the report exactly as the ERP exports it (.xls), or save it as CSV.");
  }
  if (head[0] === 0xd0 && head[1] === 0xcf) {
    throw new Error("This is an old binary Excel file. Upload the report exactly as the ERP exports it, or save it as CSV.");
  }
  const text = new TextDecoder("utf-8").decode(buf);
  const rows = /<table/i.test(text) ? rowsFromHtml(text) : rowsFromCsv(text);
  const headerAt = rows.findIndex((r) => r.some((c) => c.toLowerCase() === COLS.ref));
  if (headerAt < 0) throw new Error("Couldn't find the 'Tour Reference No.' column. Is this the Pending Tours Report?");
  const header = rows[headerAt].map((c) => c.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const get = (r: string[], name: string) => {
    const i = col(name);
    const v = i >= 0 ? r[i] : "";
    return v && v !== "N/A" ? v : "";
  };
  const num = (v: string) => (v ? Number(v.replace(/[^\d.-]/g, "")) || 0 : 0);
  const tours: ErpTour[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const ref = get(r, COLS.ref);
    if (!ref) continue;
    const tourId = ref.split("/").pop()!.trim();
    const flight = (mode: string, code: string) => [mode, code].filter(Boolean).join(" ") || null;
    tours.push({
      tour_id: tourId,
      tour_ref: ref,
      office: get(r, COLS.office) || null,
      to_name: get(r, COLS.toName) || null,
      to_its: get(r, COLS.its) || null,
      country: get(r, COLS.country) || null,
      city: get(r, COLS.city) || null,
      arrival: parseErpDate(get(r, COLS.arrival)),
      departure: parseErpDate(get(r, COLS.departure)),
      entry_port: get(r, COLS.entry) || null,
      exit_port: get(r, COLS.exit) || null,
      arrival_flight: flight(get(r, COLS.arrMode), get(r, COLS.arrCode)),
      departure_flight: flight(get(r, COLS.depMode), get(r, COLS.depCode)),
      pax: num(get(r, COLS.pax)),
      pax_required: num(get(r, COLS.required)),
      pax_not_required: num(get(r, COLS.notRequired)),
      approved_option: get(r, COLS.approved) || null,
      mawaid: get(r, COLS.mawaid) ? get(r, COLS.mawaid).toLowerCase() === "yes" : null,
    });
  }
  return tours;
}

/** Default Karbala window for a tour: arrival until departure, never earlier than 08:00 that day. */
export function defaultWindow(t: Pick<Tour, "arrival" | "departure">): { karbala_in: string | null; karbala_out: string | null } {
  if (!t.arrival || !t.departure) return { karbala_in: t.arrival, karbala_out: t.departure };
  const dep = Date.parse(t.departure);
  const eight = +at(dayKey(dep), CHECKOUT_TIME);
  return { karbala_in: t.arrival, karbala_out: new Date(Math.max(dep, eight)).toISOString() };
}

export interface ImportPlan {
  inserts: Partial<Tour>[];
  updates: { tour_id: string; patch: Partial<Tour>; changes: string[] }[];
  unchanged: number;
}

const fmtD = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Baghdad" }) : "none");

export function planImport(rows: ErpTour[], existing: Map<string, Tour>, plannedTourIds: Set<string>): ImportPlan {
  const plan: ImportPlan = { inserts: [], updates: [], unchanged: 0 };
  for (const r of rows) {
    const old = existing.get(r.tour_id);
    if (!old) {
      plan.inserts.push({ ...r, ...defaultWindow(r), status: r.pax_required > 0 ? "open" : "not_needed" });
      continue;
    }
    const changes: string[] = [];
    if (old.arrival !== r.arrival && Date.parse(old.arrival ?? "") !== Date.parse(r.arrival ?? "")) changes.push(`arrival ${fmtD(old.arrival)} → ${fmtD(r.arrival)}`);
    if (old.departure !== r.departure && Date.parse(old.departure ?? "") !== Date.parse(r.departure ?? "")) changes.push(`departure ${fmtD(old.departure)} → ${fmtD(r.departure)}`);
    if (old.pax_required !== r.pax_required) changes.push(`pax needing rooms ${old.pax_required} → ${r.pax_required}`);
    const infoChanged =
      old.office !== r.office || old.to_name !== r.to_name || old.pax !== r.pax || old.pax_not_required !== r.pax_not_required ||
      old.arrival_flight !== r.arrival_flight || old.departure_flight !== r.departure_flight || old.approved_option !== r.approved_option;
    if (!changes.length && !infoChanged) {
      plan.unchanged++;
      continue;
    }
    const patch: Partial<Tour> = { ...r };
    // Move the Karbala window along with the ERP dates unless someone set it by hand.
    const oldDefault = defaultWindow(old);
    if (old.karbala_in === oldDefault.karbala_in && old.karbala_out === oldDefault.karbala_out) Object.assign(patch, defaultWindow(r));
    if (changes.length && plannedTourIds.has(r.tour_id)) patch.erp_changed = changes.join("; ");
    if (old.status === "not_needed" && r.pax_required > 0) patch.status = "open";
    if (old.status === "open" && r.pax_required === 0 && !plannedTourIds.has(r.tour_id)) patch.status = "not_needed";
    plan.updates.push({ tour_id: r.tour_id, patch, changes });
  }
  return plan;
}

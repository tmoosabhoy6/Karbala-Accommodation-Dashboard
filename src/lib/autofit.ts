import type { Room } from "./types";

export interface Candidate {
  room: Room;
  /** Places this group may take in the room (beds, or free places in a sharing room). */
  places: number;
  /** Places including extra mattresses. */
  max: number;
}

export interface FitRoom {
  room: Room;
  pax: number;
}

export interface Fit {
  rooms: FitRoom[];
  beds: number;
  spare: number;
  usesMattresses: boolean;
  scope: string;
}

/**
 * Fewest rooms, least wasted beds, kept together.
 * Tries one floor first, then one building, then everything; uses extra mattresses only
 * when beds alone cannot hold the group.
 */
export function autofit(cands: Candidate[], pax: number, preferBuilding?: string | null): Fit | null {
  if (pax <= 0 || !cands.length) return null;
  const groups: { scope: string; rank: number; list: Candidate[] }[] = [];
  const byFloor = new Map<string, Candidate[]>();
  const byBuilding = new Map<string, Candidate[]>();
  for (const c of cands) {
    const f = `${c.room.building_id}|${c.room.floor}`;
    byFloor.set(f, [...(byFloor.get(f) ?? []), c]);
    byBuilding.set(c.room.building_id, [...(byBuilding.get(c.room.building_id) ?? []), c]);
  }
  const pref = (b: string) => (preferBuilding && b !== preferBuilding ? 10 : 0);
  for (const [k, list] of byFloor) groups.push({ scope: k, rank: 0 + pref(k.split("|")[0]), list });
  for (const [k, list] of byBuilding) groups.push({ scope: `${k}|*`, rank: 1 + pref(k), list });
  groups.push({ scope: "*", rank: 2 + (preferBuilding ? 10 : 0), list: cands });

  let best: { fit: Fit; score: number } | null = null;
  for (const useMax of [false, true]) {
    for (const g of groups) {
      const pick = solve(g.list, pax, useMax);
      if (!pick) continue;
      const beds = pick.reduce((n, c) => n + (useMax ? c.max : c.places), 0);
      const spare = beds - pax;
      const score = g.rank * 1000 + pick.length * 40 + spare * 6 + (useMax ? 5000 : 0) + spreadPenalty(pick);
      if (!best || score < best.score) {
        best = { fit: { rooms: distribute(pick, pax, useMax), beds, spare, usesMattresses: useMax, scope: g.scope }, score };
      }
    }
    if (best) break;
  }
  return best?.fit ?? null;
}

function spreadPenalty(pick: Candidate[]) {
  if (pick.length < 2) return 0;
  const nums = pick.map((c) => c.room.sort).sort((a, b) => a - b);
  return Math.min(60, Math.round((nums[nums.length - 1] - nums[0]) / 10));
}

// Small knapsack: fewest rooms reaching at least `pax`, then least spare.
function solve(list: Candidate[], pax: number, useMax: boolean): Candidate[] | null {
  const items = list.filter((c) => (useMax ? c.max : c.places) > 0).sort((a, b) => a.room.sort - b.room.sort);
  const total = items.reduce((n, c) => n + (useMax ? c.max : c.places), 0);
  if (total < pax) return null;
  const limit = pax + Math.max(...items.map((c) => (useMax ? c.max : c.places)));
  // dp[s] = indices of the smallest set summing to exactly s
  const dp: (number[] | null)[] = Array(limit + 1).fill(null);
  dp[0] = [];
  items.forEach((c, i) => {
    const w = useMax ? c.max : c.places;
    for (let s = limit; s >= w; s--) {
      const prev = dp[s - w];
      if (prev && (!dp[s] || dp[s]!.length > prev.length + 1)) dp[s] = [...prev, i];
    }
  });
  let bestSet: number[] | null = null;
  let bestScore = Infinity;
  for (let s = pax; s <= limit; s++) {
    const set = dp[s];
    if (!set) continue;
    const score = set.length * 40 + (s - pax) * 6;
    if (score < bestScore) {
      bestScore = score;
      bestSet = set;
    }
  }
  return bestSet ? bestSet.map((i) => items[i]) : null;
}

/** Spread the group across the chosen rooms, fullest-first. */
export function distribute(pick: Candidate[], pax: number, useMax = false): FitRoom[] {
  let left = pax;
  const sorted = [...pick].sort((a, b) => (useMax ? b.max - a.max : b.places - a.places));
  return sorted.map((c) => {
    const take = Math.min(left, useMax ? c.max : c.places);
    left -= take;
    return { room: c.room, pax: take };
  });
}

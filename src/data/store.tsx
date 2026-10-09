import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { toast } from "sonner";
import type { Api } from "./api";
import { supabaseApi } from "./supabase";
import type { Building, Room, Snapshot, Tour } from "@/lib/types";
import { indexStays, type StaysByRoom } from "@/lib/status";

const ApiContext = createContext<Api | null>(null);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 1000 * 60 * 60 * 24 * 7, staleTime: 15_000, refetchOnWindowFocus: true, retry: 2 },
  },
});

// The last good copy of the data lives in this browser too, so the dashboard opens
// instantly (and still shows the rooms) even before the network answers.
const persister = createSyncStoragePersister({ storage: typeof window !== "undefined" ? window.localStorage : undefined, key: "krb-cache-v1" });

async function makeApi(): Promise<Api> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key) return supabaseApi(url, key);
  const { demoApi } = await import("./demo");
  return demoApi();
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null);
  useEffect(() => {
    makeApi().then(setApi);
  }, []);
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: "1" }}>
      <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
      {api && <LiveSync api={api} />}
    </PersistQueryClientProvider>
  );
}

function LiveSync({ api }: { api: Api }) {
  const qc = useQueryClient();
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () =>
      api.subscribe(() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => qc.invalidateQueries({ queryKey: ["snapshot"] }), 250);
      }),
    [api, qc],
  );
  return null;
}

export function useApi(): Api | null {
  return useContext(ApiContext);
}

export function useSnapshot() {
  const api = useApi();
  return useQuery({
    queryKey: ["snapshot"],
    enabled: !!api,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Snapshot> => ({ ...(await api!.load()), loadedAt: Date.now() }),
  });
}

export interface Data {
  snap: Snapshot;
  buildings: Building[];
  rooms: Room[];
  byRoom: StaysByRoom;
  room: Map<string, Room>;
  building: Map<string, Building>;
  tour: Map<string, Tour>;
}

const EMPTY: Snapshot = { buildings: [], rooms: [], stays: [], tours: [], activity: [], loadedAt: 0 };

export function useData(): Data {
  const { data } = useSnapshot();
  const snap = data ?? EMPTY;
  return useMemo(() => {
    const rooms = snap.rooms.filter((r) => r.active).sort((a, b) => a.building_id.localeCompare(b.building_id) || a.floor_sort - b.floor_sort || a.sort - b.sort);
    return {
      snap,
      buildings: [...snap.buildings].sort((a, b) => a.sort - b.sort),
      rooms,
      byRoom: indexStays(snap.stays),
      room: new Map(snap.rooms.map((r) => [r.id, r])),
      building: new Map(snap.buildings.map((b) => [b.id, b])),
      tour: new Map(snap.tours.map((t) => [t.tour_id, t])),
    };
  }, [snap]);
}

/** Run a change against the database with a toast, then refresh everything. */
export function useMutate() {
  const api = useApi();
  const qc = useQueryClient();
  return useCallback(
    async (fn: (api: Api) => Promise<unknown>, done?: string): Promise<boolean> => {
      if (!api) return false;
      try {
        await fn(api);
        await qc.invalidateQueries({ queryKey: ["snapshot"] });
        if (done) toast.success(done);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
        return false;
      }
    },
    [api, qc],
  );
}

let nowValue = Date.now();
const nowListeners = new Set<() => void>();
setInterval(() => {
  nowValue = Date.now();
  nowListeners.forEach((l) => l());
}, 20_000);

/** Current time, refreshed every 20 seconds so colours change on their own at 08:00. */
export function useNow(): number {
  const [n, setN] = useState(nowValue);
  useEffect(() => {
    const l = () => setN(nowValue);
    nowListeners.add(l);
    return () => {
      nowListeners.delete(l);
    };
  }, []);
  return n;
}

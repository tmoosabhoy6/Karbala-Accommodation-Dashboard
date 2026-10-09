import { Toaster } from "sonner";
import { useSnapshot } from "@/data/store";
import { useUi } from "@/state/ui";
import { Shell } from "@/components/Shell";
import { RoomDrawer } from "@/components/RoomDrawer";
import { Dialogs } from "@/components/Dialogs";
import { CommandMenu } from "@/components/CommandMenu";
import { Overview } from "@/views/Overview";
import { Floors } from "@/views/Floors";
import { Rooms } from "@/views/Rooms";
import { Timeline } from "@/views/Timeline";
import { Allocate } from "@/views/Allocate";
import { Planner } from "@/views/Planner";
import { Tours } from "@/views/Tours";
import { Activity } from "@/views/Activity";

const VIEWS = { overview: Overview, floors: Floors, rooms: Rooms, timeline: Timeline, allocate: Allocate, planner: Planner, tours: Tours, activity: Activity };

export function App() {
  const view = useUi((s) => s.view);
  const { data, isError, error, refetch } = useSnapshot();
  const View = VIEWS[view];
  return (
    <>
      <Shell>
        {!data ? (
          isError ? (
            <div className="mx-auto max-w-md py-24 text-center">
              <div className="text-[16px] font-semibold">Can't reach the database</div>
              <p className="mt-1 text-[13px] text-ink-3">{error instanceof Error ? error.message : "Check the connection."}</p>
              <button onClick={() => refetch()} className="press mt-4 h-9 rounded-sm bg-ink-1 px-4 text-[13.5px] font-medium text-canvas">
                Try again
              </button>
            </div>
          ) : (
            <Loading />
          )
        ) : (
          <div key={view} className="animate-[fade_200ms_ease-out]">
            <View />
          </div>
        )}
      </Shell>
      <RoomDrawer />
      <Dialogs />
      <CommandMenu />
      <Toaster position="bottom-center" offset={88} toastOptions={{ className: "!rounded-md !bg-raised !text-ink-1 !shadow-lift-high !border-0 !text-[13.5px]" }} />
    </>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-[1360px] space-y-6" aria-busy>
      <div className="h-24 w-1/3 animate-pulse rounded-md bg-well" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-md bg-well" />
        <div className="h-64 animate-pulse rounded-md bg-well" />
      </div>
    </div>
  );
}

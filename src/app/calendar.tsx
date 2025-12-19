import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import type { StoredEvent, Project, AggregatedGitEvent, AggregatedBrowserEvent, AggregatedRepositoryEvent } from "../types/event";
import {
  CalendarViewProvider,
  CalendarDateLabel,
  CalendarControls,
  CalendarGrid,
  type CalendarViewType,
} from "../components/calendar-view";
import { useEventDialog } from "../contexts/rule-dialog-context";

interface CalendarProps {
  showWeekends: boolean;
  onShowWeekendsChange: (show: boolean) => void;
}

export function Calendar({
  showWeekends,
  onShowWeekendsChange,
}: CalendarProps) {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarViewType, setCalendarViewType] =
    useState<CalendarViewType>("week");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const { openEventDialog } = useEventDialog();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [eventsData, projectsData] = await Promise.all([
        invoke<StoredEvent[]>("get_stored_events", {
          startDate: null,
          endDate: null,
        }),
        invoke<Project[]>("get_all_projects"),
      ]);

      setEvents(eventsData);
      setProjects(projectsData);
    } catch (err) {
      setError(err as string);
      console.error("Error fetching calendar data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Create a map of project_id to project for quick lookup
  // Memoize to prevent re-creating on every render
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const handleEventAssign = (event: StoredEvent | AggregatedGitEvent | AggregatedBrowserEvent | AggregatedRepositoryEvent) => {
    openEventDialog(event, fetchData);
  };

  if (loading) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold text-destructive">Error</h1>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold mb-4">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          No events found. Sync your calendar to get started.
        </p>
      </div>
    );
  }

  return (
    <CalendarViewProvider
      events={events}
      viewType={calendarViewType}
      onViewTypeChange={setCalendarViewType}
      currentDate={calendarDate}
      onDateChange={setCalendarDate}
      projectMap={projectMap}
      showWeekends={showWeekends}
      onEventAssign={handleEventAssign}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="text-2xl">
            <CalendarDateLabel />
          </div>
          <div className="flex items-center gap-2">
            <CalendarControls />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onShowWeekendsChange(!showWeekends)}
                >
                  {showWeekends ? "Hide Weekends" : "Show Weekends"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <CalendarGrid />
        </div>
      </div>
    </CalendarViewProvider>
  );
}

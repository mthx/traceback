import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useSyncComplete } from "@/hooks/sync-hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import type {
  StoredEvent,
  Project,
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
} from "../types/event";
import {
  CalendarViewProvider,
  CalendarDateLabel,
  CalendarControls,
  CalendarGrid,
  type CalendarViewType,
} from "../components/calendar-view";
import { useEventDialog } from "../contexts/rule-dialog-context";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";

function getVisibleDateRange(
  date: Date,
  viewType: CalendarViewType
): { start: Date; end: Date } {
  if (viewType === "day") {
    return {
      start: startOfDay(date),
      end: endOfDay(date),
    };
  } else if (viewType === "week") {
    return {
      start: startOfWeek(date, { weekStartsOn: 1 }), // Monday
      end: endOfWeek(date, { weekStartsOn: 1 }),
    };
  } else {
    // month view - include padding days to complete calendar grid
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);

    return {
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
    };
  }
}

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
  const [calendarViewType, setCalendarViewType] =
    useState<CalendarViewType>("week");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const { openEventDialog } = useEventDialog();

  const fetchData = useCallback(async () => {
    try {
      const { start, end } = getVisibleDateRange(
        calendarDate,
        calendarViewType
      );

      const [eventsData, projectsData] = await Promise.all([
        invoke<StoredEvent[]>("get_stored_events", {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        }),
        invoke<Project[]>("get_all_projects"),
      ]);

      setEvents(eventsData);
      setProjects(projectsData);
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    }
  }, [calendarDate, calendarViewType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useSyncComplete(fetchData);

  // Create a map of project_id to project for quick lookup
  // Memoize to prevent re-creating on every render
  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const handleEventAssign = (
    event:
      | StoredEvent
      | AggregatedGitEvent
      | AggregatedBrowserEvent
      | AggregatedRepositoryEvent
  ) => {
    openEventDialog(event, fetchData);
  };

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

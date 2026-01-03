import {
  useState,
  useRef,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type {
  StoredEvent,
  Project,
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
} from "@/types/event";
import {
  aggregateGitEvents,
  aggregateBrowserEvents,
  aggregateRepositoryEvents,
} from "@/types/event";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { EventBlock } from "@/components/event-block";
import { MonthEventBlock } from "@/components/month-event-block";
import { CalendarEventTooltipContent } from "@/components/event-tooltip-content";
import {
  isToday,
  todayIndicatorClass,
  formatMonthYear,
  formatMonthDay,
  formatMonthDayShort,
  formatWeekday,
  formatMonth,
  formatDateFull,
} from "@/components/calendar-utils";
import { useScrollToHour } from "@/hooks/use-calendar-scroll";

export type CalendarViewType = "day" | "week" | "month";

// Cache for GitHub orgs to avoid repeated fetches
let githubOrgsCache: string[] | null = null;

async function getGitHubOrgs(): Promise<string[]> {
  if (githubOrgsCache !== null) {
    return githubOrgsCache;
  }

  try {
    const orgs = await invoke<string[]>("get_github_orgs");
    githubOrgsCache = orgs;
    return githubOrgsCache;
  } catch (error) {
    console.error("Failed to fetch GitHub orgs:", error);
    return [];
  }
}

// Reset cache when orgs are modified
export function resetGitHubOrgsCache() {
  githubOrgsCache = null;
}

interface CalendarViewContextValue {
  viewType: CalendarViewType;
  setViewType: (viewType: CalendarViewType) => void;
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  events: StoredEvent[];
  projectMap?: Map<number, Project>;
  showWeekends: boolean;
  onEventAssign?: (
    event:
      | StoredEvent
      | AggregatedGitEvent
      | AggregatedBrowserEvent
      | AggregatedRepositoryEvent
  ) => void;
  onAssignmentComplete?: () => void;
  githubOrgs: string[];
}

const CalendarViewContext = createContext<CalendarViewContextValue | null>(
  null
);

function useCalendarViewContext() {
  const context = useContext(CalendarViewContext);
  if (!context) {
    throw new Error(
      "Calendar components must be used within CalendarViewProvider"
    );
  }
  return context;
}

interface CalendarViewProviderProps {
  children: ReactNode;
  events: StoredEvent[];
  viewType?: CalendarViewType;
  onViewTypeChange?: (viewType: CalendarViewType) => void;
  currentDate?: Date;
  onDateChange?: (date: Date) => void;
  projectMap?: Map<number, Project>;
  showWeekends?: boolean;
  onEventAssign?: (
    event:
      | StoredEvent
      | AggregatedGitEvent
      | AggregatedBrowserEvent
      | AggregatedRepositoryEvent
  ) => void;
  onAssignmentComplete?: () => void;
}

interface EventBlock {
  event: StoredEvent;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
  isGitAggregate?: boolean;
  gitAggregate?: AggregatedGitEvent;
  isBrowserAggregate?: boolean;
  browserAggregate?: AggregatedBrowserEvent;
  isRepositoryAggregate?: boolean;
  repositoryAggregate?: AggregatedRepositoryEvent;
}

export function getViewTypeLabel(viewType: CalendarViewType): string {
  switch (viewType) {
    case "day":
      return "Day";
    case "week":
      return "Week";
    case "month":
      return "Month";
  }
}

export function getDateRangeLabel(
  viewType: CalendarViewType,
  currentDate: Date
): string {
  switch (viewType) {
    case "day":
      return formatDateFull(currentDate);
    case "week":
      return formatMonthYear(currentDate);
    case "month":
      return formatMonthYear(currentDate);
  }
}

export function CalendarViewProvider({
  children,
  events,
  viewType: controlledViewType,
  onViewTypeChange,
  currentDate: controlledDate,
  onDateChange,
  projectMap,
  showWeekends: controlledShowWeekends = false,
  onEventAssign,
  onAssignmentComplete,
}: CalendarViewProviderProps) {
  const [internalViewType, setInternalViewType] =
    useState<CalendarViewType>("week");
  const [internalDate, setInternalDate] = useState(new Date());
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);

  const viewType = controlledViewType ?? internalViewType;
  const currentDate = controlledDate ?? internalDate;
  const showWeekends = controlledShowWeekends;

  const setViewType = (newViewType: CalendarViewType) => {
    if (onViewTypeChange) {
      onViewTypeChange(newViewType);
    } else {
      setInternalViewType(newViewType);
    }
  };

  const setCurrentDate = (newDate: Date) => {
    if (onDateChange) {
      onDateChange(newDate);
    } else {
      setInternalDate(newDate);
    }
  };

  // Fetch GitHub orgs on mount
  useEffect(() => {
    getGitHubOrgs().then(setGithubOrgs);
  }, []);

  const value: CalendarViewContextValue = {
    viewType,
    setViewType,
    currentDate,
    setCurrentDate,
    events,
    projectMap,
    showWeekends,
    onEventAssign,
    onAssignmentComplete,
    githubOrgs,
  };

  return (
    <CalendarViewContext.Provider value={value}>
      {children}
    </CalendarViewContext.Provider>
  );
}

function getWeekDays(date: Date, showWeekends: boolean = true): Date[] {
  const start = new Date(date);
  const dayOfWeek = start.getDay();
  // Adjust to Monday (1) instead of Sunday (0)
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysFromMonday);
  start.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  const numDays = showWeekends ? 7 : 5; // 7 for full week, 5 for weekdays only
  for (let i = 0; i < numDays; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
}

function getMonthDays(date: Date, showWeekends: boolean = true): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDay = new Date(firstDay);
  // Adjust to start on Monday instead of Sunday
  const firstDayOfWeek = firstDay.getDay();
  const daysFromMonday = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  startDay.setDate(firstDay.getDate() - daysFromMonday);

  const endDay = new Date(lastDay);
  const lastDayOfWeek = lastDay.getDay();
  const daysToSaturday = lastDayOfWeek === 0 ? 0 : 6 - (lastDayOfWeek - 1);
  endDay.setDate(lastDay.getDate() + daysToSaturday);

  const days: Date[] = [];
  const current = new Date(startDay);
  while (current <= endDay) {
    const dayOfWeek = current.getDay();
    // If not showing weekends, skip Saturday (6) and Sunday (0)
    if (showWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

// Helper to check if a calendar event is all-day
function isAllDayEvent(event: StoredEvent): boolean {
  if (event.event_type !== "calendar") return false;
  try {
    const data = JSON.parse(event.type_specific_data || "{}");
    return data.is_all_day === true;
  } catch {
    return false;
  }
}

function getEventsForDay(
  events: StoredEvent[],
  date: Date,
  githubOrgs: string[] = []
): {
  allDayEvents: StoredEvent[];
  calendarEvents: StoredEvent[];
  gitAggregates: AggregatedGitEvent[];
  browserAggregates: AggregatedBrowserEvent[];
  repositoryAggregates: AggregatedRepositoryEvent[];
} {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Separate calendar events into all-day and timed events
  const allCalendarEvents = events.filter((event) => {
    if (event.event_type !== "calendar") return false;

    const eventStart = new Date(event.start_date);
    const eventEnd = new Date(event.end_date);
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  const allDayEvents = allCalendarEvents.filter(isAllDayEvent);
  const calendarEvents = allCalendarEvents.filter(
    (event) => !isAllDayEvent(event)
  );

  // Aggregate repository events (unified git + browser)
  const allRepositoryAggregates = aggregateRepositoryEvents(events);
  const repositoryAggregates = allRepositoryAggregates.filter((aggregate) => {
    const eventStart = new Date(aggregate.start_date);
    const eventEnd = new Date(aggregate.end_date);
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  // Get repository paths that are covered by repository aggregates
  const coveredRepoPaths = new Set(
    repositoryAggregates.map((agg) => agg.repository_path)
  );

  // Aggregate git events (but filter out ones covered by repository aggregates)
  const allGitAggregates = aggregateGitEvents(events);
  const gitAggregates = allGitAggregates.filter((aggregate) => {
    const eventStart = new Date(aggregate.start_date);
    const eventEnd = new Date(aggregate.end_date);
    const inDay = eventStart < dayEnd && eventEnd > dayStart;

    // Check if any activity has repository_path that's covered
    const hasCoveredRepoPath = aggregate.activities.some((activity) => {
      const data = JSON.parse(activity.type_specific_data || "{}");
      return data.repository_path && coveredRepoPaths.has(data.repository_path);
    });

    return inDay && !hasCoveredRepoPath;
  });

  // Aggregate browser events (but filter out ones covered by repository aggregates)
  const allBrowserAggregates = aggregateBrowserEvents(events, githubOrgs);
  const browserAggregates = allBrowserAggregates.filter((aggregate) => {
    const eventStart = new Date(aggregate.start_date);
    const eventEnd = new Date(aggregate.end_date);
    const inDay = eventStart < dayEnd && eventEnd > dayStart;

    // Check if any visit has repository_path that's covered
    const hasCoveredRepoPath = aggregate.visits.some((visit) => {
      const data = JSON.parse(visit.type_specific_data || "{}");
      return data.repository_path && coveredRepoPaths.has(data.repository_path);
    });

    return inDay && !hasCoveredRepoPath;
  });

  return {
    allDayEvents,
    calendarEvents,
    gitAggregates,
    browserAggregates,
    repositoryAggregates,
  };
}

type DisplayItem =
  | { type: "calendar"; event: StoredEvent }
  | { type: "git"; aggregate: AggregatedGitEvent }
  | { type: "browser"; aggregate: AggregatedBrowserEvent }
  | { type: "repository"; aggregate: AggregatedRepositoryEvent };

function calculateEventPositions(
  calendarEvents: StoredEvent[],
  gitAggregates: AggregatedGitEvent[],
  browserAggregates: AggregatedBrowserEvent[],
  repositoryAggregates: AggregatedRepositoryEvent[]
): EventBlock[] {
  const HOUR_HEIGHT = 60;

  // Combine calendar events and git/browser/repository aggregates into display items
  const displayItems: DisplayItem[] = [
    ...calendarEvents.map((event) => ({ type: "calendar" as const, event })),
    ...repositoryAggregates.map((aggregate) => ({
      type: "repository" as const,
      aggregate,
    })),
    ...gitAggregates.map((aggregate) => ({ type: "git" as const, aggregate })),
    ...browserAggregates.map((aggregate) => ({
      type: "browser" as const,
      aggregate,
    })),
  ];

  // Sort by start time
  const sortedItems = displayItems.sort((a, b) => {
    const aStart =
      a.type === "calendar"
        ? new Date(a.event.start_date).getTime()
        : new Date(a.aggregate.start_date).getTime();
    const bStart =
      b.type === "calendar"
        ? new Date(b.event.start_date).getTime()
        : new Date(b.aggregate.start_date).getTime();
    return aStart - bStart;
  });

  const columns: DisplayItem[][] = [];

  sortedItems.forEach((item) => {
    const itemStart =
      item.type === "calendar"
        ? new Date(item.event.start_date)
        : new Date(item.aggregate.start_date);

    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastItem = columns[col][columns[col].length - 1];
      const lastEnd =
        lastItem.type === "calendar"
          ? new Date(lastItem.event.end_date)
          : new Date(lastItem.aggregate.end_date);

      if (lastEnd <= itemStart) {
        columns[col].push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([item]);
    }
  });

  const blocks: EventBlock[] = [];
  columns.forEach((col, colIndex) => {
    col.forEach((item) => {
      if (item.type === "calendar") {
        const eventStart = new Date(item.event.start_date);
        const eventEnd = new Date(item.event.end_date);

        const startHour = eventStart.getHours() + eventStart.getMinutes() / 60;
        const endHour = eventEnd.getHours() + eventEnd.getMinutes() / 60;
        const duration = endHour - startHour;

        blocks.push({
          event: item.event,
          top: startHour * HOUR_HEIGHT,
          height: Math.max(duration * HOUR_HEIGHT, 30),
          column: colIndex,
          totalColumns: columns.length,
          isGitAggregate: false,
        });
      } else if (item.type === "git") {
        // Git aggregate
        const eventStart = new Date(item.aggregate.start_date);
        const eventEnd = new Date(item.aggregate.end_date);

        const startHour = eventStart.getHours() + eventStart.getMinutes() / 60;
        const endHour = eventEnd.getHours() + eventEnd.getMinutes() / 60;
        const duration = endHour - startHour;

        // Create a synthetic StoredEvent for rendering
        const syntheticEvent: StoredEvent = {
          id: -1, // Use negative ID to indicate synthetic
          event_type: "git",
          title:
            item.aggregate.repository_name.split("/").pop() ||
            item.aggregate.repository_name,
          start_date: item.aggregate.start_date,
          end_date: item.aggregate.end_date,
          project_id: item.aggregate.project_id,
          created_at: "",
          updated_at: "",
        };

        blocks.push({
          event: syntheticEvent,
          top: startHour * HOUR_HEIGHT,
          height: Math.max(duration * HOUR_HEIGHT, 30),
          column: colIndex,
          totalColumns: columns.length,
          isGitAggregate: true,
          gitAggregate: item.aggregate,
        });
      } else if (item.type === "browser") {
        // Browser aggregate
        const eventStart = new Date(item.aggregate.start_date);
        const eventEnd = new Date(item.aggregate.end_date);

        const startHour = eventStart.getHours() + eventStart.getMinutes() / 60;
        const endHour = eventEnd.getHours() + eventEnd.getMinutes() / 60;
        const duration = endHour - startHour;

        // Create a synthetic StoredEvent for rendering
        const syntheticEvent: StoredEvent = {
          id: -2, // Use -2 to indicate browser synthetic
          event_type: "browser_history",
          title: item.aggregate.title,
          start_date: item.aggregate.start_date,
          end_date: item.aggregate.end_date,
          project_id: item.aggregate.project_id,
          created_at: "",
          updated_at: "",
        };

        blocks.push({
          event: syntheticEvent,
          top: startHour * HOUR_HEIGHT,
          height: Math.max(duration * HOUR_HEIGHT, 30),
          column: colIndex,
          totalColumns: columns.length,
          isBrowserAggregate: true,
          browserAggregate: item.aggregate,
        });
      } else {
        // Repository aggregate
        const eventStart = new Date(item.aggregate.start_date);
        const eventEnd = new Date(item.aggregate.end_date);

        const startHour = eventStart.getHours() + eventStart.getMinutes() / 60;
        const endHour = eventEnd.getHours() + eventEnd.getMinutes() / 60;
        const duration = endHour - startHour;

        // Create a synthetic StoredEvent for rendering
        const syntheticEvent: StoredEvent = {
          id: -3, // Use -3 to indicate repository synthetic
          event_type: "git", // Primary type is git since it's repo-focused
          title: item.aggregate.repository_name,
          start_date: item.aggregate.start_date,
          end_date: item.aggregate.end_date,
          project_id: item.aggregate.project_id,
          created_at: "",
          updated_at: "",
        };

        blocks.push({
          event: syntheticEvent,
          top: startHour * HOUR_HEIGHT,
          height: Math.max(duration * HOUR_HEIGHT, 30),
          column: colIndex,
          totalColumns: columns.length,
          isRepositoryAggregate: true,
          repositoryAggregate: item.aggregate,
        });
      }
    });
  });

  return blocks;
}

export function CalendarDateLabel() {
  const { viewType, currentDate } = useCalendarViewContext();

  let content;
  switch (viewType) {
    case "day":
      content = (
        <div className="flex flex-col">
          <div>
            <span className="font-semibold">{formatMonthDay(currentDate)}</span>
            <span className="font-normal">, {currentDate.getFullYear()}</span>
          </div>
          <div className="text-sm font-normal text-muted-foreground">
            {formatWeekday(currentDate)}
          </div>
        </div>
      );
      break;
    case "week":
    case "month":
      content = (
        <div>
          <span className="font-semibold">{formatMonth(currentDate)}</span>
          <span className="font-normal text-muted-foreground">
            {" "}
            {currentDate.getFullYear()}
          </span>
        </div>
      );
      break;
  }

  return <div>{content}</div>;
}

export function CalendarControls() {
  const { viewType, setViewType, currentDate, setCurrentDate } =
    useCalendarViewContext();

  const handlePrevious = () => {
    const newDate = new Date(currentDate);
    switch (viewType) {
      case "day":
        newDate.setDate(newDate.getDate() - 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() - 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() - 1);
        break;
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    switch (viewType) {
      case "day":
        newDate.setDate(newDate.getDate() + 1);
        break;
      case "week":
        newDate.setDate(newDate.getDate() + 7);
        break;
      case "month":
        newDate.setMonth(newDate.getMonth() + 1);
        break;
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={handlePrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={handleToday}>
        Today
      </Button>
      <Button variant="ghost" size="icon" onClick={handleNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Calendar className="h-4 w-4" />
            {getViewTypeLabel(viewType)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setViewType("day")}>
            Day
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setViewType("week")}>
            Week
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setViewType("month")}>
            Month
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CalendarGrid() {
  const { viewType, currentDate, events, projectMap, showWeekends } =
    useCalendarViewContext();

  return (
    <div className="h-full overflow-hidden">
      {viewType === "day" && (
        <DayView events={events} date={currentDate} projectMap={projectMap} />
      )}
      {viewType === "week" && (
        <WeekView
          events={events}
          date={currentDate}
          projectMap={projectMap}
          showWeekends={showWeekends}
        />
      )}
      {viewType === "month" && (
        <MonthView
          events={events}
          date={currentDate}
          projectMap={projectMap}
          showWeekends={showWeekends}
        />
      )}
    </div>
  );
}

// All-day events row component
function AllDayEventsRow({
  events,
  projectMap,
  onEventClick,
}: {
  events: StoredEvent[];
  projectMap?: Map<number, Project>;
  onEventClick: (event: StoredEvent) => void;
}) {
  if (events.length === 0) {
    return <div className="px-2 py-1 min-h-8"></div>;
  }

  return (
    <div className="px-2 py-1 min-h-8">
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {events.map((event) => {
          const project =
            event.project_id && projectMap
              ? projectMap.get(event.project_id)
              : null;
          const eventColor = project?.color || "#94a3b8";

          return (
            <Tooltip key={event.id}>
              <TooltipTrigger asChild>
                <button
                  className="px-2 py-0.5 rounded text-xs font-medium text-left hover:opacity-80 transition-opacity w-full truncate min-w-0"
                  style={{
                    backgroundColor: eventColor,
                    color: "#ffffff",
                  }}
                  onClick={() => onEventClick(event)}
                >
                  {event.title}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <CalendarEventTooltipContent
                  event={event}
                  onAssignmentComplete={() => {}}
                />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  events,
  date,
  projectMap,
}: {
  events: StoredEvent[];
  date: Date;
  projectMap?: Map<number, Project>;
}) {
  const { onEventAssign, onAssignmentComplete, githubOrgs } =
    useCalendarViewContext();
  const {
    allDayEvents,
    calendarEvents,
    gitAggregates,
    browserAggregates,
    repositoryAggregates,
  } = getEventsForDay(events, date, githubOrgs);
  const eventBlocks = calculateEventPositions(
    calendarEvents,
    gitAggregates,
    browserAggregates,
    repositoryAggregates
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  useScrollToHour(scrollRef, 8);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <TooltipProvider>
        <AllDayEventsRow
          events={allDayEvents}
          projectMap={projectMap}
          onEventClick={(event) => {
            if (onEventAssign) {
              onEventAssign(event);
            }
          }}
        />
      </TooltipProvider>

      <div ref={scrollRef} className="flex-1 overflow-auto select-none">
        <div className="relative">
          {hours.map((hour) => (
            <div
              key={hour}
              className="h-15 border-b border-neutral-200 dark:border-neutral-800 flex items-start px-2 text-xs text-muted-foreground"
            >
              {hour.toString().padStart(2, "0") + ":00"}{" "}
            </div>
          ))}

          <div className="absolute inset-0 left-16">
            <TooltipProvider>
              {eventBlocks.map((block, idx) => {
                const width = `${100 / block.totalColumns}%`;
                const left = `${(block.column * 100) / block.totalColumns}%`;

                return (
                  <EventBlock
                    key={idx}
                    event={
                      block.isGitAggregate ||
                      block.isBrowserAggregate ||
                      block.isRepositoryAggregate
                        ? undefined
                        : block.event
                    }
                    gitAggregate={
                      block.isGitAggregate ? block.gitAggregate : undefined
                    }
                    browserAggregate={
                      block.isBrowserAggregate
                        ? block.browserAggregate
                        : undefined
                    }
                    repositoryAggregate={
                      block.isRepositoryAggregate
                        ? block.repositoryAggregate
                        : undefined
                    }
                    projectMap={projectMap}
                    position={{
                      top: block.top,
                      height: block.height,
                      left,
                      width,
                    }}
                    onClick={() => {
                      if (onEventAssign) {
                        if (block.isGitAggregate && block.gitAggregate) {
                          onEventAssign(block.gitAggregate);
                        } else if (
                          block.isBrowserAggregate &&
                          block.browserAggregate
                        ) {
                          onEventAssign(block.browserAggregate);
                        } else if (
                          block.isRepositoryAggregate &&
                          block.repositoryAggregate
                        ) {
                          onEventAssign(block.repositoryAggregate);
                        } else {
                          onEventAssign(block.event);
                        }
                      }
                    }}
                    onAssignmentComplete={onAssignmentComplete}
                  />
                );
              })}
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekView({
  events,
  date,
  projectMap,
  showWeekends,
}: {
  events: StoredEvent[];
  date: Date;
  projectMap?: Map<number, Project>;
  showWeekends: boolean;
}) {
  const { onEventAssign, onAssignmentComplete, githubOrgs } =
    useCalendarViewContext();
  const weekDays = getWeekDays(date, showWeekends);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const scrollRef = useRef<HTMLDivElement>(null);

  useScrollToHour(scrollRef, 8);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-auto select-none">
        {/* Sticky header with day names and all-day events */}
        <div className="sticky top-0 bg-background z-10 border-b border-neutral-200 dark:border-neutral-800">
          {/* Day names row */}
          <div
            className="grid divide-x divide-neutral-200 dark:divide-neutral-800"
            style={{
              gridTemplateColumns: `64px repeat(${weekDays.length}, 1fr)`,
            }}
          >
            <div className="p-2 text-xs font-medium"></div>
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="p-2">
                <div className="flex text-gray-500 items-baseline justify-end gap-1.5">
                  <div
                    className={`text-base ${
                      isToday(day) ? todayIndicatorClass : ""
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div>{formatWeekday(day, true)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* All-day events row */}
          <div
            className="grid divide-x divide-neutral-200 dark:divide-neutral-800"
            style={{
              gridTemplateColumns: `64px repeat(${weekDays.length}, 1fr)`,
            }}
          >
            <div className="p-2 text-xs font-medium text-muted-foreground">
              All day
            </div>
            <TooltipProvider>
              {weekDays.map((day) => {
                const { allDayEvents } = getEventsForDay(
                  events,
                  day,
                  githubOrgs
                );
                return (
                  <div
                    key={`allday-${day.toISOString()}`}
                    className="overflow-hidden min-w-0"
                  >
                    <AllDayEventsRow
                      events={allDayEvents}
                      projectMap={projectMap}
                      onEventClick={(event) => {
                        if (onEventAssign) {
                          onEventAssign(event);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </TooltipProvider>
          </div>
        </div>
        <div
          className="grid divide-x divide-neutral-200 dark:divide-neutral-800"
          style={{
            gridTemplateColumns: `64px repeat(${weekDays.length}, 1fr)`,
          }}
        >
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-15 border-b border-neutral-200 dark:border-neutral-800 px-2 text-xs text-muted-foreground flex items-start"
              >
                {hour.toString().padStart(2, "0") + ":00"}{" "}
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const {
              calendarEvents,
              gitAggregates,
              browserAggregates,
              repositoryAggregates,
            } = getEventsForDay(events, day, githubOrgs);
            const eventBlocks = calculateEventPositions(
              calendarEvents,
              gitAggregates,
              browserAggregates,
              repositoryAggregates
            );

            return (
              <div key={day.toISOString()} className="relative">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-15 border-b border-neutral-200 dark:border-neutral-800 last:border-b-0"
                  ></div>
                ))}

                <TooltipProvider>
                  {eventBlocks.map((block, idx) => {
                    const width = `${100 / block.totalColumns}%`;
                    const left = `${(block.column * 100) / block.totalColumns}%`;

                    return (
                      <EventBlock
                        key={idx}
                        event={
                          block.isGitAggregate ||
                          block.isBrowserAggregate ||
                          block.isRepositoryAggregate
                            ? undefined
                            : block.event
                        }
                        gitAggregate={
                          block.isGitAggregate ? block.gitAggregate : undefined
                        }
                        browserAggregate={
                          block.isBrowserAggregate
                            ? block.browserAggregate
                            : undefined
                        }
                        repositoryAggregate={
                          block.isRepositoryAggregate
                            ? block.repositoryAggregate
                            : undefined
                        }
                        projectMap={projectMap}
                        position={{
                          top: block.top,
                          height: block.height,
                          left,
                          width,
                        }}
                        onClick={() => {
                          if (onEventAssign) {
                            if (block.isGitAggregate && block.gitAggregate) {
                              onEventAssign(block.gitAggregate);
                            } else if (
                              block.isBrowserAggregate &&
                              block.browserAggregate
                            ) {
                              onEventAssign(block.browserAggregate);
                            } else if (
                              block.isRepositoryAggregate &&
                              block.repositoryAggregate
                            ) {
                              onEventAssign(block.repositoryAggregate);
                            } else {
                              onEventAssign(block.event);
                            }
                          }
                        }}
                        onAssignmentComplete={onAssignmentComplete}
                      />
                    );
                  })}
                </TooltipProvider>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthView({
  events,

  date,

  projectMap,

  showWeekends,
}: {
  events: StoredEvent[];

  date: Date;

  projectMap?: Map<number, Project>;

  showWeekends: boolean;
}) {
  const {
    setViewType,
    setCurrentDate,
    onEventAssign,
    onAssignmentComplete,
    githubOrgs,
  } = useCalendarViewContext();

  const monthDays = getMonthDays(date, showWeekends);

  const dayLabels = showWeekends
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const numCols = showWeekends ? 7 : 5;

  const numRows = Math.ceil(monthDays.length / numCols);

  const gridRef = useRef<HTMLDivElement>(null);

  const [maxEvents, setMaxEvents] = useState(0);

  useEffect(() => {
    const gridElement = gridRef.current;
    if (!gridElement) return;

    const resizeObserver = new ResizeObserver(() => {
      const gridHeight = gridElement.offsetHeight;
      const cellHeight = gridHeight / numRows;
      const dateHeaderHeight = 20;
      const eventLineHeight = 18;
      const availableHeight = cellHeight - dateHeaderHeight;
      const calculatedMaxEvents =
        Math.floor(availableHeight / eventLineHeight) - 1;
      console.log(calculatedMaxEvents);
      setMaxEvents(Math.max(0, calculatedMaxEvents));
    });

    resizeObserver.observe(gridElement);

    // Cleanup
    return () => resizeObserver.disconnect();
  }, [numRows, showWeekends]); // Re-calculate when rows or weekends change

  const handleShowMore = (day: Date) => {
    setCurrentDate(day);

    setViewType("day");
  };

  return (
    <div
      className="h-full grid select-none"
      style={{ gridTemplateRows: "auto 1fr" }}
    >
      <div
        className={`grid border-b border-neutral-200 dark:border-neutral-800 sticky top-0 bg-background z-10`}
        style={{ gridTemplateColumns: `repeat(${numCols}, 1fr)` }}
      >
        {dayLabels.map((day) => (
          <div key={day} className="p-2 text-right text-base text-gray-500">
            {day}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className="grid overflow-hidden min-h-0"
        style={{
          gridTemplateColumns: `repeat(${numCols}, 1fr)`,
          gridTemplateRows: `repeat(${numRows}, 1fr)`,
        }}
      >
        {monthDays.map((day) => {
          const {
            calendarEvents,
            gitAggregates,
            browserAggregates,
            repositoryAggregates,
          } = getEventsForDay(events, day, githubOrgs);

          // Combine all event types for display
          type MonthDisplayItem =
            | { type: "calendar"; event: StoredEvent }
            | { type: "git"; aggregate: AggregatedGitEvent }
            | { type: "browser"; aggregate: AggregatedBrowserEvent }
            | { type: "repository"; aggregate: AggregatedRepositoryEvent };

          const allDisplayItems: MonthDisplayItem[] = [
            ...calendarEvents.map((event) => ({
              type: "calendar" as const,
              event,
            })),
            ...repositoryAggregates.map((aggregate) => ({
              type: "repository" as const,
              aggregate,
            })),
            ...gitAggregates.map((aggregate) => ({
              type: "git" as const,
              aggregate,
            })),
            ...browserAggregates.map((aggregate) => ({
              type: "browser" as const,
              aggregate,
            })),
          ];

          const needPlaceholder = allDisplayItems.length > maxEvents;
          const visibleItems = allDisplayItems.slice(
            0,
            needPlaceholder ? maxEvents - 1 : allDisplayItems.length
          );
          const remainingCount = allDisplayItems.length - visibleItems.length;
          const isCurrentMonth = day.getMonth() === date.getMonth();

          return (
            <div
              key={day.toISOString()}
              className={`border-r border-b border-neutral-200 dark:border-neutral-800 p-1.5 flex flex-col overflow-hidden ${
                !isCurrentMonth ? "bg-muted/20" : ""
              }`}
            >
              <div
                className={`text-sm mb-1 text-right text-gray-500 ${
                  !isCurrentMonth ? "text-muted-foreground" : ""
                }`}
              >
                <span className={isToday(day) ? todayIndicatorClass : ""}>
                  {day.getDate() === 1
                    ? formatMonthDayShort(day)
                    : day.getDate()}
                </span>
              </div>

              <div className="flex-1 min-h-0">
                <TooltipProvider>
                  {visibleItems.map((item) => {
                    let key: string;
                    if (item.type === "calendar") {
                      key = `calendar-${item.event.id}`;
                    } else if (item.type === "git") {
                      key = `git-${item.aggregate.id}`;
                    } else if (item.type === "browser") {
                      key = `browser-${item.aggregate.id}`;
                    } else {
                      key = `repository-${item.aggregate.id}`;
                    }

                    return (
                      <MonthEventBlock
                        key={key}
                        event={
                          item.type === "calendar" ? item.event : undefined
                        }
                        gitAggregate={
                          item.type === "git" ? item.aggregate : undefined
                        }
                        browserAggregate={
                          item.type === "browser" ? item.aggregate : undefined
                        }
                        repositoryAggregate={
                          item.type === "repository"
                            ? item.aggregate
                            : undefined
                        }
                        projectMap={projectMap}
                        onClick={() => {
                          if (onEventAssign) {
                            if (item.type === "calendar") {
                              onEventAssign(item.event);
                            } else {
                              onEventAssign(item.aggregate);
                            }
                          }
                        }}
                        onAssignmentComplete={onAssignmentComplete}
                      />
                    );
                  })}
                </TooltipProvider>

                {remainingCount > 0 && (
                  <button
                    onClick={() => handleShowMore(day)}
                    className="text-[10px] leading-tight rounded px-1 py-0.5 truncate block"
                  >
                    +{remainingCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

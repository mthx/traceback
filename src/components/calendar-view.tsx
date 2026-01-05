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
import type { StoredEvent, Project, UIEvent } from "@/types/event";
import { aggregateAllEvents, filterUIEventsByDay } from "@/types/event";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { EventBlock } from "@/components/event-block";
import { MonthEventBlock } from "@/components/month-event-block";
import { EventTooltipContent } from "@/components/event-tooltip-content";
import { getContrastingTextColor } from "@/components/event-content";
import {
  isToday,
  todayIndicatorClass,
  formatMonthYear,
  formatMonthDay,
  formatMonthDayShort,
  formatWeekday,
  formatMonth,
  formatDateFull,
  NEUTRAL_COLOR,
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
  onEventAssign?: (event: UIEvent) => void;
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
  onEventAssign?: (event: UIEvent) => void;
  onAssignmentComplete?: () => void;
}

interface EventBlock {
  event: UIEvent;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
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

function getEventsForDay(
  allUIEvents: UIEvent[],
  date: Date
): {
  allDayEvents: UIEvent[];
  timedEvents: UIEvent[];
} {
  return filterUIEventsByDay(allUIEvents, date);
}

function calculateEventPositions(events: UIEvent[]): EventBlock[] {
  const HOUR_HEIGHT = 60;

  // Sort by start time
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
  });

  const columns: UIEvent[][] = [];

  sortedEvents.forEach((event) => {
    const itemStart = new Date(event.start_date);

    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastEvent = columns[col][columns[col].length - 1];
      const lastEnd = new Date(lastEvent.end_date);

      if (lastEnd <= itemStart) {
        columns[col].push(event);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([event]);
    }
  });

  const blocks: EventBlock[] = [];
  columns.forEach((col, colIndex) => {
    col.forEach((event) => {
      const eventStart = new Date(event.start_date);
      const eventEnd = new Date(event.end_date);

      const startHour = eventStart.getHours() + eventStart.getMinutes() / 60;
      const endHour = eventEnd.getHours() + eventEnd.getMinutes() / 60;
      const duration = endHour - startHour;

      blocks.push({
        event,
        top: startHour * HOUR_HEIGHT,
        height: Math.max(duration * HOUR_HEIGHT, 30),
        column: colIndex,
        totalColumns: columns.length,
      });
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
  events: UIEvent[];
  projectMap?: Map<number, Project>;
  onEventClick: (event: UIEvent) => void;
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
          const eventColor = project?.color || NEUTRAL_COLOR;

          return (
            <Tooltip key={event.id}>
              <TooltipTrigger asChild>
                <button
                  className="px-2 py-0.5 rounded text-xs font-medium text-left hover:opacity-80 transition-opacity w-full truncate min-w-0"
                  style={{
                    backgroundColor: eventColor,
                    color: getContrastingTextColor(eventColor),
                  }}
                  onClick={() => onEventClick(event)}
                >
                  {event.title}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start">
                <EventTooltipContent
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

  const allUIEvents = aggregateAllEvents(githubOrgs, events);
  const { allDayEvents, timedEvents } = getEventsForDay(allUIEvents, date);
  const eventBlocks = calculateEventPositions(timedEvents);
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
              className="h-15 flex items-start px-2 text-xs text-muted-foreground first:pt-2"
            >
              <div className="w-12 -mt-2">
                {hour.toString().padStart(2, "0") + ":00"}
              </div>
              <div className="flex-1 border-b border-neutral-200 dark:border-neutral-800"></div>
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
                    event={block.event}
                    projectMap={projectMap}
                    position={{
                      top: block.top,
                      height: block.height,
                      left,
                      width,
                    }}
                    onClick={() => {
                      if (onEventAssign) {
                        onEventAssign(block.event);
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

  const allUIEvents = aggregateAllEvents(githubOrgs, events);

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
                const { allDayEvents } = getEventsForDay(allUIEvents, day);
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
                className="first:pt-2 h-15 px-2 text-xs text-muted-foreground flex items-start"
              >
                <div className="-mt-2">
                  {hour.toString().padStart(2, "0") + ":00"}{" "}
                </div>
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const { timedEvents } = getEventsForDay(allUIEvents, day);
            const eventBlocks = calculateEventPositions(timedEvents);

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
                        event={block.event}
                        projectMap={projectMap}
                        position={{
                          top: block.top,
                          height: block.height,
                          left,
                          width,
                        }}
                        onClick={() => {
                          if (onEventAssign) {
                            onEventAssign(block.event);
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

  const allUIEvents = aggregateAllEvents(githubOrgs, events);
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

    return () => resizeObserver.disconnect();
  }, [numRows, showWeekends]);

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
          const { allDayEvents, timedEvents } = getEventsForDay(
            allUIEvents,
            day
          );
          const allEventsForDay = [...allDayEvents, ...timedEvents];

          const needPlaceholder = allEventsForDay.length > maxEvents;
          const visibleItems = allEventsForDay.slice(
            0,
            needPlaceholder ? maxEvents - 1 : allEventsForDay.length
          );
          const remainingCount = allEventsForDay.length - visibleItems.length;
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
                  {visibleItems.map((event) => (
                    <MonthEventBlock
                      key={event.id}
                      event={event}
                      projectMap={projectMap}
                      onClick={() => {
                        if (onEventAssign) {
                          onEventAssign(event);
                        }
                      }}
                      onAssignmentComplete={onAssignmentComplete}
                    />
                  ))}
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

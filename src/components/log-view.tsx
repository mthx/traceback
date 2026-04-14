import { formatDateLong, formatEventTime } from "@/components/calendar-utils";
import {
  EventContent,
  EventHeader,
  getEventIcon,
} from "@/components/event-content";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSyncComplete } from "@/hooks/sync-hooks";
import { usePersistedState } from "@/hooks/use-persisted-state";
import type { Project, StoredEvent, UIEvent } from "@/types/event";
import { aggregateAllEvents } from "@/types/event";
import { invoke } from "@tauri-apps/api/core";
import { CalendarIcon, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimeAllocationPanel } from "@/components/time-allocation-panel";
import { MonthAllocationPanel } from "@/components/month-allocation-panel";

interface DayGroup {
  date: Date;
  dateKey: string;
  events: UIEvent[];
}

type DetailSelection =
  | { type: "event"; event: UIEvent }
  | { type: "day"; dateKey: string }
  | { type: "month"; yearMonth: string }
  | null;

async function getGitHubOrgs(): Promise<string[]> {
  try {
    return await invoke<string[]>("get_github_orgs");
  } catch (error) {
    console.error("Failed to fetch GitHub orgs:", error);
    return [];
  }
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getEventDateKey(event: UIEvent): string {
  const date = new Date(event.start_date);
  return formatDateKey(date);
}

function groupEventsByDay(events: UIEvent[]): DayGroup[] {
  const dayMap = new Map<string, UIEvent[]>();

  for (const event of events) {
    const dateKey = getEventDateKey(event);
    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, []);
    }
    dayMap.get(dateKey)!.push(event);
  }

  const groups: DayGroup[] = [];
  for (const [dateKey, dayEvents] of dayMap.entries()) {
    const date = new Date(dateKey);
    dayEvents.sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    groups.push({ date, dateKey, events: dayEvents });
  }

  groups.sort((a, b) => b.date.getTime() - a.date.getTime());

  return groups;
}

function formatMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const DAYS_PER_PAGE = 30;

function DetailPanel({
  selection,
  projects,
  dayGroups,
  onAssignmentComplete,
  onConfirmChanged,
}: {
  selection: DetailSelection;
  projects: Map<number, Project>;
  dayGroups: DayGroup[];
  onAssignmentComplete: () => void;
  onConfirmChanged: () => void;
}) {
  if (!selection) {
    return (
      <div className="flex-2 flex flex-col min-w-80">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Select an event or day to view details
        </div>
      </div>
    );
  }

  switch (selection.type) {
    case "event":
      return (
        <div className="flex-2 flex flex-col min-w-80">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-3">
              <EventHeader event={selection.event} />
              <EventContent
                event={selection.event}
                onAssignmentComplete={onAssignmentComplete}
              />
            </div>
          </div>
        </div>
      );
    case "day": {
      const dayGroup = dayGroups.find((g) => g.dateKey === selection.dateKey);
      const dayProjectIds = new Set<number>();
      if (dayGroup) {
        for (const event of dayGroup.events) {
          if (event.project_id) {
            dayProjectIds.add(event.project_id);
          }
        }
      }
      return (
        <div className="flex-2 flex flex-col min-w-80">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <TimeAllocationPanel
              dateKey={selection.dateKey}
              projects={projects}
              dayProjectIds={dayProjectIds}
              onConfirmChanged={onConfirmChanged}
            />
          </div>
        </div>
      );
    }
    case "month":
      return (
        <div className="flex-2 flex flex-col min-w-80">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <MonthAllocationPanel
              yearMonth={selection.yearMonth}
              projects={projects}
            />
          </div>
        </div>
      );
  }
}

interface LogViewProps {
  projectId?: number;
}

export function LogView({ projectId }: LogViewProps) {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [projects, setProjects] = useState<Map<number, Project>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestDate, setOldestDate] = useState<Date | undefined>(undefined);
  const [selection, setSelection] = useState<DetailSelection>(null);
  const [persistedSelectionId, setPersistedSelectionId] = usePersistedState<
    string | null
  >("logFocusedItemId", null);
  const [confirmedDays, setConfirmedDays] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const getEventById = useCallback(
    (id: string): UIEvent | undefined => {
      for (const group of dayGroups) {
        const event = group.events.find((e) => e.id === id);
        if (event) return event;
      }
      return undefined;
    },
    [dayGroups]
  );

  // Track focus changes and update selection state
  useEffect(() => {
    const handleFocusChange = () => {
      const el = document.activeElement as HTMLElement;

      const dateKey = el?.dataset?.dateKey;
      if (dateKey) {
        setSelection({ type: "day", dateKey });
        setPersistedSelectionId(`day:${dateKey}`);
        return;
      }

      const monthKey = el?.dataset?.monthKey;
      if (monthKey) {
        setSelection({ type: "month", yearMonth: monthKey });
        setPersistedSelectionId(`month:${monthKey}`);
        return;
      }

      const eventId = el?.dataset?.eventId;
      if (eventId) {
        const event = getEventById(eventId);
        if (event) {
          setSelection({ type: "event", event });
          setPersistedSelectionId(`event:${eventId}`);
          return;
        }
      }
    };

    document.addEventListener("focusin", handleFocusChange);
    return () => document.removeEventListener("focusin", handleFocusChange);
  }, [getEventById, setPersistedSelectionId]);

  // Restore persisted selection on load
  useEffect(() => {
    if (dayGroups.length === 0 || selection) return;

    if (persistedSelectionId) {
      const element = (() => {
        if (persistedSelectionId.startsWith("day:")) {
          const dateKey = persistedSelectionId.slice(4);
          return document.querySelector(
            `[data-date-key="${dateKey}"]`
          ) as HTMLElement;
        }
        if (persistedSelectionId.startsWith("month:")) {
          const monthKey = persistedSelectionId.slice(6);
          return document.querySelector(
            `[data-month-key="${monthKey}"]`
          ) as HTMLElement;
        }
        if (persistedSelectionId.startsWith("event:")) {
          const eventId = persistedSelectionId.slice(6);
          return document.querySelector(
            `[data-event-id="${eventId}"]`
          ) as HTMLElement;
        }
        return null;
      })();

      if (element) {
        element.focus();
        return;
      }
    }

    // Fall back to focusing the first day
    const firstGroup = dayGroups[0];
    if (firstGroup) {
      const element = document.querySelector(
        `[data-date-key="${firstGroup.dateKey}"]`
      ) as HTMLElement;
      if (element) {
        element.focus();
      }
    }
  }, [dayGroups, selection, persistedSelectionId]);

  // Build flat list of all focusable item keys for keyboard navigation
  const allItemKeys = useMemo(() => {
    const keys: string[] = [];
    let currentMonth: string | null = null;
    for (const group of dayGroups) {
      const yearMonth = group.dateKey.substring(0, 7);
      if (yearMonth !== currentMonth) {
        keys.push(`month:${yearMonth}`);
        currentMonth = yearMonth;
      }
      keys.push(`day:${group.dateKey}`);
      for (const event of group.events) {
        keys.push(`event:${event.id}`);
      }
    }
    return keys;
  }, [dayGroups]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "PageUp" &&
        e.key !== "PageDown" &&
        e.key !== "Home" &&
        e.key !== "End"
      )
        return;
      if (allItemKeys.length === 0) return;

      const focusedElement = document.activeElement as HTMLElement;
      const currentKey = focusedElement?.dataset?.monthKey
        ? `month:${focusedElement.dataset.monthKey}`
        : focusedElement?.dataset?.dateKey
          ? `day:${focusedElement.dataset.dateKey}`
          : focusedElement?.dataset?.eventId
            ? `event:${focusedElement.dataset.eventId}`
            : null;

      if (!currentKey) return;

      const currentIndex = allItemKeys.indexOf(currentKey);
      if (currentIndex === -1) return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const targetIndex =
          e.key === "ArrowDown"
            ? Math.min(currentIndex + 1, allItemKeys.length - 1)
            : Math.max(currentIndex - 1, 0);

        if (targetIndex === currentIndex) return;
        const targetKey = allItemKeys[targetIndex];
        const el = getElementByItemKey(targetKey);
        el?.focus();
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const targetKey =
          e.key === "Home"
            ? allItemKeys[0]
            : allItemKeys[allItemKeys.length - 1];
        const el = getElementByItemKey(targetKey);
        el?.focus();
      } else {
        // PageUp/PageDown
        const scrollContainer = scrollRef.current;
        if (!scrollContainer) return;

        const currentElement = getElementByItemKey(currentKey);
        if (!currentElement) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const currentRect = currentElement.getBoundingClientRect();
        const relativeY = currentRect.top - containerRect.top;

        requestAnimationFrame(() => {
          const targetY = containerRect.top + relativeY;
          let closestKey: string | null = null;
          let closestDistance = Infinity;

          for (const key of allItemKeys) {
            const element = getElementByItemKey(key);
            if (!element) continue;
            const rect = element.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            const distance = Math.abs(centerY - targetY);
            if (distance < closestDistance) {
              closestDistance = distance;
              closestKey = key;
            }
          }

          if (closestKey) {
            const el = getElementByItemKey(closestKey);
            el?.focus();
          }
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allItemKeys]);

  function getElementByItemKey(key: string): HTMLElement | null {
    if (key.startsWith("month:")) {
      return document.querySelector(
        `[data-month-key="${key.slice(6)}"]`
      ) as HTMLElement;
    }
    if (key.startsWith("day:")) {
      return document.querySelector(
        `[data-date-key="${key.slice(4)}"]`
      ) as HTMLElement;
    }
    if (key.startsWith("event:")) {
      return itemRefs.current.get(key.slice(6)) || null;
    }
    return null;
  }

  async function refreshData(startDate?: Date) {
    try {
      const endDate = new Date();
      if (!startDate) {
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - DAYS_PER_PAGE);
      }

      const [eventsData, projectsData, githubOrgs] = await Promise.all([
        invoke<StoredEvent[]>("get_stored_events", {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        invoke<Project[]>("get_all_projects"),
        getGitHubOrgs(),
      ]);

      const filteredEvents = projectId
        ? eventsData.filter((event) => event.project_id === projectId)
        : eventsData;

      const projectMap = new Map(projectsData.map((p) => [p.id, p]));
      setProjects(projectMap);

      const combined = aggregateAllEvents(githubOrgs, filteredEvents);
      const grouped = groupEventsByDay(combined);
      setDayGroups(grouped);
      setHasMore(eventsData.length > 0);
      setOldestDate(startDate);

      refreshConfirmedDays(startDate, endDate);
    } catch (err) {
      console.error("Error refreshing events:", err);
    }
  }

  async function refreshConfirmedDays(start?: Date, end?: Date) {
    try {
      const startKey = formatDateKey(
        start ?? oldestDate ?? new Date("2020-01-01")
      );
      const endKey = formatDateKey(end ?? new Date());
      const days = await invoke<string[]>("get_confirmed_days", {
        startDateKey: startKey,
        endDateKey: endKey,
      });
      setConfirmedDays(new Set(days));
    } catch (err) {
      console.error("Error fetching confirmed days:", err);
    }
  }

  async function fetchInitialData() {
    setLoading(true);
    try {
      await refreshData();
    } catch (err) {
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  }

  useSyncComplete(() => {
    refreshData(oldestDate);
  });

  async function loadMoreEvents() {
    if (!hasMore || loadingMore || !oldestDate) return;

    setLoadingMore(true);
    try {
      const startDate = new Date(oldestDate);
      startDate.setDate(startDate.getDate() - DAYS_PER_PAGE);
      await refreshData(startDate);
    } catch (err) {
      console.error("Error loading more events:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const scrolledToBottom = scrollHeight - scrollTop - clientHeight < 200;

      if (scrolledToBottom && hasMore && !loadingMore) {
        loadMoreEvents();
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingMore, oldestDate]);

  const scrollToDate = useCallback((date: Date) => {
    const dateKey = formatDateKey(date);
    const element = dayRefs.current.get(dateKey);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setCalendarOpen(false);
    }
  }, []);

  const handleToday = () => {
    const today = new Date();
    scrollToDate(today);
  };

  // Render day groups with month headers inserted at boundaries
  function renderGroupedList() {
    let currentMonth: string | null = null;
    const elements: React.ReactNode[] = [];

    for (let groupIndex = 0; groupIndex < dayGroups.length; groupIndex++) {
      const group = dayGroups[groupIndex];
      const yearMonth = group.dateKey.substring(0, 7);

      if (yearMonth !== currentMonth) {
        const isSelectedMonth =
          selection?.type === "month" && selection.yearMonth === yearMonth;
        elements.push(
          <button
            key={`month:${yearMonth}`}
            data-month-key={yearMonth}
            onClick={(e) => e.currentTarget.focus()}
            className={`sticky top-0 z-10 w-full bg-background border-b border-neutral-200 dark:border-neutral-800 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus:bg-accent/70 focus:outline-none ${isSelectedMonth ? "bg-accent/70" : ""}`}
          >
            <h2 className="text-sm font-semibold">
              {formatMonthYear(yearMonth)}
            </h2>
          </button>
        );
        currentMonth = yearMonth;
      }

      const isSelectedDay =
        selection?.type === "day" && selection.dateKey === group.dateKey;
      const isConfirmed = confirmedDays.has(group.dateKey);

      elements.push(
        <div
          key={group.dateKey}
          ref={(el) => {
            if (el) {
              dayRefs.current.set(group.dateKey, el);
            } else {
              dayRefs.current.delete(group.dateKey);
            }
          }}
        >
          <button
            data-date-key={group.dateKey}
            onClick={(e) => e.currentTarget.focus()}
            className={`w-full bg-background border-b border-neutral-200 dark:border-neutral-800 px-4 py-2 text-left transition-colors hover:bg-muted/30 focus:bg-accent/50 focus:outline-none ${groupIndex > 0 ? "border-t" : ""} ${isSelectedDay ? "bg-accent/50" : ""}`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-muted-foreground tracking-wide">
                {formatDateLong(group.date.toISOString())}
              </h2>
              {isConfirmed && (
                <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
              )}
            </div>
          </button>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {group.events.map((event) => {
              const project = event.project_id
                ? projects.get(event.project_id)
                : undefined;
              const title = event.title;
              const Icon = getEventIcon(event);
              const isSelected =
                selection?.type === "event" && selection.event.id === event.id;

              return (
                <button
                  key={event.id}
                  data-event-id={event.id}
                  ref={(el) => {
                    if (el) {
                      itemRefs.current.set(event.id, el);
                    } else {
                      itemRefs.current.delete(event.id);
                    }
                  }}
                  onClick={(e) => {
                    e.currentTarget.focus();
                  }}
                  className={`relative w-full pl-8 pr-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus:bg-accent/70 focus:outline-none focus:before:absolute focus:before:left-0 focus:before:top-0 focus:before:bottom-0 focus:before:w-0.5 focus:before:bg-accent-foreground ${isSelected ? "bg-accent/70" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <div className="font-medium truncate text-sm">
                          {title}
                        </div>
                        {project && (
                          <div
                            className="shrink-0 w-2 h-2 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatEventTime(event.start_date)} -{" "}
                        {formatEventTime(event.end_date)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return elements;
  }

  return (
    <div className="flex h-full">
      <div className="flex-3 flex flex-col border-r min-w-0">
        <div className="px-4 py-4 border-b">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={new Date()}
                    onSelect={(date) => {
                      if (date) {
                        scrollToDate(date);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" onClick={handleToday}>
                Today
              </Button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-muted-foreground">Loading events...</div>
          ) : dayGroups.length === 0 ? (
            <div className="p-4 text-muted-foreground">No events found</div>
          ) : (
            <div>
              {renderGroupedList()}
              {loadingMore && (
                <div className="p-4 text-center text-muted-foreground">
                  Loading more events...
                </div>
              )}
              {!hasMore && dayGroups.length > 0 && (
                <div className="p-4 text-center text-muted-foreground">
                  No more events
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DetailPanel
        selection={selection}
        projects={projects}
        dayGroups={dayGroups}
        onAssignmentComplete={refreshData}
        onConfirmChanged={() => refreshConfirmedDays()}
      />
    </div>
  );
}

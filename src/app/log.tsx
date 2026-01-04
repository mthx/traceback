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
import { CalendarIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface DayGroup {
  date: Date;
  dateKey: string;
  events: UIEvent[];
}

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

const DAYS_PER_PAGE = 30;

function DetailPanel({
  focusedEvent,
  onAssignmentComplete,
}: {
  focusedEvent: UIEvent | null;
  onAssignmentComplete: () => void;
}) {
  return (
    <div className="flex-2 flex flex-col min-w-80">
      {focusedEvent ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            <EventHeader event={focusedEvent} />
            <EventContent
              event={focusedEvent}
              onAssignmentComplete={onAssignmentComplete}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Select an event to view details
        </div>
      )}
    </div>
  );
}

export function Log() {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [projects, setProjects] = useState<Map<number, Project>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestDate, setOldestDate] = useState<Date | undefined>(undefined);
  const [focusedEvent, setFocusedEvent] = useState<UIEvent | null>(null);
  const [persistedFocusedEventId, setPersistedFocusedEventId] =
    usePersistedState<string | null>("logFocusedEventId", null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const eventRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const focusedEventIdRef = useRef<string | null>(null);

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

  // Track focus changes and update focusedEvent state
  useEffect(() => {
    const handleFocusChange = () => {
      const focusedElement = document.activeElement as HTMLElement;
      const eventId = focusedElement?.dataset?.eventId;
      const newFocusedEvent = eventId ? getEventById(eventId) || null : null;

      // Update the ref with the current focused ID
      focusedEventIdRef.current = eventId || null;

      // Only update state if the ID actually changed to avoid unnecessary re-renders
      const currentId = focusedEvent ? focusedEvent.id : null;
      const newId = newFocusedEvent ? newFocusedEvent.id : null;

      if (currentId !== newId) {
        setFocusedEvent(newFocusedEvent);
        setPersistedFocusedEventId(newId);
      }
    };

    document.addEventListener("focusin", handleFocusChange);
    return () => document.removeEventListener("focusin", handleFocusChange);
  }, [getEventById, focusedEvent, setPersistedFocusedEventId]);

  useEffect(() => {
    if (dayGroups.length > 0 && !focusedEvent) {
      // Try to restore the persisted focused event
      if (persistedFocusedEventId) {
        const persistedEvent = getEventById(persistedFocusedEventId);
        if (persistedEvent) {
          const element = document.querySelector(
            `[data-event-id="${persistedFocusedEventId}"]`
          ) as HTMLElement;
          if (element) {
            element.focus();
            return;
          }
        }
      }

      // Fall back to focusing the first event
      const firstEvent = dayGroups[0]?.events[0];
      if (firstEvent) {
        const element = document.querySelector(
          `[data-event-id="${firstEvent.id}"]`
        ) as HTMLElement;
        if (element) {
          element.focus();
        }
      }
    }
  }, [dayGroups, focusedEvent, persistedFocusedEventId, getEventById]);

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
      if (dayGroups.length === 0) return;

      const allEvents: UIEvent[] = dayGroups.flatMap((group) => group.events);

      if (allEvents.length === 0) return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        const focusedElement = document.activeElement as HTMLButtonElement;
        const currentEventId = focusedElement?.dataset.eventId;
        if (!currentEventId) return;

        const currentIndex = allEvents.findIndex(
          (event) => event.id === currentEventId
        );

        if (currentIndex === -1) return;

        let targetEvent: UIEvent | null = null;
        if (e.key === "ArrowDown" && currentIndex < allEvents.length - 1) {
          targetEvent = allEvents[currentIndex + 1];
        } else if (e.key === "ArrowUp" && currentIndex > 0) {
          targetEvent = allEvents[currentIndex - 1];
        }

        if (targetEvent) {
          const element = eventRefs.current.get(targetEvent.id);
          element?.focus();
        }
      } else {
        const scrollContainer = scrollRef.current;
        if (!scrollContainer) return;

        const focusedElement = document.activeElement as HTMLButtonElement;
        const currentEventId = focusedElement?.dataset.eventId;
        const currentElement = currentEventId
          ? eventRefs.current.get(currentEventId)
          : null;

        if (!currentElement) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const currentRect = currentElement.getBoundingClientRect();
        const relativeY = currentRect.top - containerRect.top;

        requestAnimationFrame(() => {
          const targetY = containerRect.top + relativeY;

          let closestEvent: UIEvent | null = null;
          let closestDistance = Infinity;

          for (const event of allEvents) {
            const element = eventRefs.current.get(event.id);
            if (!element) continue;

            const rect = element.getBoundingClientRect();
            const eventCenterY = rect.top + rect.height / 2;
            const distance = Math.abs(eventCenterY - targetY);

            if (distance < closestDistance) {
              closestDistance = distance;
              closestEvent = event;
            }
          }

          if (closestEvent) {
            const element = eventRefs.current.get(closestEvent.id);
            element?.focus();
          }
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dayGroups]);

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

      const projectMap = new Map(projectsData.map((p) => [p.id, p]));
      setProjects(projectMap);

      const combined = aggregateAllEvents(githubOrgs, eventsData);
      const grouped = groupEventsByDay(combined);
      setDayGroups(grouped);
      setHasMore(eventsData.length > 0);
      setOldestDate(startDate);
    } catch (err) {
      console.error("Error refreshing events:", err);
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
      // This could be made more efficient by just loading the new data.
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
              {dayGroups.map((group, groupIndex) => (
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
                  <div
                    className={`bg-background border-b border-neutral-200 dark:border-neutral-800 px-4 py-2 ${groupIndex > 0 ? "border-t" : ""}`}
                  >
                    <h2 className="text-xs font-semibold text-muted-foreground tracking-wide">
                      {formatDateLong(group.date.toISOString())}
                    </h2>
                  </div>
                  <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {group.events.map((event) => {
                      const project = event.project_id
                        ? projects.get(event.project_id)
                        : undefined;
                      const title = event.title;

                      // Determine event type for icon
                      let eventType =
                        event.type === "repository" || event.type === "git"
                          ? "git"
                          : event.type === "browser"
                            ? "browser_history"
                            : "calendar";
                      const aggregateType = event.aggregate_type;
                      const domain = event.domain;

                      const Icon = getEventIcon(
                        eventType,
                        aggregateType,
                        domain
                      );

                      const isSelected =
                        focusedEvent && focusedEvent.id === event.id;

                      return (
                        <button
                          key={event.id}
                          data-event-id={event.id}
                          ref={(el) => {
                            if (el) {
                              eventRefs.current.set(event.id, el);
                            } else {
                              eventRefs.current.delete(event.id);
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
              ))}
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
        focusedEvent={focusedEvent}
        onAssignmentComplete={refreshData}
      />
    </div>
  );
}

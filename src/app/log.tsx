import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
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
  isAggregatedGitEvent,
  isAggregatedBrowserEvent,
  isAggregatedRepositoryEvent,
} from "@/types/event";
import { EventHeader, EventContent } from "@/components/event-content";
import { formatDateLong, formatEventTime } from "@/components/calendar-utils";
import { getEventIcon } from "@/components/event-content";

type AggregatedEvent =
  | AggregatedRepositoryEvent
  | AggregatedGitEvent
  | AggregatedBrowserEvent
  | StoredEvent;

interface DayGroup {
  date: Date;
  dateKey: string;
  events: AggregatedEvent[];
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

function getEventDateKey(event: AggregatedEvent): string {
  const date = new Date(event.start_date);
  return formatDateKey(date);
}

function groupEventsByDay(events: AggregatedEvent[]): DayGroup[] {
  const dayMap = new Map<string, AggregatedEvent[]>();

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

export function Log() {
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [projects, setProjects] = useState<Map<number, Project>>(new Map());
  const [selectedEvent, setSelectedEvent] = useState<AggregatedEvent | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [oldestDate, setOldestDate] = useState<Date | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const eventRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (dayGroups.length > 0 && !selectedEvent) {
      const firstEvent = dayGroups[0].events[0];
      if (firstEvent) {
        setSelectedEvent(firstEvent);
      }
    }
  }, [dayGroups, selectedEvent]);

  useEffect(() => {
    if (selectedEvent) {
      const eventId = getEventId(selectedEvent);
      const element = eventRefs.current.get(eventId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [selectedEvent]);

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

      const allEvents: AggregatedEvent[] = dayGroups.flatMap(
        (group) => group.events
      );

      if (allEvents.length === 0) return;

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();

        if (!selectedEvent) return;

        const currentIndex = allEvents.findIndex((event) =>
          eventsAreEqual(event, selectedEvent)
        );

        if (currentIndex === -1) return;

        if (e.key === "ArrowDown" && currentIndex < allEvents.length - 1) {
          setSelectedEvent(allEvents[currentIndex + 1]);
        } else if (e.key === "ArrowUp" && currentIndex > 0) {
          setSelectedEvent(allEvents[currentIndex - 1]);
        }
      } else {
        const scrollContainer = scrollRef.current;
        if (!scrollContainer) return;

        const currentEventId = selectedEvent ? getEventId(selectedEvent) : null;
        const currentElement = currentEventId
          ? eventRefs.current.get(currentEventId)
          : null;

        if (!currentElement) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const currentRect = currentElement.getBoundingClientRect();
        const relativeY = currentRect.top - containerRect.top;

        requestAnimationFrame(() => {
          const targetY = containerRect.top + relativeY;

          let closestEvent: AggregatedEvent | null = null;
          let closestDistance = Infinity;

          for (const event of allEvents) {
            const eventId = getEventId(event);
            const element = eventRefs.current.get(eventId);
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
            setSelectedEvent(closestEvent);
          }
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEvent, dayGroups]);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - DAYS_PER_PAGE);

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
      setOldestDate(startDate);

      const repositoryAggregates = aggregateRepositoryEvents(eventsData);
      const coveredRepoPaths = new Set(
        repositoryAggregates.map((agg) => agg.repository_path)
      );

      const gitAggregates = aggregateGitEvents(eventsData).filter(
        (aggregate) => {
          const hasCoveredRepoPath = aggregate.activities.some((activity) => {
            const data = JSON.parse(activity.type_specific_data || "{}");
            return (
              data.repository_path && coveredRepoPaths.has(data.repository_path)
            );
          });
          return !hasCoveredRepoPath;
        }
      );

      const browserAggregates = aggregateBrowserEvents(
        eventsData,
        githubOrgs
      ).filter((aggregate) => {
        const hasCoveredRepoPath = aggregate.visits.some((visit) => {
          const data = JSON.parse(visit.type_specific_data || "{}");
          return (
            data.repository_path && coveredRepoPaths.has(data.repository_path)
          );
        });
        return !hasCoveredRepoPath;
      });

      const calendarEvents = eventsData.filter(
        (e) => e.event_type === "calendar"
      );

      const combined: AggregatedEvent[] = [
        ...repositoryAggregates,
        ...gitAggregates,
        ...browserAggregates,
        ...calendarEvents,
      ];

      const grouped = groupEventsByDay(combined);
      setDayGroups(grouped);
      setHasMore(eventsData.length > 0);
    } catch (err) {
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMoreEvents() {
    if (!hasMore || loadingMore || !oldestDate) return;

    setLoadingMore(true);
    try {
      const endDate = new Date(oldestDate);
      const startDate = new Date(oldestDate);
      startDate.setDate(startDate.getDate() - DAYS_PER_PAGE);

      const [eventsData, githubOrgs] = await Promise.all([
        invoke<StoredEvent[]>("get_stored_events", {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        getGitHubOrgs(),
      ]);

      if (eventsData.length === 0) {
        setHasMore(false);
        return;
      }

      setOldestDate(startDate);

      const repositoryAggregates = aggregateRepositoryEvents(eventsData);
      const coveredRepoPaths = new Set(
        repositoryAggregates.map((agg) => agg.repository_path)
      );

      const gitAggregates = aggregateGitEvents(eventsData).filter(
        (aggregate) => {
          const hasCoveredRepoPath = aggregate.activities.some((activity) => {
            const data = JSON.parse(activity.type_specific_data || "{}");
            return (
              data.repository_path && coveredRepoPaths.has(data.repository_path)
            );
          });
          return !hasCoveredRepoPath;
        }
      );

      const browserAggregates = aggregateBrowserEvents(
        eventsData,
        githubOrgs
      ).filter((aggregate) => {
        const hasCoveredRepoPath = aggregate.visits.some((visit) => {
          const data = JSON.parse(visit.type_specific_data || "{}");
          return (
            data.repository_path && coveredRepoPaths.has(data.repository_path)
          );
        });
        return !hasCoveredRepoPath;
      });

      const calendarEvents = eventsData.filter(
        (e) => e.event_type === "calendar"
      );

      const newEvents: AggregatedEvent[] = [
        ...repositoryAggregates,
        ...gitAggregates,
        ...browserAggregates,
        ...calendarEvents,
      ];

      const newGrouped = groupEventsByDay(newEvents);
      setDayGroups((prev) => [...prev, ...newGrouped]);
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

  function getEventProject(event: AggregatedEvent): Project | undefined {
    if (isAggregatedRepositoryEvent(event)) {
      return event.project_id ? projects.get(event.project_id) : undefined;
    } else if (isAggregatedGitEvent(event)) {
      return event.project_id ? projects.get(event.project_id) : undefined;
    } else if (isAggregatedBrowserEvent(event)) {
      return event.project_id ? projects.get(event.project_id) : undefined;
    } else {
      return event.project_id ? projects.get(event.project_id) : undefined;
    }
  }

  function getEventTitle(event: AggregatedEvent): string {
    if (isAggregatedRepositoryEvent(event)) {
      return event.repository_name;
    } else if (isAggregatedGitEvent(event)) {
      return event.repository_name.split("/").pop() || event.repository_name;
    } else if (isAggregatedBrowserEvent(event)) {
      return event.title;
    } else {
      return event.title;
    }
  }

  function getEventType(event: AggregatedEvent): string {
    if (isAggregatedRepositoryEvent(event)) {
      return "git";
    } else if (isAggregatedGitEvent(event)) {
      return "git";
    } else if (isAggregatedBrowserEvent(event)) {
      return "browser_history";
    } else {
      return event.event_type;
    }
  }

  function getEventId(event: AggregatedEvent): string {
    if (
      isAggregatedRepositoryEvent(event) ||
      isAggregatedGitEvent(event) ||
      isAggregatedBrowserEvent(event)
    ) {
      return event.id;
    } else {
      return `event-${event.id}`;
    }
  }

  function eventsAreEqual(a: AggregatedEvent, b: AggregatedEvent): boolean {
    return getEventId(a) === getEventId(b);
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r min-w-0">
        <div className="px-4 py-4 border-b">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Log</h1>
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
                    className={`bg-background border-b border-border/30 px-4 py-2 ${groupIndex > 0 ? "border-t" : ""}`}
                  >
                    <h2 className="text-xs font-semibold text-muted-foreground tracking-wide">
                      {formatDateLong(group.date.toISOString())}
                    </h2>
                  </div>
                  <div className="divide-y divide-border/30">
                    {group.events.map((event) => {
                      const project = getEventProject(event);
                      const title = getEventTitle(event);
                      const eventType = getEventType(event);

                      let aggregateType: string | undefined;
                      let domain: string | undefined;

                      if (
                        !isAggregatedRepositoryEvent(event) &&
                        isAggregatedBrowserEvent(event)
                      ) {
                        aggregateType = event.aggregate_type;
                        domain = event.domain;
                      }

                      const Icon = getEventIcon(
                        eventType,
                        aggregateType as any,
                        domain
                      );
                      const isSelected =
                        selectedEvent && eventsAreEqual(event, selectedEvent);

                      return (
                        <button
                          key={getEventId(event)}
                          ref={(el) => {
                            const eventId = getEventId(event);
                            if (el) {
                              eventRefs.current.set(eventId, el);
                            } else {
                              eventRefs.current.delete(eventId);
                            }
                          }}
                          onClick={() => setSelectedEvent(event)}
                          className={`relative w-full pl-8 pr-4 py-2.5 text-left transition-colors ${
                            isSelected
                              ? "bg-accent/70 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-accent-foreground"
                              : "hover:bg-muted/30"
                          }`}
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

      <div className="w-96 flex flex-col">
        {selectedEvent ? (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-3">
              <EventHeader event={selectedEvent} />
              <EventContent
                event={selectedEvent}
                onAssignmentComplete={fetchInitialData}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select an event to view details
          </div>
        )}
      </div>
    </div>
  );
}

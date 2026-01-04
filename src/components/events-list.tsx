import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import type { StoredEvent, Project } from "@/types/event";
import {
  parseEventData,
  parseGitEventData,
  parseBrowserEventData,
} from "@/types/event";
import { useEventDialog } from "@/contexts/rule-dialog-context";
import { formatEventDateTime } from "@/components/calendar-utils";
import { getEventIcon } from "@/components/event-content";

interface EventsListProps {
  projectId?: number | null;
  showUnassignedOnly?: boolean;
  onEventAssign?: () => void;
}

export function EventsList({
  projectId,
  showUnassignedOnly = false,
  onEventAssign,
}: EventsListProps) {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);
  const { openEventDialog } = useEventDialog();

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let eventsData: StoredEvent[];

      if (projectId !== undefined && projectId !== null) {
        // Fetch events for specific project
        eventsData = await invoke<StoredEvent[]>("get_events_by_project", {
          projectId,
          startDate: null,
          endDate: null,
        });
      } else {
        // Fetch all events
        eventsData = await invoke<StoredEvent[]>("get_stored_events", {
          startDate: null,
          endDate: null,
        });
      }

      // Filter to unassigned if requested
      if (showUnassignedOnly) {
        eventsData = eventsData.filter((e) => !e.project_id);
      }

      // Sort by start_date descending (most recent first)
      eventsData.sort(
        (a, b) =>
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );

      // Apply limit
      setEvents(eventsData.slice(0, limit));
    } catch (err) {
      setError(err as string);
      console.error("Error fetching events:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, showUnassignedOnly, limit]);

  const fetchProjects = useCallback(async () => {
    try {
      const projectsData = await invoke<Project[]>("get_all_projects");
      setProjects(projectsData);
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    fetchProjects();
  }, [fetchEvents, fetchProjects]);

  function handleEventClick(event: StoredEvent) {
    // Convert StoredEvent to UIEvent for the dialog
    const eventData =
      event.event_type === "calendar" ? parseEventData(event) : null;
    const uiEvent = {
      id: String(event.id),
      type:
        event.event_type === "git"
          ? ("git" as const)
          : event.event_type === "browser_history"
            ? ("browser" as const)
            : ("calendar" as const),
      title: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      project_id: event.project_id,
      is_all_day: eventData?.is_all_day || false,
      activities: [event],
    };

    openEventDialog(uiEvent, () => {
      fetchEvents();
      onEventAssign?.();
    });
  }

  function getProjectColor(projectId: number | null | undefined): string {
    if (!projectId) return "#6B7280";
    const project = projects.find((p) => p.id === projectId);
    return project?.color || "#6B7280";
  }

  function getProjectName(projectId: number | null | undefined): string | null {
    if (!projectId) return null;
    const project = projects.find((p) => p.id === projectId);
    return project?.name || null;
  }

  if (loading && events.length === 0) {
    return (
      <div className="px-4 py-4">
        <p className="text-sm text-muted-foreground">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-4 py-4">
        <p className="text-sm text-muted-foreground">
          {showUnassignedOnly
            ? "No unassigned events found."
            : "No events found."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4">
        <div className="space-y-2 pb-6">
          {events.map((event) => {
            const eventData =
              event.event_type === "calendar" ? parseEventData(event) : null;
            const gitData =
              event.event_type === "git" ? parseGitEventData(event) : null;
            const browserData =
              event.event_type === "browser_history"
                ? parseBrowserEventData(event)
                : null;
            const projectColor = getProjectColor(event.project_id);
            const projectName = getProjectName(event.project_id);

            const Icon = getEventIcon(
              event.event_type,
              undefined,
              browserData?.domain
            );

            return (
              <div
                key={event.id}
                className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                style={{
                  borderLeft: `3px solid ${projectColor}`,
                }}
                onClick={() => handleEventClick(event)}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{event.title}</div>
                    <div className="text-sm text-muted-foreground space-y-1 mt-1">
                      <div>{formatEventDateTime(event.start_date)}</div>
                      {eventData?.location && (
                        <div className="truncate">📍 {eventData.location}</div>
                      )}
                      {gitData?.repository_name && (
                        <div className="truncate">
                          📦 {gitData.repository_name}
                        </div>
                      )}
                      {browserData?.domain && (
                        <div className="truncate">🌐 {browserData.domain}</div>
                      )}
                      {projectName && (
                        <div className="flex items-center gap-2 mt-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: projectColor }}
                          />
                          <span className="text-xs">{projectName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {events.length >= limit && (
        <div className="border-t p-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => setLimit((prev) => prev + 200)}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

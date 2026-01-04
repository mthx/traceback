import { EventDetails } from "@/components/event-details";
import { Button } from "@/components/ui/button";
import type {
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
  Project,
  StoredEvent,
} from "@/types/event";
import {
  isAggregatedGitEvent,
  isAggregatedBrowserEvent,
  isAggregatedRepositoryEvent,
} from "@/types/event";
import { invoke } from "@tauri-apps/api/core";
import { useRuleDialog } from "@/contexts/rule-dialog-context";
import {
  Calendar,
  Check,
  GitBranch,
  Globe,
  FileText,
  KanbanSquare,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import {
  GitHubIcon,
  GoogleDocsIcon,
  DropboxIcon,
  NotionIcon,
  FigmaIcon,
} from "@/components/brand-icons";
import { useEffect, useState } from "react";
import { formatDateLong, formatEventTime } from "@/components/calendar-utils";
import type { BrowserAggregateType } from "@/types/event";
import type { ComponentType } from "react";

type IconComponent =
  | LucideIcon
  | ComponentType<{ className?: string; size?: number }>;

// Get platform-specific icon for collaborative docs
function getCollaborativeDocIcon(domain: string): IconComponent {
  if (domain.includes("dropbox.com")) {
    return DropboxIcon;
  } else if (domain === "docs.google.com") {
    return GoogleDocsIcon;
  } else if (domain.includes("notion.")) {
    return NotionIcon;
  } else if (domain.includes("monday.com")) {
    return KanbanSquare; // Monday.com (boards/docs) - fallback to Lucide
  } else if (domain.includes("slack.com")) {
    return MessageSquare; // Slack - fallback to Lucide
  } else if (domain.includes("figma.com")) {
    return FigmaIcon;
  }
  return FileText; // Default for collaborative docs
}

// Get the appropriate icon for an event type or browser aggregate
export function getEventIcon(
  eventType: string,
  browserAggregateType?: BrowserAggregateType,
  domain?: string
): IconComponent {
  if (eventType === "git") {
    return GitBranch;
  } else if (eventType === "browser_history" && browserAggregateType) {
    // Check if this is GitHub to use the GitHub icon
    if (domain === "github.com") {
      return GitHubIcon;
    }
    // Use platform-specific icons for collaborative docs
    if (browserAggregateType === "collaborative_doc" && domain) {
      return getCollaborativeDocIcon(domain);
    } else if (browserAggregateType === "code_repo") {
      return GitBranch;
    } else {
      return Globe;
    }
  } else if (eventType === "browser_history") {
    return Globe;
  } else {
    return Calendar;
  }
}

// Helper to determine contrasting text color (black or white)
export function getContrastingTextColor(hexcolor: string | undefined): string {
  if (!hexcolor) return "#000000"; // Default to black if no color

  const r = parseInt(hexcolor.substring(1, 3), 16);
  const g = parseInt(hexcolor.substring(3, 5), 16);
  const b = parseInt(hexcolor.substring(5, 7), 16);
  const y = (r * 299 + g * 587 + b * 114) / 1000;
  return y >= 128 ? "#000000" : "#ffffff";
}

interface EventHeaderProps {
  event:
    | StoredEvent
    | AggregatedGitEvent
    | AggregatedBrowserEvent
    | AggregatedRepositoryEvent;
}

export function EventHeader({ event }: EventHeaderProps) {
  let title: string;
  let eventType: string;
  let browserAggregateType: BrowserAggregateType | undefined;
  let domain: string | undefined;

  if (isAggregatedRepositoryEvent(event)) {
    title = event.repository_name;
    eventType = "git";
    // Check if this is a GitHub repository by looking at origin_url or repository_path
    if (
      event.origin_url?.includes("github.com") ||
      event.repository_path?.includes("github.com")
    ) {
      eventType = "browser_history";
      browserAggregateType = "code_repo";
      domain = "github.com";
    }
  } else if (isAggregatedGitEvent(event)) {
    title = event.repository_name;
    eventType = "git";
    // Check if this is a GitHub repository
    const firstActivity = event.activities[0];
    if (firstActivity) {
      try {
        const data = JSON.parse(firstActivity.type_specific_data || "{}");
        if (data.origin_url?.includes("github.com")) {
          eventType = "browser_history";
          browserAggregateType = "code_repo";
          domain = "github.com";
        }
      } catch {
        // Ignore parse errors
      }
    }
  } else if (isAggregatedBrowserEvent(event)) {
    title = event.title;
    eventType = "browser_history";
    browserAggregateType = event.aggregate_type;
    domain = event.domain;
  } else {
    title = event.title;
    eventType = event.event_type;
  }

  const Icon = getEventIcon(eventType, browserAggregateType, domain);

  return (
    <div className="flex items-start gap-2">
      <Icon
        className="h-5 w-5 mt-0.75 text-muted-foreground shrink-0"
        size={20}
      />
      <span className="font-semibold text-lg">{title}</span>
    </div>
  );
}

interface EventDateTimeProps {
  startDate: string;
  endDate: string;
}

export function EventDateTime({ startDate, endDate }: EventDateTimeProps) {
  return (
    <div className="text-base text-muted-foreground">
      {formatDateLong(startDate)} {formatEventTime(startDate)} -{" "}
      {formatEventTime(endDate)}
    </div>
  );
}

interface EventProjectSelectorProps {
  projects: Project[];
  selectedProjectId: number | null;
  isAssigning: boolean;
  onProjectSelect: (projectId: number) => void;
  onUnassign: () => void;
  onCreateRule?: () => void;
}

export function EventProjectSelector({
  projects,
  selectedProjectId,
  isAssigning,
  onProjectSelect,
  onUnassign,
  onCreateRule,
}: EventProjectSelectorProps) {
  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null;

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No projects available. Create one in Settings first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={!selectedProjectId ? "secondary" : "outline"}
        size="sm"
        onClick={onUnassign}
        disabled={isAssigning}
        className="h-8"
      >
        {!selectedProjectId && <Check className="h-4 w-4 mr-2" />}
        None
      </Button>
      {projects.map((project) => (
        <Button
          key={project.id}
          variant="default"
          size="sm"
          onClick={() => onProjectSelect(project.id!)}
          disabled={isAssigning}
          style={{
            backgroundColor: project.color || "#3B82F6",
            color: getContrastingTextColor(project.color),
          }}
          className="h-8 px-3"
        >
          {selectedProjectId === project.id && (
            <Check className="h-4 w-4 mr-2" />
          )}
          {project.name}
        </Button>
      ))}
      {onCreateRule && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateRule}
          disabled={!selectedProject}
          className="h-8"
        >
          Create Rule
        </Button>
      )}
    </div>
  );
}

interface EventContentProps {
  event:
    | StoredEvent
    | AggregatedGitEvent
    | AggregatedBrowserEvent
    | AggregatedRepositoryEvent;
  onAssignmentComplete?: () => void;
  showHeader?: boolean;
}

export function EventContent({
  event,
  onAssignmentComplete,
  showHeader = false,
}: EventContentProps) {
  const { openRuleDialog } = useRuleDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    event.project_id || null
  );
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    setSelectedProjectId(event.project_id || null);
  }, [event]);

  async function loadProjects() {
    try {
      const allProjects = await invoke<Project[]>("get_all_projects");
      setProjects(allProjects);
    } catch (err) {
      console.error("Error loading projects:", err);
      setError(err as string);
    }
  }

  async function handleAssign(projectId: number) {
    setIsAssigning(true);
    setError(null);

    try {
      if (isAggregatedRepositoryEvent(event)) {
        // Assign all git activities and browser visits
        const allEvents = [...event.git_activities, ...event.browser_visits];
        await Promise.all(
          allEvents.map((evt) =>
            invoke("assign_event_to_project", {
              eventId: evt.id,
              projectId: projectId,
            })
          )
        );
      } else if (isAggregatedGitEvent(event)) {
        await Promise.all(
          event.activities.map((activity) =>
            invoke("assign_event_to_project", {
              eventId: activity.id,
              projectId: projectId,
            })
          )
        );
      } else if (isAggregatedBrowserEvent(event)) {
        await Promise.all(
          event.visits.map((visit) =>
            invoke("assign_event_to_project", {
              eventId: visit.id,
              projectId: projectId,
            })
          )
        );
      } else {
        await invoke("assign_event_to_project", {
          eventId: event.id,
          projectId: projectId,
        });
      }

      setSelectedProjectId(projectId);
      if (onAssignmentComplete) {
        onAssignmentComplete();
      }
    } catch (err) {
      console.error("Error assigning event:", err);
      setError(err as string);
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleUnassign() {
    setIsAssigning(true);
    setError(null);

    try {
      if (isAggregatedRepositoryEvent(event)) {
        // Unassign all git activities and browser visits
        const allEvents = [...event.git_activities, ...event.browser_visits];
        await Promise.all(
          allEvents.map((evt) =>
            invoke("assign_event_to_project", {
              eventId: evt.id,
              projectId: null,
            })
          )
        );
      } else if (isAggregatedGitEvent(event)) {
        await Promise.all(
          event.activities.map((activity) =>
            invoke("assign_event_to_project", {
              eventId: activity.id,
              projectId: null,
            })
          )
        );
      } else if (isAggregatedBrowserEvent(event)) {
        await Promise.all(
          event.visits.map((visit) =>
            invoke("assign_event_to_project", {
              eventId: visit.id,
              projectId: null,
            })
          )
        );
      } else {
        await invoke("assign_event_to_project", {
          eventId: event.id,
          projectId: null,
        });
      }

      setSelectedProjectId(null);
      if (onAssignmentComplete) {
        onAssignmentComplete();
      }
    } catch (err) {
      console.error("Error unassigning event:", err);
      setError(err as string);
    } finally {
      setIsAssigning(false);
    }
  }

  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null;

  function handleCreateRule() {
    if (selectedProject) {
      let eventForRule: StoredEvent;
      if (isAggregatedRepositoryEvent(event)) {
        // Prefer git activities, fallback to browser visits
        eventForRule = event.git_activities[0] || event.browser_visits[0];
      } else if (isAggregatedGitEvent(event)) {
        eventForRule = event.activities[0];
      } else if (isAggregatedBrowserEvent(event)) {
        eventForRule = event.visits[0];
      } else {
        eventForRule = event;
      }
      openRuleDialog(selectedProject, eventForRule, onAssignmentComplete);
    }
  }

  return (
    <div className="space-y-4">
      {showHeader && <EventHeader event={event} />}

      <EventDateTime startDate={event.start_date} endDate={event.end_date} />

      <div>
        <EventProjectSelector
          projects={projects}
          selectedProjectId={selectedProjectId}
          isAssigning={isAssigning}
          onProjectSelect={handleAssign}
          onUnassign={handleUnassign}
          onCreateRule={handleCreateRule}
        />
      </div>

      <EventDetails event={event} />

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive text-destructive rounded-md text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

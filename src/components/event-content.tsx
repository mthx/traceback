import { EventDetails } from "@/components/event-details";
import { Button } from "@/components/ui/button";
import type { Project, UIEvent } from "@/types/event";
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
    if (browserAggregateType === "document" && domain) {
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
  event: UIEvent;
}

export function EventHeader({ event }: EventHeaderProps) {
  const title = event.title;
  let eventType =
    event.type === "repository" || event.type === "git"
      ? "git"
      : event.type === "browser"
        ? "browser_history"
        : "calendar";
  let browserAggregateType = event.aggregate_type;
  let domain = event.domain;

  // Special handling for repository events that are GitHub repos
  if (event.type === "repository") {
    if (
      event.origin_url?.includes("github.com") ||
      event.repository_path?.includes("github.com")
    ) {
      eventType = "browser_history";
      browserAggregateType = "code_repo";
      domain = "github.com";
    }
  } else if (event.type === "git") {
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
  event: UIEvent;
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
      await Promise.all(
        event.activities.map((activity) =>
          invoke("assign_event_to_project", {
            eventId: activity.id,
            projectId: projectId,
          })
        )
      );

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
      await Promise.all(
        event.activities.map((activity) =>
          invoke("assign_event_to_project", {
            eventId: activity.id,
            projectId: null,
          })
        )
      );

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
    if (selectedProject && event.activities.length > 0) {
      openRuleDialog(
        selectedProject,
        event.activities[0],
        onAssignmentComplete
      );
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

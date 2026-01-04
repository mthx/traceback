import {
  DropboxIcon,
  GitHubIcon,
  GoogleDocsIcon,
  NotionIcon,
} from "@/components/brand-icons";
import { formatDateLong, formatEventTime } from "@/components/calendar-utils";
import { EventDetails } from "@/components/event-details";
import { Button } from "@/components/ui/button";
import { useRuleDialog } from "@/contexts/rule-dialog-context";
import type { Project, UIEvent } from "@/types/event";
import { invoke } from "@tauri-apps/api/core";
import {
  Calendar,
  Check,
  FileText,
  Globe,
  KanbanSquare,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

type IconComponent =
  | LucideIcon
  | ComponentType<{ className?: string; size?: number }>;

function getPlatformIcon(domain?: string): IconComponent {
  if (domain?.includes("dropbox.com")) {
    return DropboxIcon;
  } else if (domain === "docs.google.com") {
    return GoogleDocsIcon;
  } else if (domain?.includes("notion.")) {
    return NotionIcon;
  } else if (domain?.includes("monday.com")) {
    return KanbanSquare;
  }
  return FileText;
}

// Get the appropriate icon for an event type or browser aggregate
export function getEventIcon(event: UIEvent): IconComponent {
  switch (event.type) {
    case "calendar":
      return Calendar;
    case "document":
      return getPlatformIcon(event.domain);
    case "repository":
      return GitHubIcon;
    case "research":
      return Globe;
    default:
      throw new Error();
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
  const Icon = getEventIcon(event);
  return (
    <div className="flex items-start gap-2">
      <Icon
        className="h-5 w-5 mt-0.75 text-muted-foreground shrink-0"
        size={20}
      />
      <span className="font-semibold text-lg">{event.title}</span>
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

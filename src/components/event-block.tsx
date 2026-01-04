import type {
  StoredEvent,
  Project,
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
} from "@/types/event";
import { parseEventData } from "@/types/event";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CalendarEventTooltipContent,
  GitAggregateTooltipContent,
  BrowserAggregateTooltipContent,
  RepositoryAggregateTooltipContent,
} from "@/components/event-tooltip-content";
import {
  getEventColor,
  getEventBlockStyle,
  formatEventTime,
} from "./calendar-utils";

interface EventBlockProps {
  event?: StoredEvent;
  gitAggregate?: AggregatedGitEvent;
  browserAggregate?: AggregatedBrowserEvent;
  repositoryAggregate?: AggregatedRepositoryEvent;
  projectMap?: Map<number, Project>;
  position?: {
    top?: string | number;
    height?: string | number;
    left?: string;
    width?: string;
  };
  onClick: () => void;
  onAssignmentComplete?: () => void;
  className?: string;
}

export function EventBlock({
  event,
  gitAggregate,
  browserAggregate,
  repositoryAggregate,
  projectMap,
  position,
  onClick,
  onAssignmentComplete,
  className = "",
}: EventBlockProps) {
  if (repositoryAggregate) {
    // Repository aggregate event (unified git + browser)
    const project =
      repositoryAggregate.project_id && projectMap
        ? projectMap.get(repositoryAggregate.project_id)
        : null;
    const eventColor = project?.color || "#94a3b8";
    const style = getEventBlockStyle(eventColor, position);

    const activityCount =
      repositoryAggregate.git_activities.length +
      repositoryAggregate.browser_visits.length;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`absolute rounded p-1 overflow-hidden ${className}`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <div className="text-xs font-semibold truncate">
              {repositoryAggregate.repository_name}
            </div>
            <div className="text-xs text-muted-foreground">
              {activityCount} {activityCount === 1 ? "activity" : "activities"}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="max-w-md max-h-96 overflow-y-auto"
        >
          <RepositoryAggregateTooltipContent
            aggregate={repositoryAggregate}
            onAssignmentComplete={onAssignmentComplete}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (browserAggregate) {
    // Browser aggregate event
    const project =
      browserAggregate.project_id && projectMap
        ? projectMap.get(browserAggregate.project_id)
        : null;
    const eventColor = project?.color || "#94a3b8"; // grey for unassigned events
    const style = getEventBlockStyle(eventColor, position);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`absolute rounded p-1 overflow-hidden ${className}`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <div className="text-xs font-semibold truncate">
              {browserAggregate.domain === "github.com"
                ? browserAggregate.title.split("/").pop()
                : browserAggregate.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {browserAggregate.visits.length}{" "}
              {browserAggregate.visits.length === 1 ? "visit" : "visits"}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="max-w-md max-h-96 overflow-y-auto"
        >
          <BrowserAggregateTooltipContent
            aggregate={browserAggregate}
            onAssignmentComplete={onAssignmentComplete}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (gitAggregate) {
    // Git aggregate event
    const project =
      gitAggregate.project_id && projectMap
        ? projectMap.get(gitAggregate.project_id)
        : null;
    const eventColor = project?.color || "#94a3b8";
    const style = getEventBlockStyle(eventColor, position);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`absolute rounded p-1 overflow-hidden ${className}`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <div className="text-xs font-semibold truncate">
              {gitAggregate.repository_name.split("/").pop()}
            </div>
            <div className="text-xs text-muted-foreground">
              {gitAggregate.activities.length}{" "}
              {gitAggregate.activities.length === 1 ? "activity" : "activities"}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="max-w-md max-h-96 overflow-y-auto"
        >
          <GitAggregateTooltipContent
            aggregate={gitAggregate}
            onAssignmentComplete={onAssignmentComplete}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (event) {
    // Calendar event
    const eventData = parseEventData(event);
    const eventColor = getEventColor(event, projectMap);
    const style = getEventBlockStyle(eventColor, position);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`absolute rounded p-1 overflow-hidden ${className}`}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <div className="text-xs font-semibold truncate">{event.title}</div>
            <div className="text-xs text-muted-foreground">
              {formatEventTime(event.start_date)}
            </div>
            {eventData?.location && (
              <div className="text-xs text-muted-foreground truncate">
                {eventData.location}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          sideOffset={8}
          className="max-w-md max-h-96 overflow-y-auto"
        >
          <CalendarEventTooltipContent
            event={event}
            onAssignmentComplete={onAssignmentComplete}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

import type { Project, UIEvent } from "@/types/event";
import { parseEventData } from "@/types/event";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarEventTooltipContent } from "@/components/event-tooltip-content";
import {
  getEventColor,
  getEventBlockStyle,
  formatEventTime,
} from "./calendar-utils";

interface EventBlockProps {
  event: UIEvent;
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
  projectMap,
  position,
  onClick,
  onAssignmentComplete,
  className = "",
}: EventBlockProps) {
  const project =
    event.project_id && projectMap ? projectMap.get(event.project_id) : null;
  const eventColor = project?.color || "#94a3b8";
  const style = getEventBlockStyle(eventColor, position);

  if (event.type === "repository") {
    const activityCount = event.activities.length;

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
              {event.repository_name}
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
          <CalendarEventTooltipContent
            event={event}
            onAssignmentComplete={onAssignmentComplete}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (event.type === "browser") {
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
              {event.domain === "github.com"
                ? event.title.split("/").pop()
                : event.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {event.activities.length}{" "}
              {event.activities.length === 1 ? "visit" : "visits"}
            </div>
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

  if (event.type === "git") {
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
              {event.repository_name?.split("/").pop() || event.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {event.activities.length}{" "}
              {event.activities.length === 1 ? "activity" : "activities"}
            </div>
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

  // Calendar event
  const eventData = parseEventData(event.activities[0]);
  const storedEventColor = getEventColor(event.activities[0], projectMap);
  const calendarStyle = getEventBlockStyle(storedEventColor, position);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`absolute rounded p-1 overflow-hidden ${className}`}
          style={calendarStyle}
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

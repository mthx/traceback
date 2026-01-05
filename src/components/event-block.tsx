import { EventTooltipContent } from "@/components/event-tooltip-content";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Project, UIEvent } from "@/types/event";
import { getEventBlockStyle, NEUTRAL_COLOR } from "./calendar-utils";

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
  const eventColor = project?.color || NEUTRAL_COLOR;
  const style = getEventBlockStyle(eventColor, position);
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
          <div className="text-xs font-semibold truncate">{event.title}</div>
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
        <EventTooltipContent
          event={event}
          onAssignmentComplete={onAssignmentComplete}
        />
      </TooltipContent>
    </Tooltip>
  );
}

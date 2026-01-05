import type { Project, UIEvent } from "@/types/event";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EventTooltipContent } from "@/components/event-tooltip-content";
import {
  getEventBlockStyle,
  formatEventTime,
  NEUTRAL_COLOR,
} from "./calendar-utils";

interface MonthEventBlockProps {
  event: UIEvent;
  projectMap?: Map<number, Project>;
  onClick: () => void;
  onAssignmentComplete?: () => void;
}

export function MonthEventBlock({
  event,
  projectMap,
  onClick,
  onAssignmentComplete,
}: MonthEventBlockProps) {
  const project =
    event.project_id && projectMap ? projectMap.get(event.project_id) : null;
  const eventColor = project?.color || NEUTRAL_COLOR;
  const style = getEventBlockStyle(eventColor);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="text-[10px] leading-tight rounded px-1 py-0.5 truncate mb-0.5"
          style={{
            ...style,
            borderLeft: `2px solid ${eventColor}`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <span className="font-medium">
            {formatEventTime(event.start_date)}
          </span>{" "}
          {event.title}
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

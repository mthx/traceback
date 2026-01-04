import type { Project, UIEvent } from "@/types/event";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarEventTooltipContent } from "@/components/event-tooltip-content";
import { getEventBlockStyle, formatEventTime } from "./calendar-utils";

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
  const eventColor = project?.color || "#94a3b8";
  const style = getEventBlockStyle(eventColor);

  let displayTitle = event.title;
  if (event.type === "repository") {
    displayTitle = event.repository_name || event.title;
  } else if (event.type === "git") {
    displayTitle = event.repository_name?.split("/").pop() || event.title;
  }

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
          {displayTitle}
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

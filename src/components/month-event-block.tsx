import type {
  StoredEvent,
  Project,
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
} from "@/types/event";
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
import { useRuleDialog } from "@/contexts/rule-dialog-context";

interface MonthEventBlockProps {
  event?: StoredEvent;
  gitAggregate?: AggregatedGitEvent;
  browserAggregate?: AggregatedBrowserEvent;
  repositoryAggregate?: AggregatedRepositoryEvent;
  projectMap?: Map<number, Project>;
  onClick: () => void;
  onAssignmentComplete?: () => void;
}

export function MonthEventBlock({
  event,
  gitAggregate,
  browserAggregate,
  repositoryAggregate,
  projectMap,
  onClick,
  onAssignmentComplete,
}: MonthEventBlockProps) {
  const { openRuleDialog } = useRuleDialog();

  if (repositoryAggregate) {
    // Repository aggregate (unified git + browser)
    const eventColor = getEventColor(repositoryAggregate, projectMap);
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
              {formatEventTime(repositoryAggregate.start_date)}
            </span>{" "}
            {repositoryAggregate.repository_name}
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
            onCreateRule={(project, event) =>
              openRuleDialog(project, event, onAssignmentComplete)
            }
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (browserAggregate) {
    // Browser aggregate
    const eventColor = getEventColor(browserAggregate, projectMap);
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
              {formatEventTime(browserAggregate.start_date)}
            </span>{" "}
            {browserAggregate.title}
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
            onCreateRule={(project, event) =>
              openRuleDialog(project, event, onAssignmentComplete)
            }
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (gitAggregate) {
    // Git aggregate event
    const eventColor = getEventColor(gitAggregate, projectMap);
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
              {formatEventTime(gitAggregate.start_date)}
            </span>{" "}
            {gitAggregate.repository_name.split("/").pop()}
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
            onCreateRule={(project, event) =>
              openRuleDialog(project, event, onAssignmentComplete)
            }
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (event) {
    // Calendar event
    const eventColor = getEventColor(event, projectMap);
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
          <CalendarEventTooltipContent
            event={event}
            onAssignmentComplete={onAssignmentComplete}
            onCreateRule={(project, event) =>
              openRuleDialog(project, event, onAssignmentComplete)
            }
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

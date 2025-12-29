import { EventContent, EventHeader } from "@/components/event-content";
import type {
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
  Project,
  StoredEvent,
} from "@/types/event";

interface CalendarEventTooltipContentProps {
  event: StoredEvent;
  onAssignmentComplete?: () => void;
  onCreateRule?: (project: Project, event: StoredEvent) => void;
}

export function CalendarEventTooltipContent({
  event,
  onAssignmentComplete,
  onCreateRule,
}: CalendarEventTooltipContentProps) {
  return (
    <div className="space-y-3">
      <EventHeader event={event} />
      <EventContent
        event={event}
        onAssignmentComplete={onAssignmentComplete}
        onCreateRule={onCreateRule}
      />
    </div>
  );
}

interface GitAggregateTooltipContentProps {
  aggregate: AggregatedGitEvent;
  onAssignmentComplete?: () => void;
  onCreateRule?: (project: Project, event: StoredEvent) => void;
}

export function GitAggregateTooltipContent({
  aggregate,
  onAssignmentComplete,
  onCreateRule,
}: GitAggregateTooltipContentProps) {
  return (
    <div className="space-y-3">
      <EventHeader event={aggregate} />
      <EventContent
        event={aggregate}
        onAssignmentComplete={onAssignmentComplete}
        onCreateRule={onCreateRule}
      />
    </div>
  );
}

interface RepositoryAggregateTooltipContentProps {
  aggregate: AggregatedRepositoryEvent;
  onAssignmentComplete?: () => void;
  onCreateRule?: (project: Project, event: StoredEvent) => void;
}

export function RepositoryAggregateTooltipContent({
  aggregate,
  onAssignmentComplete,
  onCreateRule,
}: RepositoryAggregateTooltipContentProps) {
  return (
    <div className="space-y-3">
      <EventHeader event={aggregate} />
      <EventContent
        event={aggregate}
        onAssignmentComplete={onAssignmentComplete}
        onCreateRule={onCreateRule}
      />
    </div>
  );
}

interface BrowserAggregateTooltipContentProps {
  aggregate: AggregatedBrowserEvent;
  onAssignmentComplete?: () => void;
}

export function BrowserAggregateTooltipContent({
  aggregate,
  onAssignmentComplete,
}: BrowserAggregateTooltipContentProps) {
  return (
    <div className="space-y-3">
      <EventHeader event={aggregate} />
      <EventContent
        event={aggregate}
        onAssignmentComplete={onAssignmentComplete}
      />
    </div>
  );
}

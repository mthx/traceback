import { EventContent, EventHeader } from "@/components/event-content";
import type {
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
  StoredEvent,
} from "@/types/event";

interface CalendarEventTooltipContentProps {
  event: StoredEvent;
  onAssignmentComplete?: () => void;
}

export function CalendarEventTooltipContent({
  event,
  onAssignmentComplete,
}: CalendarEventTooltipContentProps) {
  return (
    <div className="space-y-3">
      <EventHeader event={event} />
      <EventContent event={event} onAssignmentComplete={onAssignmentComplete} />
    </div>
  );
}

interface GitAggregateTooltipContentProps {
  aggregate: AggregatedGitEvent;
  onAssignmentComplete?: () => void;
}

export function GitAggregateTooltipContent({
  aggregate,
  onAssignmentComplete,
}: GitAggregateTooltipContentProps) {
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

interface RepositoryAggregateTooltipContentProps {
  aggregate: AggregatedRepositoryEvent;
  onAssignmentComplete?: () => void;
}

export function RepositoryAggregateTooltipContent({
  aggregate,
  onAssignmentComplete,
}: RepositoryAggregateTooltipContentProps) {
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

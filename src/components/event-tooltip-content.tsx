import { EventContent, EventHeader } from "@/components/event-content";
import type { UIEvent } from "@/types/event";

interface CalendarEventTooltipContentProps {
  event: UIEvent;
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

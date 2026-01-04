import { EventContent, EventHeader } from "@/components/event-content";
import type { UIEvent } from "@/types/event";

interface EventTooltipContentProps {
  event: UIEvent;
  onAssignmentComplete?: () => void;
}

export function EventTooltipContent({
  event,
  onAssignmentComplete,
}: EventTooltipContentProps) {
  return (
    <div className="space-y-3">
      <EventHeader event={event} />
      <EventContent event={event} onAssignmentComplete={onAssignmentComplete} />
    </div>
  );
}

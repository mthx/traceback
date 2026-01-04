import { EventContent, EventHeader } from "@/components/event-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UIEvent } from "@/types/event";

interface EventDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: UIEvent | null;
  onAssignmentComplete: () => void;
}

export function EventDetailsDialog({
  open,
  onOpenChange,
  event,
  onAssignmentComplete,
}: EventDetailsDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 pb-6 gap-2">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>
            <EventHeader event={event} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <EventContent
            event={event}
            onAssignmentComplete={onAssignmentComplete}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

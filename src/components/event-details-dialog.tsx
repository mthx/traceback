import { EventContent, EventHeader } from "@/components/event-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRuleDialog } from "@/contexts/rule-dialog-context";
import type {
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
  Project,
  StoredEvent,
} from "@/types/event";

interface EventDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event:
    | StoredEvent
    | AggregatedGitEvent
    | AggregatedBrowserEvent
    | AggregatedRepositoryEvent
    | null;
  onAssignmentComplete: () => void;
}

export function EventDetailsDialog({
  open,
  onOpenChange,
  event,
  onAssignmentComplete,
}: EventDetailsDialogProps) {
  const { openRuleDialog } = useRuleDialog();

  if (!event) return null;

  function handleCreateRule(project: Project, eventForRule: StoredEvent) {
    openRuleDialog(project, eventForRule, onAssignmentComplete);
  }

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
            onCreateRule={handleCreateRule}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

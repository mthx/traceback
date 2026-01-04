import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuleForm } from "@/components/rule-form";
import type { Project, ProjectRule, StoredEvent } from "../types/event";

interface RuleEditDialogProps {
  project: Project | null;
  rule: ProjectRule | null;
  event: StoredEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRuleSaved: () => void;
  projects?: Project[];
}

export function RuleEditDialog({
  project,
  rule,
  event,
  open,
  onOpenChange,
  onRuleSaved,
  projects = [],
}: RuleEditDialogProps) {
  async function handleSaved() {
    onRuleSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {rule ? "Edit Classification Rule" : "Add Classification Rule"}
          </DialogTitle>
          <DialogDescription>
            {rule
              ? "Update the rule to automatically assign events to a project"
              : "Create a rule to automatically assign events to a project"}
          </DialogDescription>
        </DialogHeader>
        <RuleForm
          project={project}
          rule={rule}
          event={event}
          projects={projects}
          onSaved={handleSaved}
          onCancel={() => onOpenChange(false)}
          showActions={true}
        />
      </DialogContent>
    </Dialog>
  );
}

import { EventDetailsDialog } from "@/components/event-details-dialog";
import { RuleEditDialog } from "@/components/rule-edit-dialog";
import type { Project, StoredEvent, UIEvent } from "@/types/event";
import { useProjects } from "@/contexts/projects-context";
import { createContext, useContext, useState, type ReactNode } from "react";

interface SharedDialogsContextValue {
  openRuleDialog: (
    project: Project,
    event: StoredEvent,
    onSaved?: () => void
  ) => Promise<void>;
  openEventDialog: (event: UIEvent, onAssignmentComplete?: () => void) => void;
}

const SharedDialogsContext = createContext<SharedDialogsContextValue | null>(
  null
);

export function useRuleDialog() {
  const context = useContext(SharedDialogsContext);
  if (!context) {
    throw new Error("useRuleDialog must be used within SharedDialogsProvider");
  }
  return context;
}

export function useEventDialog() {
  const context = useContext(SharedDialogsContext);
  if (!context) {
    throw new Error("useEventDialog must be used within SharedDialogsProvider");
  }
  return context;
}

interface SharedDialogsProviderProps {
  children: ReactNode;
}

export function SharedDialogsProvider({
  children,
}: SharedDialogsProviderProps) {
  const { projects } = useProjects();

  // Rule dialog state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleProject, setRuleProject] = useState<Project | null>(null);
  const [ruleEvent, setRuleEvent] = useState<StoredEvent | null>(null);
  const [ruleOnSaved, setRuleOnSaved] = useState<(() => void) | undefined>(
    undefined
  );

  // Event dialog state
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [dialogEvent, setDialogEvent] = useState<UIEvent | null>(null);
  const [eventOnComplete, setEventOnComplete] = useState<
    (() => void) | undefined
  >(undefined);

  async function openRuleDialog(
    project: Project,
    event: StoredEvent,
    onSaved?: () => void
  ) {
    setRuleProject(project);
    setRuleEvent(event);
    setRuleOnSaved(() => onSaved);
    setRuleDialogOpen(true);
  }

  function handleRuleSaved() {
    if (ruleOnSaved) {
      ruleOnSaved();
    }
    setRuleDialogOpen(false);
  }

  function openEventDialog(event: UIEvent, onAssignmentComplete?: () => void) {
    setDialogEvent(event);
    setEventOnComplete(() => onAssignmentComplete);
    setEventDialogOpen(true);
  }

  function handleEventAssignmentComplete() {
    if (eventOnComplete) {
      eventOnComplete();
    }
  }

  return (
    <SharedDialogsContext.Provider value={{ openRuleDialog, openEventDialog }}>
      {children}
      <RuleEditDialog
        project={ruleProject}
        rule={null}
        event={ruleEvent}
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        onRuleSaved={handleRuleSaved}
        projects={projects}
      />
      <EventDetailsDialog
        event={dialogEvent}
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        onAssignmentComplete={handleEventAssignmentComplete}
      />
    </SharedDialogsContext.Provider>
  );
}

// Re-export for backwards compatibility
export const RuleDialogProvider = SharedDialogsProvider;

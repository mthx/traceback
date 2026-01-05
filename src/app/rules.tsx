import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RuleForm } from "@/components/rule-form";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Trash2,
  SlidersHorizontal,
  RefreshCw,
  GripVertical,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useProjects } from "@/contexts/projects-context";
import type { Project, ProjectRule } from "../types/event";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableRuleItemProps {
  rule: ProjectRule;
  projects: Project[];
  isSelected: boolean;
  onClick: () => void;
  getRuleLabel: (rule: ProjectRule) => string;
  getProjectName: (projectId: number) => string;
  ruleRef: (el: HTMLButtonElement | null) => void;
}

function SortableRuleItem({
  rule,
  projects,
  isSelected,
  onClick,
  getRuleLabel,
  getProjectName,
  ruleRef,
}: SortableRuleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const project = projects.find((p) => p.id === rule.project_id);

  return (
    <div ref={setNodeRef} style={style}>
      <button
        data-rule-id={rule.id}
        ref={ruleRef}
        onClick={onClick}
        className={`relative w-full pl-8 pr-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus:bg-accent/70 focus:outline-none focus:before:absolute focus:before:left-0 focus:before:top-0 focus:before:bottom-0 focus:before:w-0.5 focus:before:bg-accent-foreground ${isSelected ? "bg-accent/70" : ""}`}
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <div className="font-medium truncate text-sm">
                {getRuleLabel(rule)}
              </div>
              {project && (
                <div
                  className="shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {getProjectName(rule.project_id)} •{" "}
              {rule.rule_type.replace("_", " ")} rule
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function DetailPanel({
  focusedRule,
  projects,
  onSaved,
  onDelete,
}: {
  focusedRule: ProjectRule | null;
  projects: Project[];
  onSaved: () => void;
  onDelete: (ruleId: number) => void;
}) {
  return (
    <div className="flex-2 flex flex-col min-w-80">
      {focusedRule ? (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Edit Rule</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => focusedRule.id && onDelete(focusedRule.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <RuleForm
              rule={focusedRule}
              projects={projects}
              onSaved={onSaved}
              showActions={true}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-8 text-center">
          <SlidersHorizontal className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm">Select a rule to view details</p>
        </div>
      )}
    </div>
  );
}

export function Rules() {
  const { projects } = useProjects();
  const [rules, setRules] = useState<ProjectRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [focusedRule, setFocusedRule] = useState<ProjectRule | null>(null);
  const [persistedFocusedRuleId, setPersistedFocusedRuleId] = usePersistedState<
    number | null
  >("rulesFocusedRuleId", null);
  const ruleRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const [applyingRules, setApplyingRules] = useState(false);
  const [applyRulesResult, setApplyRulesResult] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleFocusChange = () => {
      const focusedElement = document.activeElement as HTMLElement;

      const detailPanel = document.querySelector(".flex-2");
      if (detailPanel?.contains(focusedElement)) {
        return;
      }

      const ruleId = focusedElement?.dataset?.ruleId;
      const newFocusedRule = ruleId
        ? rules.find((r) => r.id === Number(ruleId)) || null
        : null;

      const currentId = focusedRule ? focusedRule.id : null;
      const newId = newFocusedRule ? newFocusedRule.id : null;

      if (currentId !== newId) {
        setFocusedRule(newFocusedRule);
        setPersistedFocusedRuleId(newId || null);
      }
    };

    document.addEventListener("focusin", handleFocusChange);
    return () => document.removeEventListener("focusin", handleFocusChange);
  }, [rules, focusedRule, setPersistedFocusedRuleId]);

  useEffect(() => {
    if (rules.length > 0 && !focusedRule && persistedFocusedRuleId) {
      const persistedRule = rules.find((r) => r.id === persistedFocusedRuleId);
      if (persistedRule) {
        const element = document.querySelector(
          `[data-rule-id="${persistedFocusedRuleId}"]`
        ) as HTMLElement;
        if (element) {
          element.focus();
        }
      }
    }
  }, [rules, focusedRule, persistedFocusedRuleId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (rules.length === 0) return;

      e.preventDefault();

      const focusedElement = document.activeElement as HTMLButtonElement;
      const currentRuleId = focusedElement?.dataset.ruleId;
      if (!currentRuleId) return;

      const currentIndex = rules.findIndex(
        (rule) => rule.id === Number(currentRuleId)
      );

      if (currentIndex === -1) return;

      let targetRule: ProjectRule | null = null;
      if (e.key === "ArrowDown" && currentIndex < rules.length - 1) {
        targetRule = rules[currentIndex + 1];
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        targetRule = rules[currentIndex - 1];
      }

      if (targetRule && targetRule.id) {
        const element = ruleRefs.current.get(targetRule.id);
        element?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rules]);

  async function fetchData() {
    setLoading(true);
    setError(null);

    try {
      const allRules = await invoke<ProjectRule[]>("get_project_rules", {
        projectId: null,
      });

      setRules(allRules);
    } catch (err) {
      setError(err as string);
      console.error("Error fetching rules:", err);
    } finally {
      setLoading(false);
    }
  }

  function openAddRuleDialog() {
    setIsAddDialogOpen(true);
  }

  async function handleRuleSaved() {
    setIsAddDialogOpen(false);
    await fetchData();
  }

  async function handleDeleteRule(ruleId: number) {
    try {
      await invoke("delete_project_rule", { ruleId });
      await fetchData();
    } catch (err) {
      setError(err as string);
      console.error("Error deleting rule:", err);
    }
  }

  function getRuleLabel(rule: ProjectRule): string {
    switch (rule.rule_type) {
      case "organizer":
        return `All events from: ${rule.match_value}`;
      case "title_pattern":
        return `All events containing: "${rule.match_value}"`;
      case "repository":
        return `All activity in: ${rule.match_value}`;
      default:
        return rule.match_value;
    }
  }

  function getProjectName(projectId: number): string {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  }

  async function handleApplyRules() {
    setApplyingRules(true);
    setApplyRulesResult(null);
    setError(null);

    try {
      const count = await invoke<number>("apply_rules_to_events");
      setApplyRulesResult(
        `Applied rules to ${count} event${count !== 1 ? "s" : ""}`
      );
      setTimeout(() => setApplyRulesResult(null), 3000);
    } catch (err) {
      setError(err as string);
      console.error("Error applying rules:", err);
    } finally {
      setApplyingRules(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = rules.findIndex((r) => r.id === active.id);
      const newIndex = rules.findIndex((r) => r.id === over.id);

      const newRules = arrayMove(rules, oldIndex, newIndex);
      setRules(newRules);

      try {
        await invoke("reorder_project_rules", {
          ruleIds: newRules.map((r) => r.id),
        });
      } catch (err) {
        setError(err as string);
        console.error("Error reordering rules:", err);
        await fetchData();
      }
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-3 flex flex-col border-r min-w-0">
        <div className="px-4 py-4 border-b">
          <div className="flex items-center justify-between">
            {applyRulesResult && (
              <span className="text-sm text-muted-foreground">
                {applyRulesResult}
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <Button onClick={openAddRuleDialog} size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Rule
              </Button>
              <Button
                onClick={handleApplyRules}
                size="sm"
                variant="outline"
                disabled={applyingRules || rules.length === 0}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${applyingRules ? "animate-spin" : ""}`}
                />
                {applyingRules ? "Applying..." : "Apply Rules"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-muted-foreground">Loading rules...</div>
          ) : error ? (
            <div className="p-4 text-destructive">{error}</div>
          ) : rules.length === 0 ? (
            <div className="p-4 text-muted-foreground">
              No rules configured yet. Add a rule to automatically classify
              events into projects.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={rules.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {rules.map((rule) => {
                    const isSelected = !!(
                      focusedRule && focusedRule.id === rule.id
                    );

                    return (
                      <SortableRuleItem
                        key={rule.id}
                        rule={rule}
                        projects={projects}
                        isSelected={isSelected}
                        onClick={() => {
                          const element = document.querySelector(
                            `[data-rule-id="${rule.id}"]`
                          ) as HTMLElement;
                          element?.focus();
                        }}
                        getRuleLabel={getRuleLabel}
                        getProjectName={getProjectName}
                        ruleRef={(el) => {
                          if (el && rule.id) {
                            ruleRefs.current.set(rule.id, el);
                          } else if (rule.id) {
                            ruleRefs.current.delete(rule.id);
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <DetailPanel
        focusedRule={focusedRule}
        projects={projects}
        onSaved={fetchData}
        onDelete={handleDeleteRule}
      />

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Classification Rule</DialogTitle>
            <DialogDescription>
              Create a rule to automatically assign events to a project
            </DialogDescription>
          </DialogHeader>
          <RuleForm
            projects={projects}
            onSaved={handleRuleSaved}
            onCancel={() => setIsAddDialogOpen(false)}
            showActions={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

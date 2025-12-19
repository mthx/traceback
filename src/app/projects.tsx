import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/color-picker";
import { MoreVertical, Pencil, Trash2, Plus } from "lucide-react";
import type { StoredEvent, Project, ProjectRule, AggregatedGitEvent, AggregatedBrowserEvent, AggregatedRepositoryEvent } from "../types/event";
import type { DateRange } from "../components/date-range-filter";
import { RuleEditDialog } from "../components/rule-edit-dialog";
import {
  CalendarViewProvider,
  CalendarDateLabel,
  CalendarControls,
  CalendarGrid,
  type CalendarViewType,
} from "../components/calendar-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventsList } from "@/components/events-list";
import { useEventDialog } from "@/contexts/rule-dialog-context";

type ProjectTab = "calendar" | "events" | "rules";

interface ProjectHeaderProps {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  showWeekendToggle?: boolean;
  showWeekends?: boolean;
  onShowWeekendsChange?: (show: boolean) => void;
}

function ProjectHeader({
  project,
  onEdit,
  onDelete,
  showWeekendToggle = false,
  showWeekends = false,
  onShowWeekendsChange,
}: ProjectHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-3">
        <div
          className="w-5 h-5 rounded-full shrink-0"
          style={{
            backgroundColor: project.color || "#0173B2",
          }}
        />
        <h1 className="text-xl font-semibold">{project.name}</h1>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {showWeekendToggle && onShowWeekendsChange && (
            <>
              <DropdownMenuItem
                onClick={() => onShowWeekendsChange(!showWeekends)}
              >
                {showWeekends ? "Hide Weekends" : "Show Weekends"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Project
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface ProjectsProps {
  projectId: number | null;
  projectTab: ProjectTab;
  onProjectTabChange: (tab: ProjectTab) => void;
  onProjectUpdated?: (deleted?: boolean) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  showWeekends: boolean;
  onShowWeekendsChange: (show: boolean) => void;
}

export function Projects({
  projectId,
  projectTab,
  onProjectTabChange,
  onProjectUpdated,
  dateRange,
  showWeekends,
  onShowWeekendsChange,
}: ProjectsProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [rules, setRules] = useState<ProjectRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", color: "#0173B2" });
  const [editingRule, setEditingRule] = useState<ProjectRule | null>(null);
  const [calendarViewType, setCalendarViewType] =
    useState<CalendarViewType>("week");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const { openEventDialog } = useEventDialog();

  useEffect(() => {
    if (projectId) {
      fetchProjectDetails();
    }
  }, [projectId, dateRange]);

  async function fetchProjectDetails() {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const [projectData, eventsData, rulesData] = await Promise.all([
        invoke<Project | null>("get_project", { id: projectId }),
        invoke<StoredEvent[]>("get_events_by_project", {
          projectId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
        invoke<ProjectRule[]>("get_project_rules", { projectId }),
      ]);

      setProject(projectData);
      setEvents(eventsData);
      setRules(rulesData);
    } catch (err) {
      setError(err as string);
      console.error("Error fetching project details:", err);
    } finally {
      setLoading(false);
    }
  }

  function openEditDialog() {
    if (project) {
      setFormData({
        name: project.name,
        color: project.color || "#0173B2",
      });
      setIsEditOpen(true);
    }
  }

  async function handleUpdateProject() {
    if (!project || !formData.name.trim()) return;

    try {
      await invoke("update_project", {
        id: project.id,
        name: formData.name,
        color: formData.color || null,
      });
      setIsEditOpen(false);
      await fetchProjectDetails();
      onProjectUpdated?.();
    } catch (err) {
      setError(err as string);
      console.error("Error updating project:", err);
    }
  }

  async function handleDeleteProject() {
    if (!project?.id) return;

    try {
      await invoke("delete_project", { id: project.id });
      setIsDeleteOpen(false);
      onProjectUpdated?.(true);
    } catch (err) {
      setError(err as string);
      console.error("Error deleting project:", err);
    }
  }

  function openAddRuleDialog() {
    setEditingRule(null);
    setIsRuleDialogOpen(true);
  }

  function openEditRuleDialog(rule: ProjectRule) {
    setEditingRule(rule);
    setIsRuleDialogOpen(true);
  }

  async function handleDeleteRule(ruleId: number) {
    try {
      await invoke("delete_project_rule", { ruleId });
      await fetchProjectDetails();
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

  const handleEventAssign = (event: StoredEvent | AggregatedGitEvent | AggregatedBrowserEvent | AggregatedRepositoryEvent) => {
    openEventDialog(event, fetchProjectDetails);
  };

  if (!projectId) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Select a project from the sidebar to view its details
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold text-destructive">Error</h1>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="px-4 pb-6">
        <h1 className="text-2xl font-semibold">Project not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          The selected project could not be found
        </p>
      </div>
    );
  }

  // Create a project map for the CalendarView
  const projectMap = project ? new Map([[project.id, project]]) : undefined;

  return (
    <div className="flex flex-col h-full">
      <Tabs
        value={projectTab}
        onValueChange={(value) => onProjectTabChange(value as ProjectTab)}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="flex items-center justify-center pt-3">
          <TabsList>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="calendar"
          className="flex-1 min-h-0 mt-0 flex flex-col"
        >
          {events.length === 0 ? (
            <>
              <ProjectHeader
                project={project}
                onEdit={openEditDialog}
                onDelete={() => setIsDeleteOpen(true)}
              />
              <p className="text-sm text-muted-foreground px-4 pt-2">
                No events tagged with this project yet.
              </p>
            </>
          ) : (
            <CalendarViewProvider
              events={events}
              viewType={calendarViewType}
              onViewTypeChange={setCalendarViewType}
              currentDate={calendarDate}
              onDateChange={setCalendarDate}
              projectMap={projectMap}
              showWeekends={showWeekends}
              onEventAssign={handleEventAssign}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="text-xl">
                    <CalendarDateLabel />
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarControls />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => onShowWeekendsChange(!showWeekends)}
                        >
                          {showWeekends ? "Hide Weekends" : "Show Weekends"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={openEditDialog}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Project
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setIsDeleteOpen(true)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <CalendarGrid />
                </div>
              </div>
            </CalendarViewProvider>
          )}
        </TabsContent>

        <TabsContent
          value="events"
          className="flex-1 min-h-0 mt-0 flex flex-col"
        >
          <ProjectHeader
            project={project}
            onEdit={openEditDialog}
            onDelete={() => setIsDeleteOpen(true)}
          />
          <div className="flex-1 min-h-0">
            <EventsList
              projectId={projectId}
              onEventAssign={fetchProjectDetails}
            />
          </div>
        </TabsContent>

        <TabsContent value="rules" className="flex-1 overflow-y-auto mt-0">
          <ProjectHeader
            project={project}
            onEdit={openEditDialog}
            onDelete={() => setIsDeleteOpen(true)}
          />
          <div className="space-y-4 px-4 pb-4">
            <div className="flex items-center justify-between">
              <Button onClick={openAddRuleDialog} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Rule
              </Button>
            </div>

            {rules.length === 0 ? (
              <div className="p-6 border border-dashed rounded-lg text-center">
                <p className="text-sm text-muted-foreground">
                  No rules configured yet. Add a rule to automatically classify
                  events.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {getRuleLabel(rule)}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {rule.rule_type.replace("_", " ")} rule
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditRuleDialog(rule)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => rule.id && handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Project Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update the project name and color
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder="Project name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <ColorPicker
                value={formData.color}
                onChange={(color) =>
                  setFormData({
                    ...formData,
                    color,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateProject}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{project?.name}"? This action
              cannot be undone. Events tagged with this project will not be
              deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProject}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RuleEditDialog
        project={project}
        rule={editingRule}
        event={null}
        open={isRuleDialogOpen}
        onOpenChange={setIsRuleDialogOpen}
        onRuleSaved={fetchProjectDetails}
      />
    </div>
  );
}

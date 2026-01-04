import { ColorPicker } from "@/components/color-picker";
import { LogView } from "@/components/log-view";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEventDialog } from "@/contexts/rule-dialog-context";
import { invoke } from "@tauri-apps/api/core";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CalendarControls,
  CalendarDateLabel,
  CalendarGrid,
  CalendarViewProvider,
  type CalendarViewType,
} from "../components/calendar-view";
import type { DateRange } from "../components/date-range-filter";
import type { Project, StoredEvent, UIEvent } from "../types/event";

type ProjectTab = "calendar" | "events";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", color: "#0173B2" });
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
      const [projectData, eventsData] = await Promise.all([
        invoke<Project | null>("get_project", { id: projectId }),
        invoke<StoredEvent[]>("get_events_by_project", {
          projectId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      ]);

      setProject(projectData);
      setEvents(eventsData);
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

  const handleEventAssign = (event: UIEvent) => {
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
            <TabsTrigger value="log">Log</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="log" className="flex-1 min-h-0 mt-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <LogView projectId={projectId} />
          </div>
        </TabsContent>
        <TabsContent
          value="calendar"
          className="flex-1 min-h-0 mt-0 flex flex-col"
        >
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 pt-2">
              No events tagged with this project yet.
            </p>
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
    </div>
  );
}

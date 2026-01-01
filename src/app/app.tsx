import {
  Calendar as CalendarIcon,
  Settings as SettingsIcon,
  List as ListIcon,
  Plus,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "../components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { ColorPicker } from "../components/color-picker";
import { invoke } from "@tauri-apps/api/core";
import type { Project } from "../types/event";
import { Calendar as CalendarPage } from "./calendar";
import { Log } from "./log";
import { Projects } from "./projects";
import { Settings } from "./settings";
import { useAutoSync } from "../hooks/useAutoSync";
import type { DateRange } from "../components/date-range-filter";
import { RuleDialogProvider } from "../contexts/rule-dialog-context";

type Page = "calendar" | "log" | "projects" | "settings";
type ProjectTab = "calendar" | "events" | "rules";

interface State {
  page: Page;
  selectedProjectId: number | null;
  projectTab: ProjectTab;
}

export function App() {
  const [state, setState] = useState<State>({
    page: "calendar",
    selectedProjectId: null,
    projectTab: "calendar",
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: "all",
    startDate: null,
    endDate: null,
  });
  const [showWeekends, setShowWeekends] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { page, selectedProjectId, projectTab } = state;
  const { permissionStatus, isChecking, syncCounter } = useAutoSync();

  // Load showWeekends setting from database on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const value = await invoke<string | null>("get_setting", {
          key: "showWeekends",
        });
        if (value !== null) {
          setShowWeekends(value === "true");
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      } finally {
        setSettingsLoaded(true);
      }
    }
    loadSettings();
  }, []);

  // Persist showWeekends to database whenever it changes (after initial load)
  useEffect(() => {
    if (!settingsLoaded) return;

    async function saveSettings() {
      try {
        await invoke("set_setting", {
          key: "showWeekends",
          value: showWeekends.toString(),
        });
      } catch (err) {
        console.error("Error saving settings:", err);
      }
    }
    saveSettings();
  }, [showWeekends, settingsLoaded]);

  // Fetch projects on mount and whenever sync completes
  useEffect(() => {
    fetchProjects();
  }, [syncCounter]);

  async function fetchProjects() {
    try {
      const result = await invoke<Project[]>("get_all_projects");
      setProjects(result);
    } catch (err) {
      console.error("Error fetching projects:", err);
    }
  }

  function handleProjectUpdated(deleted = false) {
    // Refresh projects
    fetchProjects();
    // If we're on a project view and it was deleted, go back to calendar
    if (deleted && page === "projects") {
      setState({
        page: "calendar",
        selectedProjectId: null,
        projectTab: "calendar",
      });
    }
  }

  async function handleFirstSync() {
    setSyncError(null);
    try {
      await invoke<number>("sync_all_sources");
      // syncCounter will increment automatically via useAutoSync
    } catch (err) {
      setSyncError(err as string);
      console.error("Error triggering sync:", err);
    }
  }

  const hasPermission = permissionStatus === "FullAccess";
  const showOnboarding = !hasPermission;

  return (
    <RuleDialogProvider>
      <div className="h-full relative">
        {/* Draggable title bar - absolutely positioned overlay */}
        <div
          data-tauri-drag-region
          className="absolute top-0 left-0 right-0 h-4 z-50 pointer-events-auto"
        />

        <SidebarProvider defaultOpen className="h-full">
          {showOnboarding ? (
            <main className="flex-1 overflow-y-auto h-full flex items-center justify-center p-8">
              <Card className="max-w-md">
                <CardHeader>
                  <CardTitle>Welcome to Traceback</CardTitle>
                  <CardDescription>
                    {isChecking
                      ? "Checking calendar permissions..."
                      : "Import your Mac Calendar events to start tracking time"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Click below to import your calendar events. This will
                      request permission to access your Mac Calendar.
                    </p>
                    <Button
                      onClick={handleFirstSync}
                      disabled={isChecking}
                      className="w-full"
                    >
                      Import Calendar Events
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      You'll be prompted to grant calendar access. Once granted,
                      events will sync automatically.
                    </p>
                    {syncError && (
                      <div className="border border-destructive rounded-md p-3 mt-4">
                        <p className="text-sm text-destructive font-medium">
                          Error
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {syncError}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Make sure to grant calendar permissions when prompted.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </main>
          ) : (
            <>
              <AppSidebar
                page={page}
                selectedProjectId={selectedProjectId}
                projects={projects}
                onChangePage={(page) =>
                  setState({
                    ...state,
                    page,
                    selectedProjectId: null,
                  })
                }
                onSelectProject={(projectId) =>
                  setState({
                    ...state,
                    page: "projects",
                    selectedProjectId: projectId,
                  })
                }
                onProjectCreated={fetchProjects}
              />
              <main className="flex-1 border-l overflow-y-auto h-full">
                {page === "calendar" && (
                  <CalendarPage
                    showWeekends={showWeekends}
                    onShowWeekendsChange={setShowWeekends}
                  />
                )}
                {page === "log" && <Log />}
                {page === "projects" && (
                  <Projects
                    projectId={selectedProjectId}
                    projectTab={projectTab}
                    onProjectTabChange={(tab) =>
                      setState({ ...state, projectTab: tab })
                    }
                    onProjectUpdated={handleProjectUpdated}
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                    showWeekends={showWeekends}
                    onShowWeekendsChange={setShowWeekends}
                  />
                )}
                {page === "settings" && <Settings />}
              </main>
            </>
          )}
        </SidebarProvider>
      </div>
    </RuleDialogProvider>
  );
}

type AppSidebarProps = {
  page: Page;
  selectedProjectId: number | null;
  projects: Project[];
  onChangePage: (page: Page) => void;
  onSelectProject: (projectId: number) => void;
  onProjectCreated: () => void;
};

export function AppSidebar({
  page,
  selectedProjectId,
  projects,
  onChangePage,
  onSelectProject,
  onProjectCreated,
}: AppSidebarProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", color: "#0173B2" });
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  async function handleCreateProject() {
    if (!formData.name.trim()) return;

    try {
      await invoke<number>("create_project", {
        name: formData.name,
        color: formData.color || null,
      });
      setFormData({ name: "", color: "#0173B2" });
      setIsCreateOpen(false);
      onProjectCreated();
    } catch (err) {
      console.error("Error creating project:", err);
    }
  }

  function closeDialog() {
    setIsCreateOpen(false);
    setFormData({ name: "", color: "#0173B2" });
  }

  return (
    <Sidebar variant="sidebar" collapsible="none" className="w-52 pt-5">
      <SidebarContent>
        {/* Main navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => onChangePage("calendar")}
                  isActive={page === "calendar"}
                >
                  <CalendarIcon />
                  <span>Calendar</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => onChangePage("log")}
                  isActive={page === "log"}
                >
                  <ListIcon />
                  <span>Log</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => onChangePage("settings")}
                  isActive={page === "settings"}
                >
                  <SettingsIcon />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Projects section */}
        <SidebarGroup>
          <SidebarGroupLabel>
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex w-full items-center gap-2"
            >
              <ChevronRight
                className={`transition-transform ${
                  projectsExpanded ? "rotate-90" : ""
                }`}
              />
              Projects
            </button>
          </SidebarGroupLabel>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <SidebarGroupAction title="Add Project">
                <Plus />
              </SidebarGroupAction>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>
                  Add a new project to organize your events
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Project name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <ColorPicker
                    value={formData.color}
                    onChange={(color) => setFormData({ ...formData, color })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={handleCreateProject}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {projectsExpanded && (
            <SidebarGroupContent>
              <SidebarMenu>
                {projects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      onClick={() => onSelectProject(project.id!)}
                      isActive={
                        page === "projects" && selectedProjectId === project.id
                      }
                      title={project.name}
                    >
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: project.color || "#0173B2",
                        }}
                      />
                      <span className="truncate">{project.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

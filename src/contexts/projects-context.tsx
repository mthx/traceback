import type { Project } from "@/types/event";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

interface ProjectsContextValue {
  projects: Project[];
  projectsMap: Map<number, Project>;
  loading: boolean;
  error: string | null;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return context;
}

interface ProjectsProviderProps {
  children: ReactNode;
}

export function ProjectsProvider({ children }: ProjectsProviderProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsMap, setProjectsMap] = useState<Map<number, Project>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchProjects() {
    try {
      const result = await invoke<Project[]>("get_all_projects");
      setProjects(result);
      setProjectsMap(new Map(result.map((p) => [p.id, p])));
      setError(null);
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err as string);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();

    // Listen for project changes from Rust
    const unlisten = listen("projects-changed", () => {
      fetchProjects();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <ProjectsContext.Provider value={{ projects, projectsMap, loading, error }}>
      {children}
    </ProjectsContext.Provider>
  );
}

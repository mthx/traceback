import { formatDateLong } from "@/components/calendar-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project, TimeAllocation } from "@/types/event";
import { invoke } from "@tauri-apps/api/core";
import { Check, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface TimeAllocationPanelProps {
  dateKey: string;
  projects: Map<number, Project>;
  dayProjectIds: Set<number>;
  onConfirmChanged: () => void;
}

export function TimeAllocationPanel({
  dateKey,
  projects,
  dayProjectIds,
  onConfirmChanged,
}: TimeAllocationPanelProps) {
  const [allocations, setAllocations] = useState<TimeAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const initializedRef = useRef<string | null>(null);

  useEffect(() => {
    loadAllocations();
  }, [dateKey]);

  async function loadAllocations() {
    setLoading(true);
    try {
      let rows = await invoke<TimeAllocation[]>("get_time_allocations", {
        dateKey,
      });

      if (rows.length === 0 && initializedRef.current !== dateKey) {
        initializedRef.current = dateKey;
        for (const projectId of dayProjectIds) {
          await invoke<number>("upsert_time_allocation", {
            dateKey,
            projectId,
            hours: 0,
          });
        }
        rows = await invoke<TimeAllocation[]>("get_time_allocations", {
          dateKey,
        });
      }

      setAllocations(rows);
      setConfirmed(rows.length > 0 && rows.every((r) => r.confirmed));
    } catch (err) {
      console.error("Error loading allocations:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleHoursChange(allocationId: number, hours: number) {
    const allocation = allocations.find((a) => a.id === allocationId);
    if (!allocation || allocation.hours === hours) return;

    try {
      await invoke<number>("upsert_time_allocation", {
        dateKey,
        projectId: allocation.project_id,
        hours,
      });
      setAllocations((prev) =>
        prev.map((a) => (a.id === allocationId ? { ...a, hours } : a))
      );
    } catch (err) {
      console.error("Error saving allocation:", err);
    }
  }

  async function handleAddProject(projectId: number) {
    try {
      const id = await invoke<number>("upsert_time_allocation", {
        dateKey,
        projectId,
        hours: 0,
      });
      setAllocations((prev) => [
        ...prev,
        {
          id,
          date_key: dateKey,
          project_id: projectId,
          hours: 0,
          confirmed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Error adding project allocation:", err);
    }
  }

  async function handleDelete(allocationId: number) {
    try {
      await invoke("delete_time_allocation", { id: allocationId });
      setAllocations((prev) => prev.filter((a) => a.id !== allocationId));
    } catch (err) {
      console.error("Error deleting allocation:", err);
    }
  }

  async function handleConfirmToggle() {
    const newConfirmed = !confirmed;
    try {
      await invoke("confirm_day_allocations", {
        dateKey,
        confirmed: newConfirmed,
      });
      setConfirmed(newConfirmed);
      setAllocations((prev) =>
        prev.map((a) => ({ ...a, confirmed: newConfirmed }))
      );
      onConfirmChanged();
    } catch (err) {
      console.error("Error confirming allocations:", err);
    }
  }

  const total = allocations.reduce((sum, a) => sum + a.hours, 0);

  const allocatedProjectIds = new Set(allocations.map((a) => a.project_id));
  const availableProjects = Array.from(projects.values()).filter(
    (p) => !allocatedProjectIds.has(p.id)
  );

  const date = new Date(dateKey);

  if (loading) {
    return (
      <div className="text-muted-foreground text-sm">
        Loading allocations...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {formatDateLong(date.toISOString())}
        </h2>
        <Button
          variant={confirmed ? "default" : "outline"}
          size="sm"
          onClick={handleConfirmToggle}
          disabled={allocations.length === 0}
        >
          <Check className="h-4 w-4 mr-1" />
          {confirmed ? "Confirmed" : "Confirm"}
        </Button>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_5rem_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
          <div>Project</div>
          <div className="text-right">Hours</div>
          <div />
        </div>

        {allocations.map((allocation) => {
          const project = projects.get(allocation.project_id);
          return (
            <AllocationRow
              key={allocation.id}
              allocation={allocation}
              projectName={project?.name ?? "Unknown"}
              projectColor={project?.color}
              confirmed={confirmed}
              onHoursChange={(hours) => handleHoursChange(allocation.id, hours)}
              onDelete={() => handleDelete(allocation.id)}
            />
          );
        })}

        {!confirmed && availableProjects.length > 0 && (
          <div className="pt-1">
            <Select onValueChange={(v) => handleAddProject(Number(v))}>
              <SelectTrigger className="h-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  <SelectValue placeholder="Add project" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-[1fr_5rem_2rem] gap-2 px-1 pt-2 border-t text-sm font-medium">
          <div>Total</div>
          <div className="text-right">{total > 0 ? total : ""}</div>
          <div />
        </div>
      </div>
    </div>
  );
}

function AllocationRow({
  allocation,
  projectName,
  projectColor,
  confirmed,
  onHoursChange,
  onDelete,
}: {
  allocation: TimeAllocation;
  projectName: string;
  projectColor?: string;
  confirmed: boolean;
  onHoursChange: (hours: number) => void;
  onDelete: () => void;
}) {
  const [localValue, setLocalValue] = useState(String(allocation.hours || ""));

  useEffect(() => {
    setLocalValue(String(allocation.hours || ""));
  }, [allocation.hours]);

  function handleBlur() {
    const parsed = parseFloat(localValue);
    const hours = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setLocalValue(String(hours || ""));
    onHoursChange(hours);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <div className="grid grid-cols-[1fr_5rem_2rem] gap-2 items-center px-1">
      <div className="flex items-center gap-2 text-sm truncate">
        {projectColor && (
          <div
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: projectColor }}
          />
        )}
        <span className="truncate">{projectName}</span>
      </div>
      {confirmed ? (
        <div className="text-sm text-right tabular-nums">
          {allocation.hours || ""}
        </div>
      ) : (
        <Input
          type="number"
          step="0.5"
          min="0"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="h-7 text-sm text-right tabular-nums px-2"
        />
      )}
      {confirmed ? (
        <div />
      ) : (
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-foreground p-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

import type { MonthAllocationSummary, Project } from "@/types/event";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

const HOURS_PER_DAY = 7.5;

function formatDays(days: number): string {
  return days % 1 === 0 ? String(days) : days.toFixed(1);
}

interface MonthAllocationPanelProps {
  yearMonth: string;
  projects: Map<number, Project>;
}

function formatMonthYear(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function MonthAllocationPanel({
  yearMonth,
  projects,
}: MonthAllocationPanelProps) {
  const [summaries, setSummaries] = useState<MonthAllocationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, [yearMonth]);

  async function loadSummary() {
    setLoading(true);
    try {
      const data = await invoke<MonthAllocationSummary[]>(
        "get_month_allocations",
        { yearMonth }
      );
      data.sort((a, b) => b.total_hours - a.total_hours);
      setSummaries(data);
    } catch (err) {
      console.error("Error loading month allocations:", err);
    } finally {
      setLoading(false);
    }
  }

  const total = summaries.reduce((sum, s) => sum + s.total_hours, 0);

  if (loading) {
    return (
      <div className="text-muted-foreground text-sm">Loading summary...</div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{formatMonthYear(yearMonth)}</h2>

      {summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No confirmed time allocations for this month.
        </p>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-1 text-xs font-medium text-muted-foreground">
            <div>Project</div>
            <div className="text-right">Hours</div>
            <div className="text-right">Days</div>
          </div>

          {summaries.map((summary) => {
            const project = projects.get(summary.project_id);
            const days = summary.total_hours / HOURS_PER_DAY;
            return (
              <div
                key={summary.project_id}
                className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center px-1"
              >
                <div className="flex items-center gap-2 text-sm truncate">
                  {project?.color && (
                    <div
                      className="shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                  )}
                  <span className="truncate">{project?.name ?? "Unknown"}</span>
                </div>
                <div className="text-sm text-right tabular-nums">
                  {summary.total_hours}
                </div>
                <div className="text-sm text-right tabular-nums">
                  {formatDays(days)}
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-1 pt-2 border-t text-sm font-medium">
            <div>Total</div>
            <div className="text-right tabular-nums">{total}</div>
            <div className="text-right tabular-nums">
              {formatDays(total / HOURS_PER_DAY)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

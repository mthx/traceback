import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "lucide-react";

export type DateRangePreset =
  | "today"
  | "week"
  | "month-to-date"
  | "last-month"
  | "all";

export interface DateRange {
  preset: DateRangePreset;
  startDate: string | null;
  endDate: string | null;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function getDateRangeLabel(preset: DateRangePreset): string {
  switch (preset) {
    case "today":
      return "Today";
    case "week":
      return "This week";
    case "month-to-date":
      return "Month to date";
    case "last-month":
      return "Last month";
    case "all":
      return "All time";
  }
}

function calculateDateRange(preset: DateRangePreset): {
  startDate: string | null;
  endDate: string | null;
} {
  const now = new Date();

  switch (preset) {
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
    case "week": {
      // Start of this week (Sunday)
      const dayOfWeek = now.getDay();
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - dayOfWeek
      );
      start.setHours(0, 0, 0, 0);

      // End of this week (Saturday)
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
    case "month-to-date": {
      // First day of current month to today
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
    case "last-month": {
      // First and last day of previous month
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
    case "all":
      return {
        startDate: null,
        endDate: null,
      };
  }
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  function handlePresetChange(preset: DateRangePreset) {
    const range = calculateDateRange(preset);
    onChange({
      preset,
      ...range,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" />
          {getDateRangeLabel(value.preset)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlePresetChange("today")}>
          Today
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePresetChange("week")}>
          This week
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePresetChange("month-to-date")}>
          Month to date
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePresetChange("last-month")}>
          Last month
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePresetChange("all")}>
          All time
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

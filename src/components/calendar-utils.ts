import type { Project } from "@/types/event";

// Define a neutral color for events without an assigned project
export const NEUTRAL_COLOR = "#94a3b8"; // Tailwind slate-400

export const HOUR_HEIGHT = 60;

export const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);

/**
 * Get the color for an event based on its project
 */
export function getEventColor(
  event: { project_id?: number | null },
  projectMap?: Map<number, Project>
): string {
  const project =
    event.project_id && projectMap ? projectMap.get(event.project_id) : null;
  return project?.color || NEUTRAL_COLOR;
}

/**
 * Get the style object for an event block
 */
export function getEventBlockStyle(
  eventColor: string,
  position?: {
    top?: string | number;
    height?: string | number;
    left?: string;
    width?: string;
  }
) {
  return {
    ...(position?.top !== undefined && {
      top:
        typeof position.top === "number" ? `${position.top}px` : position.top,
    }),
    ...(position?.height !== undefined && {
      height:
        typeof position.height === "number"
          ? `${position.height}px`
          : position.height,
    }),
    ...(position?.left && { left: position.left }),
    ...(position?.width && { width: position.width }),
    borderLeft: `3px solid ${eventColor}`,
    backgroundColor: `${eventColor}15`,
    borderTop: `1px solid ${eventColor}40`,
    borderRight: `1px solid ${eventColor}40`,
    borderBottom: `1px solid ${eventColor}40`,
  };
}

/**
 * Format event time for display (HH:MM, 24-hour)
 */
export function formatEventTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format full date with time for event display
 */
export function formatEventDateTime(date: Date | string): string {
  return new Date(date).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format date without time (long format with weekday)
 */
export function formatDateLong(date: Date | string): string {
  return new Date(date).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format date with full weekday and month names
 */
export function formatDateFull(date: Date | string): string {
  return new Date(date).toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format month and year
 */
export function formatMonthYear(date: Date | string): string {
  return new Date(date).toLocaleDateString([], {
    year: "numeric",
    month: "long",
  });
}

/**
 * Format month and day (long month)
 */
export function formatMonthDay(date: Date | string): string {
  return new Date(date).toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });
}

/**
 * Format month and day (short month)
 */
export function formatMonthDayShort(date: Date | string): string {
  return new Date(date).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format weekday name
 */
export function formatWeekday(date: Date | string, short = false): string {
  return new Date(date).toLocaleDateString([], {
    weekday: short ? "short" : "long",
  });
}

/**
 * Format month name only
 */
export function formatMonth(date: Date | string, short = false): string {
  return new Date(date).toLocaleDateString([], {
    month: short ? "short" : "long",
  });
}

/**
 * Format date as YYYY-MM-DD key for grouping
 */
export function formatDateKey(date: Date | string): string {
  return new Date(date).toISOString().split("T")[0];
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * CSS class for today indicator
 */
export const todayIndicatorClass =
  "bg-red-500 text-white rounded-full px-1 py-px inline-flex items-center justify-center";

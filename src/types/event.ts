import { formatDateKey } from "@/components/calendar-utils";

export interface StoredEvent {
  id: number;
  event_type: string;
  title: string;
  start_date: string;
  end_date: string;
  external_id?: string;
  external_link?: string;
  type_specific_data?: string;
  project_id?: number;
  organizer_id?: number;
  repository_path?: string;
  domain?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  name: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  color?: string;
  created_at: string;
}

export interface ProjectRule {
  id: number;
  project_id: number;
  rule_type:
    | "organizer"
    | "title_pattern"
    | "repository"
    | "url_pattern"
    | "domain";
  match_value: string;
  created_at: string;
}

export interface CalendarEventData {
  location?: string;
  notes?: string;
  is_all_day: boolean;
  organizer?: string;
  attendees?: string[];
}

export interface GitEventData {
  repository_id: string;
  repository_name: string;
  activity_type: string;
  ref_name?: string;
  commit_hash?: string;
  repository_path?: string; // Canonical org/repo path (e.g., "facebook/react")
  origin_url?: string; // Full remote origin URL
}

export interface BrowserHistoryEventData {
  url: string;
  domain: string;
  page_title?: string;
  visit_count: number;
  repository_path?: string; // Canonical org/repo path if this is a code repo visit
}

export interface WorkDomain {
  id: number;
  domain: string;
  created_at: string;
}

export interface SyncStatus {
  last_sync_time: string | null;
  sync_in_progress: boolean;
  updated_at: string;
}

export type CalendarPermissionStatus =
  | "FullAccess"
  | "Denied"
  | "Restricted"
  | "NotDetermined";

export function parseCalendarEventData(
  event: StoredEvent
): CalendarEventData | null {
  if (event.event_type !== "calendar" || !event.type_specific_data) {
    return null;
  }

  try {
    return JSON.parse(event.type_specific_data) as CalendarEventData;
  } catch {
    return null;
  }
}

export function parseGitEventData(event: StoredEvent): GitEventData | null {
  if (event.event_type !== "git" || !event.type_specific_data) {
    return null;
  }

  try {
    return JSON.parse(event.type_specific_data) as GitEventData;
  } catch {
    return null;
  }
}

export function parseBrowserEventData(
  event: StoredEvent
): BrowserHistoryEventData | null {
  if (event.event_type !== "browser_history" || !event.type_specific_data) {
    return null;
  }

  try {
    return JSON.parse(event.type_specific_data) as BrowserHistoryEventData;
  } catch {
    return null;
  }
}

// ============================================================================
// Repository Event Aggregation (Unified Git + GitHub browser history)
// ============================================================================

interface DocumentDomainConfigs {
  pattern: RegExp; // domain pattern to match
  // Extract a stable identifier for grouping visits (e.g., repo path, document title)
  extractGroupingKey: (url: string, pageTitle: string) => string | null;
  type: "document" | "research";
}

const documentDomainConfigs: DocumentDomainConfigs[] = [
  // Dropbox Paper (including www.dropbox.com paper links)
  {
    pattern: /^(paper\.dropbox\.com|www\.dropbox\.com)$/,
    extractGroupingKey: (url, pageTitle) => {
      // Filter out root domains, search pages, and folder views
      if (
        url === "https://paper.dropbox.com/" ||
        url === "https://paper.dropbox.com" ||
        url === "https://www.dropbox.com/" ||
        url === "https://www.dropbox.com" ||
        url.startsWith("https://www.dropbox.com/search") ||
        url.startsWith("https://www.dropbox.com/home") ||
        url.startsWith("https://www.dropbox.com/work")
      ) {
        return null;
      }

      // Clean and normalize the title
      let cleanTitle = pageTitle
        .replace(/ [–—-] Dropbox Paper$/, "")
        .replace(/ [–—-] Dropbox$/, "")
        .trim();

      // Filter out generic titles
      if (
        !cleanTitle ||
        cleanTitle === "Dropbox Paper" ||
        cleanTitle === "Dropbox" ||
        cleanTitle === "Files" ||
        cleanTitle === "Files - Dropbox" ||
        cleanTitle === "Search - Dropbox" ||
        cleanTitle.startsWith("Dropbox - ")
      ) {
        return null;
      }

      return cleanTitle;
    },
    type: "document",
  },
  // Google Docs/Sheets/Slides
  {
    pattern: /^docs\.google\.com$/,
    extractGroupingKey: (url, pageTitle) => {
      // Filter out root domain
      if (
        url === "https://docs.google.com/" ||
        url === "https://docs.google.com"
      ) {
        return null;
      }

      // Clean and normalize the title
      let cleanTitle = pageTitle
        .replace(/ - Google (Docs|Sheets|Slides)$/, "")
        .trim();

      // Filter out generic titles
      if (
        !cleanTitle ||
        cleanTitle.startsWith("Untitled") ||
        cleanTitle === "Google Docs" ||
        cleanTitle === "Google Sheets" ||
        cleanTitle === "Google Slides"
      ) {
        return null;
      }

      return cleanTitle;
    },
    type: "document",
  },
  // GitHub - basic/fallback handling for other repos
  {
    pattern: /^github\.com$/,
    extractGroupingKey: () => "GitHub",
    type: "research",
  },
  {
    pattern: /^claude\.ai$/,
    extractGroupingKey: (_url, page_title) =>
      page_title.replace("- Claude", ""),
    type: "research",
  },
  // Monday.com - boards and docs
  {
    pattern: /^.*\.monday\.com$/,
    extractGroupingKey: (url, pageTitle) => {
      // Filter out root domains
      if (
        url === "https://monday.com/" ||
        url === "https://monday.com" ||
        url.match(/^https:\/\/[^.]+\.monday\.com\/?$/)
      ) {
        return null;
      }

      // Check for boards
      const boardMatch = url.match(/\/boards\/(\d+)/);
      if (boardMatch) {
        return pageTitle || `Board ${boardMatch[1]}`;
      }

      // Check for docs
      const docMatch = url.match(/\/docs\/(\d+)/);
      if (docMatch) {
        // Clean up title if present
        let cleanTitle = pageTitle
          .replace(/ \| monday\.com$/, "")
          .replace(/ - monday\.com$/, "")
          .trim();

        // Use title if meaningful, otherwise use doc ID
        return cleanTitle || `Doc ${docMatch[1]}`;
      }

      // Other monday.com pages - use title or generic fallback
      if (!pageTitle || pageTitle === "monday.com") {
        return null;
      }

      return pageTitle;
    },
    type: "document",
  },
];

function classifyBrowserData(
  domain: string,
  url: string,
  pageTitle: string,
  githubOrgs: string[]
): { groupingKey: string; type: "document" | "research" } | null {
  if (isKnownGitHubRepo(url, githubOrgs)) {
    // The repository aggregation will handle it.
    return null;
  }
  for (const config of documentDomainConfigs) {
    if (config.pattern.test(domain)) {
      const key = config.extractGroupingKey(url, pageTitle);
      if (key) {
        return { groupingKey: key, type: config.type };
      }
    }
  }
  return null;
}

function isKnownGitHubRepo(url: string, githubOrgs: string[]): boolean {
  const match = url.match(/github\.com\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (!match) return false;

  const org = match[1];
  const repo = match[2];

  return githubOrgs.includes(org) && repo !== undefined;
}

function aggregateBrowserEvents(
  events: StoredEvent[],
  githubOrgs: string[] = []
): UIEvent[] {
  // Filter only browser_history events
  const browserEvents = events.filter(
    (e) => e.event_type === "browser_history"
  );

  // Group by grouping key + domain + day
  // groupingKey varies by platform: repo path for GitHub/GitLab, doc title for docs, etc.
  const byKeyDomainAndDay = new Map<string, StoredEvent[]>();

  for (const event of browserEvents) {
    const browserData = parseBrowserEventData(event);
    if (!browserData) continue;

    const classification = classifyBrowserData(
      browserData.domain,
      browserData.url,
      browserData.page_title || "",
      githubOrgs
    );

    // Skip if no config or groupingKey (not a recognized platform or filtered out), or will be handled in repository aggregates
    if (!classification) continue;

    const { groupingKey, type } = classification;

    const dateKey = formatDateKey(event.start_date);
    const key = `${type}:${browserData.domain}:${dateKey}:${groupingKey}`;

    if (!byKeyDomainAndDay.has(key)) {
      byKeyDomainAndDay.set(key, []);
    }
    byKeyDomainAndDay.get(key)!.push(event);
  }

  // Create aggregated events
  const aggregated: UIEvent[] = [];

  for (const [key, visits] of byKeyDomainAndDay.entries()) {
    if (visits.length === 0) continue;

    // Sort by time
    const sorted = visits.sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    // Extract groupingKey from composite key (type:domain:date:groupingKey)
    const parts = key.split(":");
    const groupingKey = parts.slice(3).join(":"); // Handle grouping keys with colons
    const type = parts[0] as "document" | "research";

    const firstVisit = sorted[0];
    // Find min start and max end times
    const visitTimes = visits.map((v) => new Date(v.start_date).getTime());
    const minStart = Math.min(...visitTimes);
    const maxEnd = Math.max(...visitTimes);

    // Apply buffers
    const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;

    // Start buffer: -15 min for collaborative docs, none for others
    const startBuffer = type === "document" ? FIFTEEN_MINUTES_MS : 0;
    const adjustedStart = minStart - startBuffer;

    // End buffer: +15 min (assume work continued)
    const adjustedEnd = maxEnd + FIFTEEN_MINUTES_MS;

    // Minimum span: 30 minutes for single visits
    const span = adjustedEnd - adjustedStart;
    const finalEnd =
      span < THIRTY_MINUTES_MS
        ? adjustedStart + THIRTY_MINUTES_MS
        : adjustedEnd;

    aggregated.push({
      id: key,
      type,
      title: groupingKey,
      start_date: new Date(adjustedStart).toISOString(),
      end_date: new Date(finalEnd).toISOString(),
      project_id: visits[0].project_id,
      is_all_day: false,
      activities: visits,
      domain: firstVisit.domain,
    });
  }

  return aggregated;
}

// ============================================================================
// Repository Event Aggregation Function
// ============================================================================

function aggregateRepositoryEvents(events: StoredEvent[]): {
  aggregated: UIEvent[];
  discoveredGitOrgs: string[];
} {
  // Filter events that have repository_path (git OR browser with repo path)
  const repoEvents = events.filter((e) => {
    if (e.event_type === "git") {
      const gitData = parseGitEventData(e);
      return gitData?.repository_path !== undefined;
    } else if (e.event_type === "browser_history") {
      const browserData = parseBrowserEventData(e);
      return browserData?.repository_path !== undefined;
    }
    return false;
  });
  const discoveredGitOrgs = new Set<string>();

  // Group by repository_path + day
  const byRepoAndDay = new Map<string, StoredEvent[]>();

  for (const event of repoEvents) {
    let repoPath: string | undefined;

    if (event.event_type === "git") {
      repoPath = parseGitEventData(event)?.repository_path;
    } else {
      repoPath = parseBrowserEventData(event)?.repository_path;
    }

    if (!repoPath) continue;

    discoveredGitOrgs.add(repoPath.split("/").shift()!);

    const dateKey = formatDateKey(event.start_date);
    const key = `${repoPath}:${dateKey}`;

    if (!byRepoAndDay.has(key)) {
      byRepoAndDay.set(key, []);
    }
    byRepoAndDay.get(key)!.push(event);
  }

  // Create aggregates combining git + browser
  const aggregated: UIEvent[] = [];

  for (const [key, allEvents] of byRepoAndDay) {
    const repoPath = key.split(":").slice(0, -1).join(":");

    const gitEvents = allEvents.filter((e) => e.event_type === "git");
    const browserEvents = allEvents.filter(
      (e) => e.event_type === "browser_history"
    );

    // Calculate time bounds
    const allTimes = allEvents.map((e) => new Date(e.start_date).getTime());
    let minStart = Math.min(...allTimes);
    const maxEnd = Math.max(
      ...allEvents.map((e) => new Date(e.end_date).getTime())
    );

    // Heuristic: extend start if first event is a commit (model pre-commit work)
    if (gitEvents.length > 0) {
      const sorted = gitEvents.sort(
        (a, b) =>
          new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
      );
      const firstGit = parseGitEventData(sorted[0]);
      if (firstGit?.activity_type === "commit") {
        minStart -= 30 * 60 * 1000; // -30 minutes
      }
    }

    // Get display name (prefer git repo name, fall back to last segment of path)
    const repoName =
      gitEvents.length > 0
        ? parseGitEventData(gitEvents[0])?.repository_name ||
          repoPath.split("/").pop() ||
          repoPath
        : repoPath.split("/").pop() || repoPath;

    // Get origin URL from git events if available
    const originUrl =
      gitEvents.length > 0
        ? parseGitEventData(gitEvents[0])?.origin_url
        : undefined;

    aggregated.push({
      id: `repo-${repoPath}-${minStart}`,
      type: "repository",
      title: repoName,
      start_date: new Date(minStart).toISOString(),
      end_date: new Date(maxEnd).toISOString(),
      project_id: allEvents[0].project_id,
      is_all_day: false,
      activities: [...gitEvents, ...browserEvents],
      repository_path: repoPath,
      repository_name: repoName,
      origin_url: originUrl,
    });
  }

  return { aggregated, discoveredGitOrgs: Array.from(discoveredGitOrgs) };
}

// ============================================================================
// Unified UI Event Interface
// ============================================================================

export interface UIEvent {
  id: string;
  type: "calendar" | "repository" | "document" | "research";
  title: string;
  start_date: string;
  end_date: string;
  project_id?: number;
  is_all_day: boolean;

  // Unified activities - all events that contribute to this UI event
  // For calendar: single StoredEvent
  // For git/browser/repository: multiple StoredEvents that were aggregated
  activities: StoredEvent[];

  // Browser-specific data.
  domain?: string;

  // Repository-specific fields
  repository_path?: string;
  repository_name?: string;
  origin_url?: string;
}

function calendarStoredEventToUIEvent(event: StoredEvent): UIEvent {
  let is_all_day = false;
  if (event.event_type === "calendar") {
    try {
      const data = JSON.parse(event.type_specific_data || "{}");
      is_all_day = data.is_all_day === true;
    } catch {
      // ignore parse errors
    }
  }

  return {
    id: `event-${event.id}`,
    type: "calendar",
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    project_id: event.project_id,
    is_all_day,
    activities: [event],
  };
}

export function aggregateAllEvents(
  githubOrgs: string[],
  eventsData: StoredEvent[]
): UIEvent[] {
  const { aggregated: repositoryEvents, discoveredGitOrgs } =
    aggregateRepositoryEvents(eventsData);
  // "document" and "research"-type events
  const browserEvents = aggregateBrowserEvents(eventsData, [
    ...githubOrgs,
    ...discoveredGitOrgs,
  ]);
  const calendarEvents = eventsData
    .filter((e) => e.event_type === "calendar")
    .map(calendarStoredEventToUIEvent);
  return [...calendarEvents, ...repositoryEvents, ...browserEvents];
}

export function filterUIEventsByDay(
  events: UIEvent[],
  date: Date
): {
  allDayEvents: UIEvent[];
  timedEvents: UIEvent[];
} {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const eventsInDay = events.filter((event) => {
    const eventStart = new Date(event.start_date);
    const eventEnd = new Date(event.end_date);
    return eventStart < dayEnd && eventEnd > dayStart;
  });

  const allDayEvents = eventsInDay.filter((event) => event.is_all_day);
  const timedEvents = eventsInDay.filter((event) => !event.is_all_day);

  return { allDayEvents, timedEvents };
}

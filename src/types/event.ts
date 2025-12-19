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
  rule_type: "organizer" | "title_pattern" | "repository" | "url_pattern" | "domain";
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
  origin_url?: string;       // Full remote origin URL
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

export function parseEventData(event: StoredEvent): CalendarEventData | null {
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

export interface AggregatedGitEvent {
  id: string; // composite ID for react keys
  repository_id: string;
  repository_name: string;
  start_date: string;
  end_date: string;
  activities: StoredEvent[]; // individual git events
  project_id?: number;
}

export function aggregateGitEvents(events: StoredEvent[]): AggregatedGitEvent[] {
  // Filter only git events
  const gitEvents = events.filter(e => e.event_type === "git");

  // Group by repository and day
  const byRepoAndDay = new Map<string, StoredEvent[]>();

  for (const event of gitEvents) {
    const gitData = parseGitEventData(event);
    if (!gitData) continue;

    // Create key: repository_id + date (YYYY-MM-DD)
    const dateKey = formatDateKey(event.start_date);
    const key = `${gitData.repository_id}:${dateKey}`;

    if (!byRepoAndDay.has(key)) {
      byRepoAndDay.set(key, []);
    }
    byRepoAndDay.get(key)!.push(event);
  }

  // Create aggregated events - one per repository per day
  const aggregated: AggregatedGitEvent[] = [];

  for (const [, repoEvents] of byRepoAndDay.entries()) {
    if (repoEvents.length === 0) continue;

    // Sort by time
    const sorted = repoEvents.sort((a, b) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    // Create single aggregate for all events in this repo on this day
    aggregated.push(createAggregateFromGroup(sorted));
  }

  return aggregated;
}

function createAggregateFromGroup(events: StoredEvent[]): AggregatedGitEvent {
  const gitData = parseGitEventData(events[0])!;

  // Find min start and max end times
  const startTimes = events.map(e => new Date(e.start_date).getTime());
  const endTimes = events.map(e => new Date(e.end_date).getTime());

  let minStart = Math.min(...startTimes);
  const maxEnd = Math.max(...endTimes);

  // If the first event (earliest) is a commit, extend start time back by 30 minutes
  // as a heuristic to model the work that led to the commit
  const firstEventData = parseGitEventData(events[0]);
  if (firstEventData?.activity_type === 'commit') {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    minStart = minStart - THIRTY_MINUTES_MS;
  }

  return {
    id: `git-${gitData.repository_id}-${minStart}`,
    repository_id: gitData.repository_id,
    repository_name: gitData.repository_name,
    start_date: new Date(minStart).toISOString(),
    end_date: new Date(maxEnd).toISOString(),
    activities: events,
    project_id: events[0].project_id,
  };
}

export function isAggregatedGitEvent(
  event: StoredEvent | AggregatedGitEvent | AggregatedBrowserEvent
): event is AggregatedGitEvent {
  return "repository_id" in event && "activities" in event;
}

// ============================================================================
// Browser Event Aggregation
// ============================================================================

export type BrowserAggregateType = 'collaborative_doc' | 'code_repo' | 'project_tool' | 'domain';

export interface AggregatedBrowserEvent {
  id: string; // composite ID for react keys
  aggregate_key: string; // domain or document identifier (e.g., "github:org/repo", "dropbox-paper:doc-id")
  aggregate_type: BrowserAggregateType;
  domain: string;
  title: string;
  start_date: string;
  end_date: string;
  visits: StoredEvent[]; // individual browser_history events
  project_id?: number;

  // Extracted metadata
  document_id?: string;
  repository?: string;
  workspace?: string;
}

// ============================================================================
// Repository Event Aggregation (Unified Git + Browser)
// ============================================================================

export interface AggregatedRepositoryEvent {
  id: string; // composite ID for react keys
  repository_path: string; // canonical "org/repo" path
  repository_name: string; // display name (just "repo")
  start_date: string;
  end_date: string;
  git_activities: StoredEvent[]; // git events
  browser_visits: StoredEvent[]; // browser_history events
  project_id?: number;
  origin_url?: string; // full remote origin URL
}

export function isAggregatedRepositoryEvent(
  event: unknown
): event is AggregatedRepositoryEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "repository_path" in event &&
    "git_activities" in event &&
    "browser_visits" in event
  );
}

interface DomainConfig {
  pattern: RegExp; // domain pattern to match
  type: BrowserAggregateType;
  // Extract a stable identifier for grouping visits (e.g., repo path, document title)
  extractGroupingKey: (url: string, pageTitle: string) => string | null;
  // Generate display title from the grouping key
  generateTitle: (groupingKey: string) => string;
}

const DOMAIN_CONFIGS: DomainConfig[] = [
  // Dropbox Paper (including www.dropbox.com paper links)
  {
    pattern: /^(paper\.dropbox\.com|www\.dropbox\.com)$/,
    type: 'collaborative_doc',
    extractGroupingKey: (url, pageTitle) => {
      // Filter out root domains, search pages, and folder views
      if (url === 'https://paper.dropbox.com/' || url === 'https://paper.dropbox.com' ||
          url === 'https://www.dropbox.com/' || url === 'https://www.dropbox.com' ||
          url.startsWith('https://www.dropbox.com/search') ||
          url.startsWith('https://www.dropbox.com/home') ||
          url.startsWith('https://www.dropbox.com/work')) {
        return null;
      }

      // Clean and normalize the title
      let cleanTitle = pageTitle
        .replace(/ [–—-] Dropbox Paper$/, '')
        .replace(/ [–—-] Dropbox$/, '')
        .trim();

      // Filter out generic titles
      if (!cleanTitle ||
          cleanTitle === 'Dropbox Paper' ||
          cleanTitle === 'Dropbox' ||
          cleanTitle === 'Files' ||
          cleanTitle === 'Files - Dropbox' ||
          cleanTitle === 'Search - Dropbox' ||
          cleanTitle.startsWith('Dropbox - ')) {
        return null;
      }

      return cleanTitle;
    },
    generateTitle: (groupingKey) => groupingKey,
  },
  // Google Docs/Sheets/Slides
  {
    pattern: /^docs\.google\.com$/,
    type: 'collaborative_doc',
    extractGroupingKey: (url, pageTitle) => {
      // Filter out root domain
      if (url === 'https://docs.google.com/' || url === 'https://docs.google.com') {
        return null;
      }

      // Clean and normalize the title
      let cleanTitle = pageTitle
        .replace(/ - Google (Docs|Sheets|Slides)$/, '')
        .trim();

      // Filter out generic titles
      if (!cleanTitle || cleanTitle.startsWith('Untitled') ||
          cleanTitle === 'Google Docs' || cleanTitle === 'Google Sheets' ||
          cleanTitle === 'Google Slides') {
        return null;
      }

      return cleanTitle;
    },
    generateTitle: (groupingKey) => groupingKey,
  },
  // GitHub - Handled specially in classifyDomain() based on org list
  // Monday.com - boards and docs
  {
    pattern: /^.*\.monday\.com$/,
    type: 'collaborative_doc',
    extractGroupingKey: (url, pageTitle) => {
      // Filter out root domains
      if (url === 'https://monday.com/' || url === 'https://monday.com' ||
          url.match(/^https:\/\/[^.]+\.monday\.com\/?$/)) {
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
          .replace(/ \| monday\.com$/, '')
          .replace(/ - monday\.com$/, '')
          .trim();

        // Use title if meaningful, otherwise use doc ID
        return cleanTitle || `Doc ${docMatch[1]}`;
      }

      // Other monday.com pages - use title or generic fallback
      if (!pageTitle || pageTitle === 'monday.com') {
        return null;
      }

      return pageTitle;
    },
    generateTitle: (groupingKey) => groupingKey,
  },
  // Notion
  {
    pattern: /^([^.]+\.)?notion\.(so|site)$/,
    type: 'collaborative_doc',
    extractGroupingKey: (_url, pageTitle) => {
      // Filter out generic titles
      if (!pageTitle || pageTitle === 'Notion') {
        return null;
      }
      return pageTitle;
    },
    generateTitle: (groupingKey) => groupingKey,
  },
  // GitLab - Group by repository path from URL
  {
    pattern: /^gitlab\.com$/,
    type: 'code_repo',
    extractGroupingKey: (url, _pageTitle) => {
      // Filter out docs and root domain
      if (url.includes('docs.gitlab.com') || url === 'https://gitlab.com/' || url === 'https://gitlab.com') {
        return null;
      }
      const match = url.match(/gitlab\.com\/([^/?#]+\/[^/?#]+)/);
      if (!match) return null;
      const repo = match[1].split('/').slice(0, 2).join('/');
      return repo;
    },
    generateTitle: (groupingKey) => groupingKey, // Just the repo path, icon will indicate it's GitLab
  },
  // Slack
  {
    pattern: /^[^.]+\.slack\.com$/,
    type: 'project_tool',
    extractGroupingKey: (url, _pageTitle) => {
      // Extract workspace from domain
      const workspace = new URL(url).hostname.split('.')[0];
      const match = url.match(/\/archives\/([^/?#]+)/);
      if (match) {
        return `${workspace}#${match[1]}`;
      }
      return workspace;
    },
    generateTitle: (groupingKey) => `Slack: ${groupingKey}`,
  },
  // Jira (Atlassian)
  {
    pattern: /^.*\.atlassian\.net$/,
    type: 'project_tool',
    extractGroupingKey: (url, pageTitle) => {
      // Match project key from issue browse or project pages
      const issueMatch = url.match(/\/browse\/([A-Z]+-\d+)/);
      if (issueMatch) {
        const projectKey = issueMatch[1].split('-')[0];
        return projectKey;
      }
      const projectMatch = url.match(/\/projects\/([^/?#]+)/);
      if (projectMatch) {
        return projectMatch[1];
      }
      return pageTitle || 'Jira';
    },
    generateTitle: (groupingKey) => groupingKey === 'Jira' ? groupingKey : `Jira: ${groupingKey}`,
  },
  // Linear
  {
    pattern: /^linear\.app$/,
    type: 'project_tool',
    extractGroupingKey: (url, pageTitle) => {
      const match = url.match(/\/team\/([^/?#]+)/);
      return match ? match[1] : (pageTitle || 'Linear');
    },
    generateTitle: (groupingKey) => groupingKey === 'Linear' ? groupingKey : `Linear: ${groupingKey}`,
  },
  // Figma
  {
    pattern: /^([^.]+\.)?figma\.com$/,
    type: 'collaborative_doc',
    extractGroupingKey: (_url, pageTitle) => {
      // Filter out generic titles
      let cleanTitle = pageTitle.replace(/ - Figma$/, '').trim();
      if (!cleanTitle || cleanTitle === 'Figma' || cleanTitle.startsWith('Untitled')) {
        return null;
      }
      return cleanTitle;
    },
    generateTitle: (groupingKey) => groupingKey,
  },
];

function classifyDomain(
  domain: string,
  url: string,
  pageTitle: string,
  githubOrgs: string[]
): { config: DomainConfig | null; groupingKey: string | null } {
  // Special handling for GitHub - check org list first
  if (domain === 'github.com') {
    // Filter out docs.github.com and root domain
    if (url.includes('docs.github.com') || url === 'https://github.com/' || url === 'https://github.com') {
      return { config: null, groupingKey: null };
    }

    const match = url.match(/github\.com\/([^/?#]+)(?:\/([^/?#]+))?/);
    if (!match) return { config: null, groupingKey: null };

    const org = match[1];
    const repo = match[2];

    // If this org is in our focused work list, aggregate by repository
    if (githubOrgs.includes(org) && repo) {
      const repoPath = `${org}/${repo}`;
      return {
        config: {
          pattern: /^github\.com$/,
          type: 'code_repo',
          extractGroupingKey: () => repoPath,
          generateTitle: (key) => key
        },
        groupingKey: repoPath
      };
    }

    // Otherwise, aggregate all GitHub activity under generic "GitHub" bucket
    return {
      config: {
        pattern: /^github\.com$/,
        type: 'code_repo',
        extractGroupingKey: () => 'GitHub',
        generateTitle: () => 'GitHub'
      },
      groupingKey: 'GitHub'
    };
  }

  // Check other domain configs
  for (const config of DOMAIN_CONFIGS) {
    if (config.pattern.test(domain)) {
      const key = config.extractGroupingKey(url, pageTitle);
      if (key) {
        return { config, groupingKey: key };
      }
      // Config matched but groupingKey was null (filtered out) - return early
      return { config: null, groupingKey: null };
    }
  }

  // No config matched - not a recognized platform
  return { config: null, groupingKey: null };
}

export function aggregateBrowserEvents(
  events: StoredEvent[],
  githubOrgs: string[] = []
): AggregatedBrowserEvent[] {
  // Filter only browser_history events
  const browserEvents = events.filter(e => e.event_type === "browser_history");

  // Group by grouping key + domain + day
  // groupingKey varies by platform: repo path for GitHub/GitLab, doc title for docs, etc.
  const byKeyDomainAndDay = new Map<string, StoredEvent[]>();

  for (const event of browserEvents) {
    const browserData = parseBrowserEventData(event);
    if (!browserData) continue;

    const { config, groupingKey } = classifyDomain(
      browserData.domain,
      browserData.url,
      browserData.page_title || '',
      githubOrgs
    );

    // Skip if no config or groupingKey (not a recognized platform or filtered out)
    if (!config || !groupingKey) continue;

    // Create aggregation key: groupingKey + domain + date
    const dateKey = formatDateKey(event.start_date);
    const key = `${groupingKey}:${browserData.domain}:${dateKey}`;

    if (!byKeyDomainAndDay.has(key)) {
      byKeyDomainAndDay.set(key, []);
    }
    byKeyDomainAndDay.get(key)!.push(event);
  }

  // Create aggregated events
  const aggregated: AggregatedBrowserEvent[] = [];

  for (const [key, visits] of byKeyDomainAndDay.entries()) {
    if (visits.length === 0) continue;

    // Sort by time
    const sorted = visits.sort((a, b) =>
      new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );

    // Extract groupingKey from composite key (groupingKey:domain:date)
    const parts = key.split(':');
    const groupingKey = parts.slice(0, -2).join(':'); // Handle grouping keys with colons

    const firstVisit = sorted[0];
    const browserData = parseBrowserEventData(firstVisit)!;
    const { config } = classifyDomain(browserData.domain, browserData.url, browserData.page_title || '', githubOrgs);

    if (!config) continue; // Should never happen due to earlier filter

    // Create aggregate key for uniqueness
    const aggregateKey = `${config.type}:${groupingKey}`;

    const aggregate = createBrowserAggregateFromGroup(sorted, aggregateKey, config, groupingKey);
    aggregated.push(aggregate);
  }

  return aggregated;
}

function createBrowserAggregateFromGroup(
  visits: StoredEvent[],
  aggregateKey: string,
  config: DomainConfig,
  groupingKey: string
): AggregatedBrowserEvent {
  const firstBrowserData = parseBrowserEventData(visits[0])!;

  // Find min start and max end times
  const visitTimes = visits.map(v => new Date(v.start_date).getTime());
  const minStart = Math.min(...visitTimes);
  const maxEnd = Math.max(...visitTimes);

  // Apply buffers
  const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
  const THIRTY_MINUTES_MS = 30 * 60 * 1000;

  // Start buffer: -15 min for collaborative docs, none for others
  const startBuffer = config.type === 'collaborative_doc' ? FIFTEEN_MINUTES_MS : 0;
  const adjustedStart = minStart - startBuffer;

  // End buffer: +15 min (assume work continued)
  const adjustedEnd = maxEnd + FIFTEEN_MINUTES_MS;

  // Minimum span: 30 minutes for single visits
  const span = adjustedEnd - adjustedStart;
  const finalEnd = span < THIRTY_MINUTES_MS
    ? adjustedStart + THIRTY_MINUTES_MS
    : adjustedEnd;

  // Generate display title from grouping key
  const title = config.generateTitle(groupingKey);

  // Extract metadata - groupingKey contains the actual identifier
  let document_id: string | undefined;
  let repository: string | undefined;
  let workspace: string | undefined;

  if (config.type === 'collaborative_doc') {
    document_id = groupingKey;
  } else if (config.type === 'code_repo') {
    repository = groupingKey;
  } else if (config.type === 'project_tool') {
    workspace = groupingKey;
  }

  return {
    id: `browser-${aggregateKey}-${adjustedStart}`,
    aggregate_key: aggregateKey,
    aggregate_type: config.type,
    domain: firstBrowserData.domain,
    title,
    start_date: new Date(adjustedStart).toISOString(),
    end_date: new Date(finalEnd).toISOString(),
    visits,
    project_id: visits[0].project_id,
    document_id,
    repository,
    workspace,
  };
}

export function isAggregatedBrowserEvent(
  event: StoredEvent | AggregatedGitEvent | AggregatedBrowserEvent
): event is AggregatedBrowserEvent {
  return "aggregate_key" in event && "visits" in event;
}

// ============================================================================
// Repository Event Aggregation Function
// ============================================================================

export function aggregateRepositoryEvents(
  events: StoredEvent[]
): AggregatedRepositoryEvent[] {
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

    const dateKey = formatDateKey(event.start_date);
    const key = `${repoPath}:${dateKey}`;

    if (!byRepoAndDay.has(key)) {
      byRepoAndDay.set(key, []);
    }
    byRepoAndDay.get(key)!.push(event);
  }

  // Create aggregates combining git + browser
  const aggregated: AggregatedRepositoryEvent[] = [];

  for (const [key, allEvents] of byRepoAndDay) {
    const repoPath = key.split(':').slice(0, -1).join(':');

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
      repository_path: repoPath,
      repository_name: repoName,
      start_date: new Date(minStart).toISOString(),
      end_date: new Date(maxEnd).toISOString(),
      git_activities: gitEvents,
      browser_visits: browserEvents,
      project_id: allEvents[0].project_id,
      origin_url: originUrl,
    });
  }

  return aggregated;
}

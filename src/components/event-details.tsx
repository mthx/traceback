import type {
  StoredEvent,
  CalendarEventData,
  GitEventData,
  AggregatedGitEvent,
  AggregatedBrowserEvent,
  AggregatedRepositoryEvent,
  BrowserHistoryEventData,
} from "@/types/event";
import {
  parseEventData,
  parseGitEventData,
  parseBrowserEventData,
  isAggregatedGitEvent,
  isAggregatedBrowserEvent,
  isAggregatedRepositoryEvent,
} from "@/types/event";
import type { ReactNode } from "react";
import { formatEventTime } from "@/components/calendar-utils";

interface EventDetailsProps {
  event: StoredEvent | AggregatedGitEvent | AggregatedBrowserEvent | AggregatedRepositoryEvent;
}

// Abbreviate GitHub URLs with conventional formatting
function abbreviateGitHubUrl(url: string): string {
  if (!url.startsWith('https://github.com/')) {
    return url;
  }

  // Match patterns: owner/repo/issues/123, owner/repo/pull/456, etc.
  const issueMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (issueMatch) {
    return `${issueMatch[1]}/${issueMatch[2]}#${issueMatch[3]}`;
  }

  const prMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (prMatch) {
    return `${prMatch[1]}/${prMatch[2]}#${prMatch[3]}`;
  }

  // For other GitHub URLs, just remove the https://github.com/ prefix
  return url.replace('https://github.com/', '');
}

export function DetailsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h3 className="font-semibold text-base">{title}</h3>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function EventDetails({ event }: EventDetailsProps) {
  if (isAggregatedRepositoryEvent(event)) {
    return <RepositoryAggregateEventDetails event={event} />;
  }
  if (isAggregatedGitEvent(event)) {
    return <GitAggregateEventDetails event={event} />;
  }
  if (isAggregatedBrowserEvent(event)) {
    return <BrowserAggregateEventDetails event={event} />;
  }
  // Now TypeScript knows it must be StoredEvent
  if (event.event_type === "calendar") {
    const eventData = parseEventData(event);
    return <CalendarEventDetails event={event} eventData={eventData} />;
  } else if (event.event_type === "git") {
    const gitData = parseGitEventData(event);
    return <GitEventDetails event={event} gitData={gitData} />;
  } else if (event.event_type === "browser_history") {
    const browserData = parseBrowserEventData(event);
    return <BrowserHistoryEventDetails event={event} browserData={browserData} />;
  }
  return null;
}

interface CalendarEventDetailsProps {
  event: StoredEvent;
  eventData: CalendarEventData | null;
}

function CalendarEventDetails({ eventData }: CalendarEventDetailsProps) {
  return (
    <div className="space-y-4">
      {eventData?.location && (
        <DetailsSection title="Location">{eventData.location}</DetailsSection>
      )}

      {(eventData?.organizer ||
        (eventData?.attendees && eventData.attendees.length > 0)) && (
        <DetailsSection title="Attendees">
          {eventData?.organizer && (
            <div>
              <span className="font-medium">Organizer:</span>{" "}
              {eventData.organizer}
            </div>
          )}
          {eventData?.attendees && eventData.attendees.length > 0 && (
            <div>{eventData.attendees.join(", ")}</div>
          )}
        </DetailsSection>
      )}

      {eventData?.notes && (
        <DetailsSection title="Notes">
          <div className="whitespace-pre-wrap">{eventData.notes}</div>
        </DetailsSection>
      )}
    </div>
  );
}

interface GitEventDetailsProps {
  event: StoredEvent;
  gitData: GitEventData | null;
}

function GitEventDetails({ gitData }: GitEventDetailsProps) {
  return (
    <div className="space-y-4">
      {gitData?.activity_type && (
        <DetailsSection title="Details">
          {gitData?.activity_type && (
            <div>
              <span className="font-medium">Activity:</span>{" "}
              <span className="capitalize">{gitData.activity_type}</span>
            </div>
          )}
        </DetailsSection>
      )}
    </div>
  );
}

interface RepositoryAggregateEventDetailsProps {
  event: AggregatedRepositoryEvent;
}

function RepositoryAggregateEventDetails({ event }: RepositoryAggregateEventDetailsProps) {
  // Combine git activities and browser visits into a single timeline
  type TimelineItem = {
    type: 'git' | 'browser';
    timestamp: string;
    event: StoredEvent;
  };

  const timeline: TimelineItem[] = [
    ...event.git_activities.map(activity => ({
      type: 'git' as const,
      timestamp: activity.start_date,
      event: activity,
    })),
    ...event.browser_visits.map(visit => ({
      type: 'browser' as const,
      timestamp: visit.start_date,
      event: visit,
    })),
  ];

  // Sort by timestamp (newest first or chronological order)
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const totalCount = event.git_activities.length + event.browser_visits.length;

  return (
    <div className="space-y-4">
      {timeline.length > 0 && (
        <DetailsSection title={`Activities (${totalCount})`}>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {timeline.map((item, idx) => {
              if (item.type === 'git') {
                return (
                  <div key={`git-${item.event.id}-${idx}`} className="text-sm border-l-2 border-blue-500 pl-2">
                    <div className="font-medium">
                      {formatEventTime(item.event.start_date)}
                    </div>
                    <div className="text-muted-foreground">
                      {item.event.title}
                    </div>
                  </div>
                );
              } else {
                const browserData = parseBrowserEventData(item.event);
                const displayUrl = browserData?.url ? abbreviateGitHubUrl(browserData.url) : '';

                return (
                  <div key={`browser-${item.event.id}-${idx}`} className="text-sm border-l-2 border-green-500 pl-2">
                    <div className="font-medium">
                      {formatEventTime(item.event.start_date)}
                    </div>
                    {browserData?.page_title && (
                      <div className="text-muted-foreground truncate">
                        {browserData.page_title}
                      </div>
                    )}
                    <a
                      href={browserData?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs truncate block"
                    >
                      {displayUrl}
                    </a>
                  </div>
                );
              }
            })}
          </div>
        </DetailsSection>
      )}
    </div>
  );
}

interface GitAggregateEventDetailsProps {
  event: AggregatedGitEvent;
}

function GitAggregateEventDetails({ event }: GitAggregateEventDetailsProps) {
  return (
    <div className="space-y-4">
      <DetailsSection title="Activities">
        <div className="space-y-2">
          {event.activities.map((activity) => (
            <div key={activity.id} className="text-sm">
              <span className="font-medium">
                {formatEventTime(activity.start_date)}
              </span>
              <span className="ml-2">{activity.title}</span>
            </div>
          ))}
        </div>
      </DetailsSection>
    </div>
  );
}

interface BrowserAggregateEventDetailsProps {
  event: AggregatedBrowserEvent;
}

function BrowserAggregateEventDetails({ event }: BrowserAggregateEventDetailsProps) {
  const isCollaborativeDoc = event.aggregate_type === 'collaborative_doc';

  return (
    <div className="space-y-4">
      <DetailsSection title="Visits">
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {event.visits.map((visit, idx) => {
            const browserData = parseBrowserEventData(visit);
            const displayUrl = browserData?.url ? abbreviateGitHubUrl(browserData.url) : '';

            return (
              <div key={visit.id || idx} className="text-sm border-l-2 border-muted pl-2">
                <div className="font-medium">
                  {formatEventTime(visit.start_date)}
                </div>
                {isCollaborativeDoc && browserData?.page_title ? (
                  // For collaborative docs, link the title directly
                  <a
                    href={browserData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate block"
                  >
                    {browserData.page_title}
                  </a>
                ) : (
                  // For other types (code repos, etc), show title and URL separately
                  <>
                    {browserData?.page_title && (
                      <div className="text-muted-foreground truncate">
                        {browserData.page_title}
                      </div>
                    )}
                    <a
                      href={browserData?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs truncate block"
                    >
                      {displayUrl}
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </DetailsSection>
    </div>
  );
}

interface BrowserHistoryEventDetailsProps {
  event: StoredEvent;
  browserData: BrowserHistoryEventData | null;
}

function BrowserHistoryEventDetails({ browserData }: BrowserHistoryEventDetailsProps) {
  const displayUrl = browserData?.url ? abbreviateGitHubUrl(browserData.url) : '';

  return (
    <div className="space-y-4">
      {browserData && (
        <>
          <DetailsSection title="URL">
            <a
              href={browserData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline break-all"
            >
              {displayUrl}
            </a>
          </DetailsSection>

          <DetailsSection title="Domain">
            {browserData.domain}
          </DetailsSection>

          {browserData.visit_count > 1 && (
            <DetailsSection title="Visit Count">
              {browserData.visit_count} visits
            </DetailsSection>
          )}
        </>
      )}
    </div>
  );
}

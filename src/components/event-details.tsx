import type { StoredEvent, CalendarEventData, UIEvent } from "@/types/event";
import { parseEventData, parseBrowserEventData } from "@/types/event";
import type { ReactNode } from "react";
import { formatEventTime } from "@/components/calendar-utils";

interface EventDetailsProps {
  event: UIEvent;
}

// Abbreviate GitHub URLs with conventional formatting
function abbreviateGitHubUrl(url: string): string {
  if (!url.startsWith("https://github.com/")) {
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
  return url.replace("https://github.com/", "");
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
  if (event.type === "repository") {
    return <RepositoryEventDetails event={event} />;
  }
  if (event.type === "git") {
    return <GitEventDetails event={event} />;
  }
  if (event.type === "browser") {
    return <BrowserEventDetails event={event} />;
  }
  if (event.type === "calendar") {
    const eventData = parseEventData(event.activities[0]);
    return (
      <CalendarEventDetails event={event.activities[0]} eventData={eventData} />
    );
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
  event: UIEvent;
}

function GitEventDetails({ event }: GitEventDetailsProps) {
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

interface RepositoryEventDetailsProps {
  event: UIEvent;
}

function RepositoryEventDetails({ event }: RepositoryEventDetailsProps) {
  // Combine git and browser activities into a single timeline
  type TimelineItem = {
    type: "git" | "browser";
    timestamp: string;
    activity: StoredEvent;
  };

  const timeline: TimelineItem[] = event.activities.map((activity) => {
    // Determine type based on event_type field
    const isGit = activity.event_type === "git";
    return {
      type: isGit ? ("git" as const) : ("browser" as const),
      timestamp: activity.start_date,
      activity,
    };
  });

  // Sort by timestamp (chronological order)
  timeline.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const totalCount = event.activities.length;

  return (
    <div className="space-y-4">
      {timeline.length > 0 && (
        <DetailsSection title={`Activities (${totalCount})`}>
          <div className="space-y-2">
            {timeline.map((item, idx) => {
              if (item.type === "git") {
                return (
                  <div
                    key={`git-${item.activity.id}-${idx}`}
                    className="text-sm border-l-2 border-blue-500 pl-2"
                  >
                    <div className="font-medium">
                      {formatEventTime(item.activity.start_date)}
                    </div>
                    <div className="text-muted-foreground">
                      {item.activity.title}
                    </div>
                  </div>
                );
              } else {
                const browserData = parseBrowserEventData(item.activity);
                const displayUrl = browserData?.url
                  ? abbreviateGitHubUrl(browserData.url)
                  : "";

                return (
                  <div
                    key={`browser-${item.activity.id}-${idx}`}
                    className="text-sm border-l-2 border-green-500 pl-2"
                  >
                    <div className="font-medium">
                      {formatEventTime(item.activity.start_date)}
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

interface BrowserEventDetailsProps {
  event: UIEvent;
}

function BrowserEventDetails({ event }: BrowserEventDetailsProps) {
  const isCollaborativeDoc = event.aggregate_type === "document";

  return (
    <div className="space-y-4">
      <DetailsSection title="Visits">
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {event.activities.map((visit, idx) => {
            const browserData = parseBrowserEventData(visit);
            const displayUrl = browserData?.url
              ? abbreviateGitHubUrl(browserData.url)
              : "";

            return (
              <div
                key={visit.id || idx}
                className="text-sm border-l-2 border-muted pl-2"
              >
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

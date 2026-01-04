import { formatEventTime } from "@/components/calendar-utils";
import type { UIEvent } from "@/types/event";
import { parseCalendarEventData } from "@/types/event";
import type { ReactNode } from "react";

interface EventDetailsProps {
  event: UIEvent;
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
  if (event.type === "calendar") {
    return <CalendarEventDetails event={event} />;
  }
  return <ActivityEventDetails event={event} />;
}

interface CalendarEventDetailsProps {
  event: UIEvent;
}

function CalendarEventDetails({ event }: CalendarEventDetailsProps) {
  const calendarEvent = event.activities[0];
  const calendarData = parseCalendarEventData(calendarEvent);
  return (
    <div className="space-y-4">
      {calendarData?.location && (
        <DetailsSection title="Location">
          {calendarData.location}
        </DetailsSection>
      )}

      {(calendarData?.organizer ||
        (calendarData?.attendees && calendarData.attendees.length > 0)) && (
        <DetailsSection title="Attendees">
          {calendarData?.organizer && (
            <div>
              <span className="font-medium">Organizer:</span>{" "}
              {calendarData.organizer}
            </div>
          )}
          {calendarData?.attendees && calendarData.attendees.length > 0 && (
            <div>{calendarData.attendees.join(", ")}</div>
          )}
        </DetailsSection>
      )}

      {calendarData?.notes && (
        <DetailsSection title="Notes">
          <div className="whitespace-pre-wrap">{calendarData.notes}</div>
        </DetailsSection>
      )}
    </div>
  );
}
interface ActivityEventDetailsProps {
  event: UIEvent;
}

function ActivityEventDetails({ event }: ActivityEventDetailsProps) {
  const totalCount = event.activities.length;
  return (
    <div className="space-y-4">
      {totalCount && (
        <DetailsSection title={`Activities (${totalCount})`}>
          <div>
            {event.activities.map((item) => (
              <div key={item.id} className="flex text-sm">
                <div className="font-medium w-11 shrink-0">
                  {formatEventTime(item.start_date)}
                </div>
                {item.external_link ? (
                  <a
                    className="text-blue-600 hover:underline truncate block"
                    href={item.external_link}
                  >
                    {item.title}
                  </a>
                ) : (
                  <div className="text-muted-foreground">{item.title}</div>
                )}
              </div>
            ))}
          </div>
        </DetailsSection>
      )}
    </div>
  );
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub event_id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub is_all_day: bool,
    pub attendees: Vec<String>,
    pub organizer: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum CalendarPermissionStatus {
    FullAccess,
    Denied,
    Restricted,
    NotDetermined,
}

#[cfg(target_os = "macos")]
pub async fn get_calendar_events_range(
    start_date: &str,
    end_date: &str,
) -> Result<Vec<CalendarEvent>, String> {
    use chrono::DateTime;
    use objc2_event_kit::{EKEntityType, EKEventStore};

    // Request access first. This is now self-contained and Send-safe.
    let granted = unsafe { request_calendar_access().await? };

    if !granted {
        return Err("Calendar access denied".to_string());
    }

    // Now that access is granted, create an event store for fetching.
    // This is safe because we are not holding it across an await.
    unsafe {
        let event_store = EKEventStore::new();

        // Parse date strings
        let start_dt = DateTime::parse_from_rfc3339(start_date)
            .map_err(|e| format!("Invalid start date: {}", e))?;
        let end_dt = DateTime::parse_from_rfc3339(end_date)
            .map_err(|e| format!("Invalid end date: {}", e))?;

        let start_nsdate = create_nsdate(&start_dt.with_timezone(&chrono::Utc));
        let end_nsdate = create_nsdate(&end_dt.with_timezone(&chrono::Utc));

        // Get all calendars for events
        let calendars = event_store.calendarsForEntityType(EKEntityType::Event);

        // Create predicate for events in date range
        let predicate = event_store.predicateForEventsWithStartDate_endDate_calendars(
            &start_nsdate,
            &end_nsdate,
            Some(&calendars),
        );

        // Fetch events
        let events = event_store.eventsMatchingPredicate(&predicate);
        let count = events.len();

        let mut result = Vec::new();

        for i in 0..count {
            let event = &events[i];

            // Get event identifier (unique ID from Mac Calendar)
            let event_id = event
                .eventIdentifier()
                .map(|s| s.to_string())
                .unwrap_or_default();

            // Get title
            let title = event.title().to_string();

            // Get dates
            let start_date = event.startDate();
            let end_date_obj = event.endDate();
            let is_all_day = event.isAllDay();

            let start_str = nsdate_to_string(&start_date);
            let end_str = nsdate_to_string(&end_date_obj);

            // Get location (optional)
            let location = event.location().map(|s| s.to_string());

            // Get notes (optional)
            let notes = event.notes().map(|s| s.to_string());

            // Get attendees
            let mut attendees = Vec::new();
            if let Some(attendees_array) = event.attendees() {
                for j in 0..attendees_array.len() {
                    let attendee = &attendees_array[j];
                    if let Some(name) = attendee.name() {
                        attendees.push(name.to_string());
                    }
                }
            }

            // Get organizer
            let organizer = event.organizer().and_then(|org| org.name().map(|n| n.to_string()));

            result.push(CalendarEvent {
                event_id,
                title,
                start_date: start_str,
                end_date: end_str,
                location,
                notes,
                is_all_day,
                attendees,
                organizer,
            });
        }

        Ok(result)
    }
}

#[cfg(target_os = "macos")]
async unsafe fn request_calendar_access() -> Result<bool, String> {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore};
    use objc2_foundation::NSError;
    use std::sync::Mutex;
    use tokio::sync::oneshot;

    let event_store = EKEventStore::new();
    let status = EKEventStore::authorizationStatusForEntityType(EKEntityType::Event);

    match status {
        EKAuthorizationStatus::FullAccess => return Ok(true),
        EKAuthorizationStatus::Denied | EKAuthorizationStatus::Restricted => return Ok(false),
        EKAuthorizationStatus::NotDetermined => {
            // This is the only case where we need to request access.
        }
        _ => {
            // Handle other potential future statuses gracefully.
            return Ok(false);
        }
    }

    let (tx, rx) = oneshot::channel();
    let tx_once = Mutex::new(Some(tx));

    let completion_block = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        if let Some(tx) = tx_once.lock().unwrap().take() {
            if !error.is_null() {
                // You might want to log the error details here
            }
            let _ = tx.send(granted.as_bool());
        }
    });

    event_store.requestFullAccessToEventsWithCompletion(&*completion_block as *const _ as *mut _);

    rx.await.map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
pub fn check_calendar_permission() -> CalendarPermissionStatus {
    use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore};

    let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };

    match status {
        EKAuthorizationStatus::FullAccess => CalendarPermissionStatus::FullAccess,
        EKAuthorizationStatus::Denied => CalendarPermissionStatus::Denied,
        EKAuthorizationStatus::Restricted => CalendarPermissionStatus::Restricted,
        EKAuthorizationStatus::NotDetermined => CalendarPermissionStatus::NotDetermined,
        _ => CalendarPermissionStatus::NotDetermined,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn check_calendar_permission() -> CalendarPermissionStatus {
    CalendarPermissionStatus::NotDetermined
}

#[cfg(target_os = "macos")]
unsafe fn create_nsdate(
    datetime: &chrono::DateTime<chrono::Utc>,
) -> objc2::rc::Retained<objc2_foundation::NSDate> {
    use objc2_foundation::NSDate;
    let timestamp = datetime.timestamp() as f64;
    NSDate::dateWithTimeIntervalSince1970(timestamp)
}

#[cfg(target_os = "macos")]
unsafe fn nsdate_to_string(nsdate: &objc2_foundation::NSDate) -> String {
    let timestamp = nsdate.timeIntervalSince1970();
    let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(timestamp as i64, 0)
        .unwrap_or_else(|| chrono::Utc::now());
    datetime.to_rfc3339()
}

#[cfg(target_os = "macos")]
pub async fn get_calendar_events(days_ahead: i32) -> Result<Vec<CalendarEvent>, String> {
    use chrono::{Duration, Utc};

    let now = Utc::now();
    let end_date = now + Duration::days(days_ahead as i64);

    get_calendar_events_range(&now.to_rfc3339(), &end_date.to_rfc3339()).await
}

#[cfg(not(target_os = "macos"))]
pub async fn get_calendar_events(_days_ahead: i32) -> Result<Vec<CalendarEvent>, String> {
    Err("Calendar access is only supported on macOS".to_string())
}

#[cfg(not(target_os = "macos"))]
pub async fn get_calendar_events_range(
    _start_date: &str,
    _end_date: &str,
) -> Result<Vec<CalendarEvent>, String> {
    Err("Calendar access is only supported on macOS".to_string())
}

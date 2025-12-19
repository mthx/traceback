use chrono::DateTime;

use crate::browser::BrowserVisit;
use crate::calendar::CalendarEvent;
use crate::db::{BrowserHistoryEventData, CalendarEventData, Database, Event, GitEventData};
use crate::git::GitActivity;

/// Clean up notes by trimming consecutive blank lines
fn clean_notes(notes: Option<String>) -> Option<String> {
    notes.map(|text| {
        // Split into lines, trim each line, and filter out consecutive blank lines
        let lines: Vec<&str> = text.lines().collect();
        let mut cleaned_lines = Vec::new();
        let mut prev_was_blank = false;

        for line in lines {
            let trimmed = line.trim_end();
            let is_blank = trimmed.is_empty();

            // Skip consecutive blank lines
            if is_blank && prev_was_blank {
                continue;
            }

            cleaned_lines.push(trimmed);
            prev_was_blank = is_blank;
        }

        // Remove trailing blank lines
        while cleaned_lines.last().map_or(false, |l| l.is_empty()) {
            cleaned_lines.pop();
        }

        // Remove leading blank lines
        while cleaned_lines.first().map_or(false, |l| l.is_empty()) {
            cleaned_lines.remove(0);
        }

        let result = cleaned_lines.join("\n");
        if result.is_empty() {
            None
        } else {
            Some(result)
        }
    })
    .flatten()
}

pub fn sync_single_event(db: &Database, cal_event: &CalendarEvent) -> Result<usize, String> {
    // Use Mac Calendar's native eventIdentifier for reliable duplicate detection
    let external_id = cal_event.event_id.clone();

    // Create Calendar app deep link (format: x-apple-calendar://)
    let external_link = Some(format!(
        "x-apple-calendar://event?title={}",
        urlencoding::encode(&cal_event.title)
    ));

    // Prepare type-specific data
    let type_specific_data = CalendarEventData {
        location: cal_event.location.clone(),
        notes: clean_notes(cal_event.notes.clone()),
        is_all_day: cal_event.is_all_day,
        organizer: cal_event.organizer.clone(),
        attendees: if cal_event.attendees.is_empty() {
            None
        } else {
            Some(cal_event.attendees.clone())
        },
    };

    let type_specific_json = serde_json::to_string(&type_specific_data)
        .map_err(|e| format!("Failed to serialize event data: {}", e))?;

    // Parse RFC3339 timestamps from calendar event and convert to Unix timestamp
    let start_timestamp = DateTime::parse_from_rfc3339(&cal_event.start_date)
        .map_err(|e| format!("Failed to parse start date: {}", e))?
        .timestamp();

    let end_timestamp = DateTime::parse_from_rfc3339(&cal_event.end_date)
        .map_err(|e| format!("Failed to parse end date: {}", e))?
        .timestamp();

    let event = Event {
        id: None,
        event_type: "calendar".to_string(),
        title: cal_event.title.clone(),
        start_date: start_timestamp,
        end_date: end_timestamp,
        external_id: Some(external_id),
        external_link,
        type_specific_data: Some(type_specific_json),
        project_id: None, // Will be set manually or by rules
        created_at: 0, // Will be set by upsert_event
        updated_at: 0, // Will be set by upsert_event
    };

    let (_event_id, was_new) = db.upsert_event(&event)
        .map_err(|e| format!("Failed to insert event: {}", e))?;

    Ok(if was_new { 1 } else { 0 })
}

pub fn sync_git_activity(
    db: &Database,
    git_activity: &GitActivity,
    repo_info: &crate::git::GitRepository
) -> Result<usize, String> {
    // Create external_id: {repo_id}:{timestamp}
    let external_id = format!("{}:{}", git_activity.repository_id, git_activity.timestamp);

    // Prepare type-specific data
    let type_specific_data = GitEventData {
        repository_id: git_activity.repository_id.clone(),
        repository_name: git_activity.repository_name.clone(),
        activity_type: format!("{:?}", git_activity.activity_type).to_lowercase(),
        ref_name: git_activity.ref_name.clone(),
        commit_hash: git_activity.commit_hash.clone(),
        repository_path: repo_info.repository_path.clone(),
        origin_url: repo_info.origin_url.clone(),
    };

    let type_specific_json = serde_json::to_string(&type_specific_data)
        .map_err(|e| format!("Failed to serialize git event data: {}", e))?;

    // Create event title
    let title = format_git_event_title(git_activity);

    // Parse RFC3339 timestamp from git activity and convert to Unix timestamp
    let timestamp = DateTime::parse_from_rfc3339(&git_activity.timestamp)
        .map_err(|e| format!("Failed to parse git timestamp: {}", e))?
        .timestamp();

    // For git events, start_date and end_date are the same (point-in-time events)
    let event = Event {
        id: None,
        event_type: "git".to_string(),
        title,
        start_date: timestamp,
        end_date: timestamp,
        external_id: Some(external_id),
        external_link: None, // Could add GitHub/GitLab links in the future
        type_specific_data: Some(type_specific_json),
        project_id: None, // Will be set manually or by rules
        created_at: 0, // Will be set by upsert_event
        updated_at: 0, // Will be set by upsert_event
    };

    let (_event_id, was_new) = db.upsert_event(&event)
        .map_err(|e| format!("Failed to insert git event: {}", e))?;

    Ok(if was_new { 1 } else { 0 })
}

fn format_git_event_title(activity: &GitActivity) -> String {
    // Just return the message - no need for redundant repo/action info
    // since that's already stored in type_specific_data
    activity.message.clone()
}

pub fn sync_browser_visit(
    db: &Database,
    visit: &BrowserVisit,
    discovered_repos: &[String],
    github_orgs: &[String]
) -> Result<usize, String> {
    // Extract domain from URL
    let domain = extract_domain(&visit.url);

    // Extract repository path from URL if this is a code hosting platform
    let repository_path = extract_repository_path_from_url(&visit.url);

    // Hybrid filtering: Include if matches discovered repos OR manual orgs
    let should_include = repository_path.as_ref().map_or(false, |path| {
        // Check if path matches any discovered repo
        discovered_repos.iter().any(|r| r == path) ||
        // OR check if path matches any configured org (e.g., "facebook/react" matches org "facebook")
        github_orgs.iter().any(|org| path.starts_with(&format!("{}/", org)))
    });

    if !should_include && repository_path.is_some() {
        // This is a code repo visit but doesn't match our filters - skip it
        return Ok(0);
    }

    // Create stable external_id from URL + visit_date
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    visit.url.hash(&mut hasher);
    visit.visit_date.hash(&mut hasher);
    let external_id = format!("browser-{:x}", hasher.finish());

    // Prepare type-specific data
    let type_specific_data = BrowserHistoryEventData {
        url: visit.url.clone(),
        domain: domain.clone(),
        page_title: visit.title.clone(),
        visit_count: visit.visit_count,
        repository_path,
    };

    let type_specific_json = serde_json::to_string(&type_specific_data)
        .map_err(|e| format!("Failed to serialize browser event data: {}", e))?;

    // Convert microseconds to seconds
    let timestamp = visit.visit_date / 1_000_000;

    // Create title: use page title if available, otherwise truncated URL
    let title = visit
        .title
        .clone()
        .unwrap_or_else(|| truncate_url(&visit.url));

    // For browser visits, start and end are the same (point-in-time)
    let event = Event {
        id: None,
        event_type: "browser_history".to_string(),
        title,
        start_date: timestamp,
        end_date: timestamp,
        external_id: Some(external_id),
        external_link: Some(visit.url.clone()),
        type_specific_data: Some(type_specific_json),
        project_id: None,
        created_at: 0,
        updated_at: 0,
    };

    let (_event_id, was_new) = db.upsert_event(&event)
        .map_err(|e| format!("Failed to insert browser event: {}", e))?;

    Ok(if was_new { 1 } else { 0 })
}

fn extract_domain(url: &str) -> String {
    if let Some(start) = url.find("://") {
        let after_protocol = &url[start + 3..];
        if let Some(end) = after_protocol.find('/') {
            after_protocol[..end].to_string()
        } else {
            after_protocol.to_string()
        }
    } else {
        url.to_string()
    }
}

/// Extract repository path from GitHub/GitLab/Bitbucket URLs
/// Examples:
/// - https://github.com/facebook/react/issues/123 → Some("facebook/react")
/// - https://gitlab.com/gitlab-org/gitlab → Some("gitlab-org/gitlab")
/// - https://bitbucket.org/atlassian/jira/pull-requests/1 → Some("atlassian/jira")
fn extract_repository_path_from_url(url: &str) -> Option<String> {
    let domain = extract_domain(url);

    // Check if this is a code hosting platform
    if !domain.contains("github.com")
        && !domain.contains("gitlab.com")
        && !domain.contains("bitbucket.org") {
        return None;
    }

    // Find the path after the domain
    if let Some(protocol_end) = url.find("://") {
        let after_protocol = &url[protocol_end + 3..];
        if let Some(first_slash) = after_protocol.find('/') {
            let path = &after_protocol[first_slash + 1..];

            // Split by '/' and take first two segments (org/repo)
            let segments: Vec<&str> = path.split('/').collect();
            if segments.len() >= 2 {
                // For GitLab, might have subgroups (group/subgroup/project)
                // For GitHub/Bitbucket, just org/repo
                // To handle both, we take segments until we hit a known path component
                let mut repo_segments = Vec::new();
                for seg in segments.iter() {
                    // Stop at known GitHub/GitLab path components
                    if *seg == "issues"
                        || *seg == "pull"
                        || *seg == "pulls"
                        || *seg == "pull-requests"
                        || *seg == "merge_requests"
                        || *seg == "tree"
                        || *seg == "blob"
                        || *seg == "commit"
                        || *seg == "commits"
                        || *seg == "releases"
                        || *seg == "actions"
                        || *seg == "wiki"
                        || seg.is_empty()
                    {
                        break;
                    }
                    repo_segments.push(*seg);
                }

                if repo_segments.len() >= 2 {
                    return Some(repo_segments.join("/"));
                }
            }
        }
    }

    None
}

fn truncate_url(url: &str) -> String {
    if url.len() > 80 {
        format!("{}...", &url[..77])
    } else {
        url.to_string()
    }
}

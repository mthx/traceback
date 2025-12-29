mod browser;
mod calendar;
mod db;
mod git;
mod sync;

use browser::auto_detect_zen_profile;
use calendar::{check_calendar_permission, get_calendar_events_range, CalendarPermissionStatus};
use chrono::{DateTime, Utc};
use db::{Database, Event, Project, ProjectRule, SyncStatus};
use git::{discover_repositories, get_repository_activities};
use std::path::PathBuf;

// Default sync window for all event sources on initial sync
const DEFAULT_SYNC_DAYS_BACK: i64 = 90;
use std::sync::{Arc, Mutex};
use sync::{sync_git_activity, sync_single_event};
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{Manager, State};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Database>>,
}

impl AppState {
    fn with_db<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&Database) -> Result<R, rusqlite::Error>,
    {
        let db = self
            .db
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;
        f(&db).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn check_calendar_permission_status() -> CalendarPermissionStatus {
    check_calendar_permission()
}

#[tauri::command]
fn get_stored_events(
    state: State<AppState>,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<Event>, String> {
    // Parse RFC3339 strings to Unix timestamps
    let start_timestamp = start_date
        .as_ref()
        .map(|s| {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.timestamp())
                .map_err(|e| format!("Failed to parse start_date: {}", e))
        })
        .transpose()?;

    let end_timestamp = end_date
        .as_ref()
        .map(|s| {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.timestamp())
                .map_err(|e| format!("Failed to parse end_date: {}", e))
        })
        .transpose()?;

    state.with_db(|db| db.get_events(start_timestamp, end_timestamp))
}

#[tauri::command]
fn get_event_project(state: State<AppState>, event_id: i64) -> Result<Option<Project>, String> {
    state.with_db(|db| db.get_event_project(event_id))
}

#[tauri::command]
fn get_all_projects(state: State<AppState>) -> Result<Vec<Project>, String> {
    state.with_db(|db| db.get_all_projects())
}

#[tauri::command]
fn reset_database(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let db_path = app_data_dir.join("traceback.db");

    // Delete the database file
    if db_path.exists() {
        std::fs::remove_file(&db_path).map_err(|e| format!("Failed to delete database: {}", e))?;
    }

    // Recreate the database with fresh schema
    let db = Database::new(db_path).map_err(|e| format!("Failed to recreate database: {}", e))?;
    db.init_schema()
        .map_err(|e| format!("Failed to initialize schema: {}", e))?;

    // Update the app state with the new database
    let state: State<AppState> = app.state();
    let mut db_lock = state
        .db
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;
    *db_lock = db;

    Ok("Database reset successfully".to_string())
}

#[tauri::command]
fn get_sync_status(state: State<AppState>) -> Result<SyncStatus, String> {
    state.with_db(|db| db.get_sync_status())
}

/// Central sync coordinator - syncs all event sources (calendar, git, browser)
#[tauri::command]
fn sync_all_sources(state: State<AppState>) -> Result<usize, String> {
    tauri::async_runtime::block_on(async {
        // Phase 1: Determine sync window
        let (sync_since_timestamp, sync_since_rfc3339, is_first_sync) = state.with_db(|db| {
            db.update_sync_status(None, true)?;
            let sync_status = db.get_sync_status()?;

            match sync_status.last_sync_time {
                Some(last_sync_timestamp) => {
                    let since_dt = chrono::DateTime::from_timestamp(last_sync_timestamp, 0)
                        .ok_or_else(|| rusqlite::Error::InvalidQuery)?;
                    Ok((last_sync_timestamp, since_dt.to_rfc3339(), false))
                }
                None => {
                    // First sync - sync past DEFAULT_SYNC_DAYS_BACK days
                    let since_dt = Utc::now() - chrono::Duration::days(DEFAULT_SYNC_DAYS_BACK);
                    Ok((since_dt.timestamp(), since_dt.to_rfc3339(), true))
                }
            }
        })?;

        if is_first_sync {
            eprintln!(
                "[Sync] Starting first sync ({} days)",
                DEFAULT_SYNC_DAYS_BACK
            );
        } else {
            eprintln!("[Sync] Starting delta sync");
        }

        let now = Utc::now();
        let now_timestamp = now.timestamp();

        // Phase 2: Sync calendar (async)
        let calendar_count =
            sync_calendar_source(&state, &sync_since_rfc3339, &now.to_rfc3339()).await?;

        // Phase 3: Sync git and browser in background (don't block response)
        let app_state = state.inner().clone();
        std::thread::spawn(move || {
            let git_count = sync_git_source(&app_state, sync_since_timestamp, is_first_sync);
            let browser_count =
                sync_browser_source(&app_state, sync_since_timestamp, is_first_sync);

            match git_count {
                Ok(count) => eprintln!("[Git] Synced {} new events", count),
                Err(e) => eprintln!("[Git] Sync failed: {}", e),
            }

            match browser_count {
                Ok(count) => eprintln!("[Browser] Synced {} new events", count),
                Err(e) => eprintln!("[Browser] Sync failed: {}", e),
            }
        });

        // Phase 4: Update sync status
        state.with_db(|db| db.update_sync_status(Some(now_timestamp), false))?;

        Ok(calendar_count)
    })
}

/// Sync calendar events for a given time range
async fn sync_calendar_source(
    state: &State<'_, AppState>,
    start_date_rfc3339: &str,
    end_date_rfc3339: &str,
) -> Result<usize, String> {
    let calendar_events = get_calendar_events_range(start_date_rfc3339, end_date_rfc3339).await?;
    eprintln!(
        "[Calendar] Fetched {} events from EventKit",
        calendar_events.len()
    );

    state.with_db(|db| {
        let mut new_count = 0;
        for cal_event in &calendar_events {
            new_count += sync_single_event(db, cal_event).map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e)))
            })?;
        }
        eprintln!("[Calendar] Synced {} new events", new_count);
        Ok(new_count)
    })
}

/// Sync git events since a given timestamp
fn sync_git_source(
    app_state: &AppState,
    since_timestamp: i64,
    is_first_sync: bool,
) -> Result<usize, String> {
    // Get dev folder from settings
    let dev_folder = match app_state.with_db(|db| db.get_setting("git_dev_folder")) {
        Ok(Some(folder)) => folder,
        Ok(None) => {
            if is_first_sync {
                eprintln!("[Git] No dev folder configured, skipping");
            }
            return Ok(0);
        }
        Err(_) => {
            eprintln!("[Git] Error reading dev folder setting, skipping");
            return Ok(0);
        }
    };

    let path = PathBuf::from(&dev_folder);
    if !path.exists() || !path.is_dir() {
        eprintln!("[Git] Folder doesn't exist: {}", dev_folder);
        return Ok(0);
    }

    let repositories = match discover_repositories(&path, 2) {
        Ok(repos) => repos,
        Err(e) => {
            eprintln!("[Git] Error discovering repositories: {}", e);
            return Ok(0);
        }
    };

    if repositories.is_empty() {
        return Ok(0);
    }

    eprintln!("[Git] Found {} repositories", repositories.len());

    let since_rfc3339 = chrono::DateTime::from_timestamp(since_timestamp, 0)
        .ok_or_else(|| "Invalid sync timestamp".to_string())?
        .to_rfc3339();

    let mut total_new = 0;

    for repo in repositories {
        let activities = match get_repository_activities(&repo, Some(&since_rfc3339)) {
            Ok(acts) => acts,
            Err(_) => continue,
        };

        app_state.with_db(|db| {
            for activity in &activities {
                if let Ok(count) = sync_git_activity(db, activity, &repo) {
                    total_new += count;
                }
            }
            Ok(())
        })?;
    }

    Ok(total_new)
}

/// Sync browser history since a given timestamp
fn sync_browser_source(
    app_state: &AppState,
    since_timestamp: i64,
    is_first_sync: bool,
) -> Result<usize, String> {
    // Get profile path, discovered repos, and GitHub orgs
    let (profile_path, discovered_repos, github_orgs) = match app_state.with_db(|db| {
        let profile_path = match db.get_setting("zen_browser_profile_path")? {
            Some(path) => path,
            None => {
                if is_first_sync {
                    eprintln!("[Browser] No profile path configured, skipping");
                }
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
        };

        let discovered_repos = db.get_discovered_repository_paths()?;
        let github_orgs = db.get_github_orgs()?;

        Ok((profile_path, discovered_repos, github_orgs))
    }) {
        Ok(data) => data,
        Err(_) => return Ok(0),
    };

    let now = Utc::now();
    let visits =
        match browser::get_browser_visits_range(&profile_path, since_timestamp, now.timestamp()) {
            Ok(visits) => {
                eprintln!("[Browser] Fetched {} visits from database", visits.len());
                visits
            }
            Err(e) => {
                eprintln!("[Browser] Error fetching visits: {}", e);
                return Ok(0);
            }
        };

    let mut new_count = 0;
    let mut error_count = 0;

    for visit in &visits {
        match app_state.with_db(|db| {
            sync::sync_browser_visit(db, visit, &discovered_repos, &github_orgs).map_err(|e| {
                rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::other(e)))
            })
        }) {
            Ok(count) => new_count += count,
            Err(e) => {
                error_count += 1;
                if error_count <= 3 {
                    eprintln!("[Browser] Error syncing visit: {}", e);
                }
            }
        }
    }

    if error_count > 3 {
        eprintln!("[Browser] ... and {} more errors", error_count - 3);
    }

    Ok(new_count)
}

#[tauri::command]
fn create_project(
    state: State<AppState>,
    name: String,
    color: Option<String>,
) -> Result<i64, String> {
    state.with_db(|db| db.create_project(&name, color.as_deref()))
}

#[tauri::command]
fn update_project(
    state: State<AppState>,
    id: i64,
    name: String,
    color: Option<String>,
) -> Result<(), String> {
    state.with_db(|db| db.update_project(id, &name, color.as_deref()))
}

#[tauri::command]
fn delete_project(state: State<AppState>, id: i64) -> Result<(), String> {
    state.with_db(|db| db.delete_project(id))
}

#[tauri::command]
fn get_events_by_project(
    state: State<AppState>,
    project_id: i64,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<Event>, String> {
    // Parse RFC3339 strings to Unix timestamps
    let start_timestamp = start_date
        .as_ref()
        .map(|s| {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.timestamp())
                .map_err(|e| format!("Failed to parse start_date: {}", e))
        })
        .transpose()?;

    let end_timestamp = end_date
        .as_ref()
        .map(|s| {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.timestamp())
                .map_err(|e| format!("Failed to parse end_date: {}", e))
        })
        .transpose()?;

    state.with_db(|db| db.get_events_by_project(project_id, start_timestamp, end_timestamp))
}

#[tauri::command]
fn get_project(state: State<AppState>, id: i64) -> Result<Option<Project>, String> {
    state.with_db(|db| db.get_project(id))
}

#[tauri::command]
fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    state.with_db(|db| db.get_setting(&key))
}

#[tauri::command]
fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    state.with_db(|db| db.set_setting(&key, &value))
}

#[tauri::command]
fn assign_event_to_project(
    state: State<AppState>,
    event_id: i64,
    project_id: Option<i64>,
) -> Result<(), String> {
    state.with_db(|db| db.assign_event_to_project(event_id, project_id))
}

#[tauri::command]
fn create_project_rule(
    state: State<AppState>,
    project_id: i64,
    rule_type: String,
    match_value: String,
) -> Result<i64, String> {
    state.with_db(|db| db.create_project_rule(project_id, &rule_type, &match_value))
}

#[tauri::command]
fn get_project_rules(
    state: State<AppState>,
    project_id: Option<i64>,
) -> Result<Vec<ProjectRule>, String> {
    state.with_db(|db| db.get_project_rules(project_id))
}

#[tauri::command]
fn update_project_rule(
    state: State<AppState>,
    rule_id: i64,
    rule_type: String,
    match_value: String,
) -> Result<(), String> {
    state.with_db(|db| db.update_project_rule(rule_id, &rule_type, &match_value))
}

#[tauri::command]
fn delete_project_rule(state: State<AppState>, rule_id: i64) -> Result<(), String> {
    state.with_db(|db| db.delete_project_rule(rule_id))
}

#[tauri::command]
fn apply_rules_to_events(state: State<AppState>) -> Result<usize, String> {
    state.with_db(|db| db.apply_rules_to_events())
}

#[tauri::command]
fn get_zen_profile_path(state: State<AppState>) -> Result<Option<String>, String> {
    state.with_db(|db| db.get_setting("zen_browser_profile_path"))
}

#[tauri::command]
fn set_zen_profile_path(state: State<AppState>, path: String) -> Result<(), String> {
    state.with_db(|db| db.set_setting("zen_browser_profile_path", &path))
}

#[tauri::command]
fn auto_detect_zen_profile_path() -> Result<Option<String>, String> {
    auto_detect_zen_profile()
}

#[tauri::command]
fn get_github_orgs(state: State<AppState>) -> Result<Vec<String>, String> {
    state.with_db(|db| db.get_github_orgs())
}

#[tauri::command]
fn add_github_org(state: State<AppState>, org_name: String) -> Result<(), String> {
    state.with_db(|db| db.add_github_org(&org_name))
}

#[tauri::command]
fn remove_github_org(state: State<AppState>, org_name: String) -> Result<(), String> {
    state.with_db(|db| db.remove_github_org(&org_name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Get app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

            let db_path = app_data_dir.join("traceback.db");
            let db = Database::new(db_path).expect("Failed to initialize database");
            db.init_schema()
                .expect("Failed to initialize database schema");

            app.manage(AppState {
                db: Arc::new(Mutex::new(db)),
            });

            // Note: We don't auto-sync on startup because calendar permission requests
            // must happen on the main thread in response to user action.
            // Users should click "Sync Now" button to trigger the first sync.

            // Create application menu
            use tauri::menu::PredefinedMenuItem;

            // Create Application menu with Quit
            let app_menu = SubmenuBuilder::new(app, "Traceback")
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            // Create File menu
            let file_menu = SubmenuBuilder::new(app, "File")
                .separator()
                .item(&PredefinedMenuItem::close_window(app, None)?)
                .build()?;

            // Create Edit menu with standard items
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .build()?;

            app.set_menu(menu)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_calendar_permission_status,
            get_stored_events,
            get_event_project,
            get_all_projects,
            reset_database,
            get_sync_status,
            sync_all_sources,
            create_project,
            update_project,
            delete_project,
            get_events_by_project,
            get_project,
            get_setting,
            set_setting,
            assign_event_to_project,
            create_project_rule,
            get_project_rules,
            update_project_rule,
            delete_project_rule,
            apply_rules_to_events,
            get_zen_profile_path,
            set_zen_profile_path,
            auto_detect_zen_profile_path,
            get_github_orgs,
            add_github_org,
            remove_github_org,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

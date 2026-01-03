use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: Option<i64>,
    pub event_type: String,
    pub title: String,
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub start_date: i64, // Unix timestamp in seconds (UTC)
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub end_date: i64, // Unix timestamp in seconds (UTC)
    pub external_id: Option<String>,
    pub external_link: Option<String>,
    pub type_specific_data: Option<String>,
    pub project_id: Option<i64>,
    pub organizer_id: Option<i64>, // FK to contacts table (calendar events)
    pub repository_path: Option<String>, // Canonical org/repo path (git/browser events)
    pub domain: Option<String>,    // Domain (browser_history events)
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub created_at: i64, // Unix timestamp in seconds (UTC)
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub updated_at: i64, // Unix timestamp in seconds (UTC)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: Option<i64>,
    pub name: String,
    pub color: Option<String>,
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub created_at: i64, // Unix timestamp in seconds (UTC)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectRule {
    pub id: Option<i64>,
    pub project_id: i64,
    pub rule_type: String, // "organizer", "title_pattern", "repository"
    pub match_value: String,
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub created_at: i64, // Unix timestamp in seconds (UTC)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEventData {
    pub location: Option<String>,
    pub notes: Option<String>,
    pub is_all_day: bool,
    pub organizer: Option<String>,
    pub attendees: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitEventData {
    pub repository_id: String,
    pub repository_name: String,
    pub activity_type: String,
    pub ref_name: Option<String>,
    pub commit_hash: Option<String>,
    pub repository_path: Option<String>, // Canonical org/repo path (e.g., "facebook/react")
    pub origin_url: Option<String>,      // Full remote origin URL
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkDomain {
    pub id: Option<i64>,
    pub domain: String,
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BrowserHistoryEventData {
    pub url: String,
    pub domain: String,
    pub page_title: Option<String>,
    pub visit_count: i32,
    pub repository_path: Option<String>, // Canonical org/repo path if this is a code repo visit
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStatus {
    #[serde(
        serialize_with = "serialize_optional_timestamp",
        deserialize_with = "deserialize_optional_timestamp"
    )]
    pub last_sync_time: Option<i64>, // Unix timestamp in seconds (UTC)
    pub sync_in_progress: bool,
    #[serde(
        serialize_with = "serialize_timestamp",
        deserialize_with = "deserialize_timestamp"
    )]
    pub updated_at: i64, // Unix timestamp in seconds (UTC)
}

// Serde helper functions for timestamp serialization
fn serialize_timestamp<S>(timestamp: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    let datetime = chrono::DateTime::from_timestamp(*timestamp, 0)
        .ok_or_else(|| serde::ser::Error::custom("Invalid timestamp"))?;
    serializer.serialize_str(&datetime.to_rfc3339())
}

fn deserialize_timestamp<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s = String::deserialize(deserializer)?;
    chrono::DateTime::parse_from_rfc3339(&s)
        .map(|dt| dt.timestamp())
        .map_err(serde::de::Error::custom)
}

fn serialize_optional_timestamp<S>(
    timestamp: &Option<i64>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    match timestamp {
        Some(ts) => {
            let datetime = chrono::DateTime::from_timestamp(*ts, 0)
                .ok_or_else(|| serde::ser::Error::custom("Invalid timestamp"))?;
            serializer.serialize_some(&datetime.to_rfc3339())
        }
        None => serializer.serialize_none(),
    }
}

fn deserialize_optional_timestamp<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt: Option<String> = Option::deserialize(deserializer)?;
    match opt {
        Some(s) => chrono::DateTime::parse_from_rfc3339(&s)
            .map(|dt| Some(dt.timestamp()))
            .map_err(serde::de::Error::custom),
        None => Ok(None),
    }
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Ok(Database { conn })
    }

    pub fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(name, email)
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                start_date INTEGER NOT NULL,
                end_date INTEGER NOT NULL,
                external_id TEXT,
                external_link TEXT,
                type_specific_data TEXT,
                project_id INTEGER,
                organizer_id INTEGER,
                repository_path TEXT,
                domain TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(event_type, external_id),
                FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL,
                FOREIGN KEY (organizer_id) REFERENCES contacts (id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS sync_metadata (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                last_sync_time INTEGER,
                sync_in_progress INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                rule_type TEXT NOT NULL,
                match_value TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
                UNIQUE(rule_type, match_value)
            );

            CREATE TABLE IF NOT EXISTS work_domains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                domain TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
            CREATE INDEX IF NOT EXISTS idx_events_external_id ON events(event_type, external_id);
            CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id);
            CREATE INDEX IF NOT EXISTS idx_project_rules_project_id ON project_rules(project_id);
            CREATE INDEX IF NOT EXISTS idx_work_domains_domain ON work_domains(domain);
            -- Performance indexes for browser events and common queries
            CREATE INDEX IF NOT EXISTS idx_events_type_date ON events(event_type, start_date DESC);
            CREATE INDEX IF NOT EXISTS idx_events_project_date ON events(project_id, start_date DESC) WHERE project_id IS NOT NULL;
            -- Indexes for promoted fields
            CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id) WHERE organizer_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_events_repository_path ON events(repository_path) WHERE repository_path IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_events_domain ON events(domain) WHERE domain IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
            ",
        )?;

        // Initialize default settings if they don't exist
        self.init_default_settings()?;

        Ok(())
    }

    fn init_default_settings(&self) -> Result<()> {
        let now = chrono::Utc::now().timestamp();

        // Set default git dev folder to ~/Development if not already set
        let has_git_folder: bool = self.conn.query_row(
            "SELECT COUNT(*) FROM settings WHERE key = 'git_dev_folder'",
            [],
            |row| row.get::<_, i64>(0).map(|count| count > 0),
        )?;

        if !has_git_folder {
            // Get home directory
            if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
                let default_dev_folder = format!("{}/Development", home);
                self.conn.execute(
                    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
                    rusqlite::params!["git_dev_folder", default_dev_folder, now],
                )?;
            }
        }

        // Initialize default work domains if none exist
        let has_work_domains: bool =
            self.conn
                .query_row("SELECT COUNT(*) > 0 FROM work_domains", [], |row| {
                    row.get(0)
                })?;

        if !has_work_domains {
            let default_domains = vec![
                "dropbox.com",
                "paper.dropbox.com",
                "docs.google.com",
                "sheets.google.com",
                "slides.google.com",
                "drive.google.com",
                "monday.com",
                "notion.so",
                "linear.app",
                "github.com",
                "gitlab.com",
                "stackoverflow.com",
                "developer.mozilla.org",
            ];

            for domain in default_domains {
                self.conn.execute(
                    "INSERT OR IGNORE INTO work_domains (domain, created_at) VALUES (?1, ?2)",
                    rusqlite::params![domain, now],
                )?;
            }
        }

        // Auto-detect Zen profile path if not already set
        let has_zen_profile: bool = self.conn.query_row(
            "SELECT COUNT(*) FROM settings WHERE key = 'zen_browser_profile_path'",
            [],
            |row| row.get::<_, i64>(0).map(|count| count > 0),
        )?;

        if !has_zen_profile {
            if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
                let profiles_dir = format!("{}/Library/Application Support/zen/Profiles", home);
                if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
                    // Collect all profiles that contain "default"
                    let mut default_profiles = Vec::new();
                    for entry in entries.flatten() {
                        if let Some(name) = entry.file_name().to_str() {
                            let name_lower = name.to_lowercase();
                            if name_lower.contains("default") {
                                default_profiles.push((name.to_string(), entry.path()));
                            }
                        }
                    }

                    // Prefer profiles with "release" in the name, then fall back to any default
                    let selected_profile = default_profiles
                        .iter()
                        .find(|(name, _)| name.to_lowercase().contains("release"))
                        .or_else(|| default_profiles.first());

                    if let Some((_, path)) = selected_profile {
                        let profile_path = path.to_string_lossy().to_string();
                        self.conn.execute(
                            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
                            rusqlite::params!["zen_browser_profile_path", profile_path, now],
                        )?;
                    }
                }
            }
        }

        Ok(())
    }

    pub fn clear_event_data(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            DELETE FROM events;
            DELETE FROM contacts;
            DELETE FROM sync_metadata;
            ",
        )?;
        Ok(())
    }

    pub fn upsert_event(&self, event: &Event) -> Result<(i64, bool)> {
        let now = chrono::Utc::now().timestamp();
        let created_at = if event.created_at == 0 {
            now
        } else {
            event.created_at
        };

        // Check if event already exists
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM events WHERE event_type = ?1 AND external_id = ?2",
                rusqlite::params![event.event_type, event.external_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        self.conn.execute(
            "INSERT INTO events (event_type, title, start_date, end_date, external_id, external_link, type_specific_data, project_id, organizer_id, repository_path, domain, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(event_type, external_id) DO UPDATE SET
                title = excluded.title,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                external_link = excluded.external_link,
                type_specific_data = excluded.type_specific_data,
                project_id = excluded.project_id,
                organizer_id = excluded.organizer_id,
                repository_path = excluded.repository_path,
                domain = excluded.domain,
                updated_at = excluded.updated_at",
            rusqlite::params![
                event.event_type,
                event.title,
                event.start_date,
                event.end_date,
                event.external_id,
                event.external_link,
                event.type_specific_data,
                event.project_id,
                event.organizer_id,
                event.repository_path,
                event.domain,
                created_at,
                now,
            ],
        )?;

        // Get the actual event ID (works for both INSERT and UPDATE)
        let event_id: i64 = self.conn.query_row(
            "SELECT id FROM events WHERE event_type = ?1 AND external_id = ?2",
            rusqlite::params![event.event_type, event.external_id],
            |row| row.get(0),
        )?;

        // Return (event_id, was_new)
        Ok((event_id, !exists))
    }

    pub fn assign_event_to_project(&self, event_id: i64, project_id: Option<i64>) -> Result<()> {
        self.conn.execute(
            "UPDATE events SET project_id = ?1 WHERE id = ?2",
            rusqlite::params![project_id, event_id],
        )?;
        Ok(())
    }

    pub fn get_events(&self, start_date: Option<i64>, end_date: Option<i64>) -> Result<Vec<Event>> {
        // Get work domains once for the SQL filter
        let work_domains = self.get_work_domains()?;

        let mut sql = "SELECT id, event_type, title, start_date, end_date, external_id, external_link, type_specific_data, project_id, organizer_id, repository_path, domain, created_at, updated_at FROM events".to_string();

        let mut conditions = Vec::new();
        let mut owned_conditions: Vec<String> = Vec::new(); // Store owned strings
        let end_date_condition: String;

        // Add date range conditions
        if start_date.is_some() {
            conditions.push("start_date >= ?1");
        }
        if end_date.is_some() {
            let idx = if start_date.is_some() { 2 } else { 1 };
            end_date_condition = format!("end_date <= ?{}", idx);
            conditions.push(&end_date_condition);
        }

        // Filter browser events by work domains using promoted domain field
        if !work_domains.is_empty() {
            // Build parameterized placeholders for domains
            let placeholders: Vec<String> = (0..work_domains.len())
                .map(|i| {
                    let param_idx = if start_date.is_some() && end_date.is_some() {
                        3 + i
                    } else if start_date.is_some() || end_date.is_some() {
                        2 + i
                    } else {
                        1 + i
                    };
                    format!("domain = ?{}", param_idx)
                })
                .collect();

            let browser_filter = format!(
                "(event_type != 'browser_history' OR ({}))",
                placeholders.join(" OR ")
            );
            owned_conditions.push(browser_filter);
            conditions.push(owned_conditions.last().unwrap());
        } else {
            // If no work domains configured, exclude all browser events
            conditions.push("event_type != 'browser_history'");
        }

        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        sql.push_str(" ORDER BY start_date ASC");

        let mut stmt = self.conn.prepare(&sql)?;

        // Build params: first date params, then domain params
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(start) = start_date {
            params_vec.push(Box::new(start));
        }
        if let Some(end) = end_date {
            params_vec.push(Box::new(end));
        }
        // Add domain parameters
        for domain in &work_domains {
            params_vec.push(Box::new(domain.domain.clone()));
        }

        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|b| b.as_ref()).collect();
        let event_iter = stmt.query_map(params_refs.as_slice(), |row| {
            Ok(Event {
                id: Some(row.get(0)?),
                event_type: row.get(1)?,
                title: row.get(2)?,
                start_date: row.get(3)?,
                end_date: row.get(4)?,
                external_id: row.get(5)?,
                external_link: row.get(6)?,
                type_specific_data: row.get(7)?,
                project_id: row.get(8)?,
                organizer_id: row.get(9)?,
                repository_path: row.get(10)?,
                domain: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;

        let events: Vec<Event> = event_iter.collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    pub fn get_event_project(&self, event_id: i64) -> Result<Option<Project>> {
        let result = self.conn.query_row(
            "SELECT p.id, p.name, p.color, p.created_at
             FROM projects p
             JOIN events e ON e.project_id = p.id
             WHERE e.id = ?1",
            rusqlite::params![event_id],
            |row| {
                Ok(Project {
                    id: Some(row.get(0)?),
                    name: row.get(1)?,
                    color: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        );

        match result {
            Ok(project) => Ok(Some(project)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_all_projects(&self) -> Result<Vec<Project>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, color, created_at FROM projects ORDER BY name")?;

        let projects = stmt
            .query_map([], |row| {
                Ok(Project {
                    id: Some(row.get(0)?),
                    name: row.get(1)?,
                    color: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(projects)
    }

    pub fn get_sync_status(&self) -> Result<SyncStatus> {
        let result = self.conn.query_row(
            "SELECT last_sync_time, sync_in_progress, updated_at FROM sync_metadata WHERE id = 1",
            [],
            |row| {
                Ok(SyncStatus {
                    last_sync_time: row.get(0)?,
                    sync_in_progress: row.get::<_, i32>(1)? != 0,
                    updated_at: row.get(2)?,
                })
            },
        );

        match result {
            Ok(status) => Ok(status),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // No sync has happened yet
                Ok(SyncStatus {
                    last_sync_time: None,
                    sync_in_progress: false,
                    updated_at: chrono::Utc::now().timestamp(),
                })
            }
            Err(e) => Err(e),
        }
    }

    pub fn update_sync_status(
        &self,
        last_sync_time: Option<i64>,
        sync_in_progress: bool,
    ) -> Result<()> {
        let now = chrono::Utc::now().timestamp();

        // If last_sync_time is provided, use it; otherwise keep existing value
        if let Some(sync_time) = last_sync_time {
            self.conn.execute(
                "INSERT INTO sync_metadata (id, last_sync_time, sync_in_progress, updated_at)
                 VALUES (1, ?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET
                    last_sync_time = excluded.last_sync_time,
                    sync_in_progress = excluded.sync_in_progress,
                    updated_at = excluded.updated_at",
                rusqlite::params![sync_time, if sync_in_progress { 1 } else { 0 }, now],
            )?;
        } else {
            // Only update sync_in_progress, don't touch last_sync_time
            self.conn.execute(
                "INSERT INTO sync_metadata (id, last_sync_time, sync_in_progress, updated_at)
                 VALUES (1, NULL, ?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET
                    sync_in_progress = excluded.sync_in_progress,
                    updated_at = excluded.updated_at",
                rusqlite::params![if sync_in_progress { 1 } else { 0 }, now],
            )?;
        }

        Ok(())
    }

    pub fn create_project(&self, name: &str, color: Option<&str>) -> Result<i64> {
        let now = chrono::Utc::now().timestamp();

        self.conn.execute(
            "INSERT INTO projects (name, color, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![name, color, now],
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_project(&self, id: i64, name: &str, color: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE projects SET name = ?1, color = ?2 WHERE id = ?3",
            rusqlite::params![name, color, id],
        )?;

        Ok(())
    }

    pub fn delete_project(&self, id: i64) -> Result<()> {
        // Events with this project_id will have it set to NULL due to ON DELETE SET NULL
        self.conn
            .execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])?;

        Ok(())
    }

    pub fn get_events_by_project(
        &self,
        project_id: i64,
        start_date: Option<i64>,
        end_date: Option<i64>,
    ) -> Result<Vec<Event>> {
        // Note: For project-specific queries, we can skip work domain filtering
        // since browser events assigned to projects are already considered "work"
        let mut query = String::from(
            "SELECT id, event_type, title, start_date, end_date, external_id, external_link, type_specific_data, project_id, organizer_id, repository_path, domain, created_at, updated_at
             FROM events
             WHERE project_id = ?"
        );

        let mut param_count = 1;

        if start_date.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND start_date >= ?{}", param_count));
        }
        if end_date.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND end_date <= ?{}", param_count));
        }

        query.push_str(" ORDER BY start_date DESC");

        let mut stmt = self.conn.prepare(&query)?;

        // Build params vector dynamically
        let mut params_vec: Vec<i64> = vec![project_id];
        if let Some(start) = start_date {
            params_vec.push(start);
        }
        if let Some(end) = end_date {
            params_vec.push(end);
        }

        let events: Vec<Event> = stmt
            .query_map(rusqlite::params_from_iter(params_vec), |row| {
                Ok(Event {
                    id: Some(row.get(0)?),
                    event_type: row.get(1)?,
                    title: row.get(2)?,
                    start_date: row.get(3)?,
                    end_date: row.get(4)?,
                    external_id: row.get(5)?,
                    external_link: row.get(6)?,
                    type_specific_data: row.get(7)?,
                    project_id: row.get(8)?,
                    organizer_id: row.get(9)?,
                    repository_path: row.get(10)?,
                    domain: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(events)
    }

    pub fn get_project(&self, id: i64) -> Result<Option<Project>> {
        let result = self.conn.query_row(
            "SELECT id, name, color, created_at FROM projects WHERE id = ?1",
            rusqlite::params![id],
            |row| {
                Ok(Project {
                    id: Some(row.get(0)?),
                    name: row.get(1)?,
                    color: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        );

        match result {
            Ok(project) => Ok(Some(project)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query([key])?;

        if let Some(row) = rows.next()? {
            let value: String = row.get(0)?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        self.conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            (key, value, now),
        )?;
        Ok(())
    }

    // Work domain operations
    pub fn get_work_domains(&self) -> Result<Vec<WorkDomain>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, domain, created_at FROM work_domains ORDER BY domain")?;

        let domains = stmt
            .query_map([], |row| {
                Ok(WorkDomain {
                    id: Some(row.get(0)?),
                    domain: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;

        Ok(domains)
    }

    // GitHub org operations (stored in settings as JSON array)
    pub fn get_github_orgs(&self) -> Result<Vec<String>> {
        match self.get_setting("github_orgs")? {
            Some(json_str) => serde_json::from_str(&json_str)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e))),
            None => Ok(Vec::new()),
        }
    }

    pub fn add_github_org(&self, org_name: &str) -> Result<()> {
        // Validate org name format (GitHub org names: alphanumeric and hyphens only)
        if org_name.is_empty() || org_name.len() > 39 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "Invalid GitHub org name: '{}'. Must be 1-39 characters.",
                org_name
            )));
        }

        // GitHub org names can only contain alphanumeric characters and hyphens
        // Cannot start with a hyphen
        if org_name.starts_with('-') || !org_name.chars().all(|c| c.is_alphanumeric() || c == '-') {
            return Err(rusqlite::Error::InvalidParameterName(
                format!("Invalid GitHub org name: '{}'. Must contain only alphanumeric characters and hyphens, and cannot start with a hyphen.", org_name)
            ));
        }

        let mut orgs = self.get_github_orgs()?;

        // Check if already exists
        if orgs.contains(&org_name.to_string()) {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "GitHub org '{}' already exists.",
                org_name
            )));
        }

        orgs.push(org_name.to_string());
        let json_str = serde_json::to_string(&orgs)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        self.set_setting("github_orgs", &json_str)?;
        Ok(())
    }

    pub fn remove_github_org(&self, org_name: &str) -> Result<()> {
        let mut orgs = self.get_github_orgs()?;
        orgs.retain(|o| o != org_name);

        let json_str = serde_json::to_string(&orgs)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        self.set_setting("github_orgs", &json_str)?;
        Ok(())
    }

    /// Get unique repository paths from discovered git repositories
    /// Returns canonical org/repo paths like ["facebook/react", "vercel/next.js"]
    pub fn get_discovered_repository_paths(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT json_extract(type_specific_data, '$.repository_path') as repo_path
             FROM events
             WHERE event_type = 'git'
             AND json_extract(type_specific_data, '$.repository_path') IS NOT NULL",
        )?;

        let paths = stmt
            .query_map([], |row| {
                let path: String = row.get(0)?;
                Ok(path)
            })?
            .filter_map(Result::ok)
            .collect();

        Ok(paths)
    }

    // Project Rule operations
    pub fn create_project_rule(
        &self,
        project_id: i64,
        rule_type: &str,
        match_value: &str,
    ) -> Result<i64> {
        let now = chrono::Utc::now().timestamp();

        self.conn.execute(
            "INSERT INTO project_rules (project_id, rule_type, match_value, created_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![project_id, rule_type, match_value, now],
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_project_rules(&self, project_id: Option<i64>) -> Result<Vec<ProjectRule>> {
        let query = if project_id.is_some() {
            "SELECT id, project_id, rule_type, match_value, created_at FROM project_rules WHERE project_id = ?1 ORDER BY created_at DESC"
        } else {
            "SELECT id, project_id, rule_type, match_value, created_at FROM project_rules ORDER BY created_at DESC"
        };

        let mut stmt = self.conn.prepare(query)?;

        let rules = if let Some(pid) = project_id {
            stmt.query_map([pid], |row| {
                Ok(ProjectRule {
                    id: Some(row.get(0)?),
                    project_id: row.get(1)?,
                    rule_type: row.get(2)?,
                    match_value: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?
        } else {
            stmt.query_map([], |row| {
                Ok(ProjectRule {
                    id: Some(row.get(0)?),
                    project_id: row.get(1)?,
                    rule_type: row.get(2)?,
                    match_value: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?
        };

        Ok(rules)
    }

    pub fn update_project_rule(
        &self,
        rule_id: i64,
        rule_type: &str,
        match_value: &str,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE project_rules SET rule_type = ?1, match_value = ?2 WHERE id = ?3",
            rusqlite::params![rule_type, match_value, rule_id],
        )?;
        Ok(())
    }

    pub fn delete_project_rule(&self, rule_id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM project_rules WHERE id = ?1", [rule_id])?;
        Ok(())
    }

    pub fn apply_rules_to_events(&self) -> Result<usize> {
        let rules = self.get_project_rules(None)?;
        let mut updated_count = 0;

        for rule in rules {
            let count = match rule.rule_type.as_str() {
                "organizer" => {
                    // Match calendar events by organizer contact name
                    self.conn.execute(
                        "UPDATE events
                         SET project_id = ?1
                         WHERE event_type = 'calendar'
                         AND organizer_id IN (SELECT id FROM contacts WHERE name = ?2)",
                        rusqlite::params![rule.project_id, rule.match_value],
                    )?
                }
                "title_pattern" => {
                    // Match calendar events by title pattern (case-insensitive)
                    self.conn.execute(
                        "UPDATE events
                         SET project_id = ?1
                         WHERE event_type = 'calendar'
                         AND lower(title) LIKE lower(?2)",
                        rusqlite::params![rule.project_id, format!("%{}%", rule.match_value)],
                    )?
                }
                "repository" => {
                    // Match git/browser events by repository path using promoted field
                    self.conn.execute(
                        "UPDATE events
                         SET project_id = ?1
                         WHERE (event_type = 'git' OR event_type = 'browser_history')
                         AND repository_path = ?2",
                        rusqlite::params![rule.project_id, rule.match_value],
                    )?
                }
                "url_pattern" => {
                    // Match browser events by URL pattern (still in JSON)
                    self.conn.execute(
                        "UPDATE events
                         SET project_id = ?1
                         WHERE event_type = 'browser_history'
                         AND json_extract(type_specific_data, '$.url') LIKE ?2",
                        rusqlite::params![rule.project_id, rule.match_value],
                    )?
                }
                "domain" => {
                    // Match browser events by domain using promoted field
                    self.conn.execute(
                        "UPDATE events
                         SET project_id = ?1
                         WHERE event_type = 'browser_history'
                         AND domain = ?2",
                        rusqlite::params![rule.project_id, rule.match_value],
                    )?
                }
                _ => 0,
            };
            updated_count += count;
        }

        Ok(updated_count)
    }

    // Contact operations
    /// Find or create a contact by name and optional email
    /// Returns the contact ID
    pub fn upsert_contact(&self, name: &str, email: Option<&str>) -> Result<i64> {
        let now = chrono::Utc::now().timestamp();

        // Try to find existing contact by name and email
        let existing: Option<i64> = self
            .conn
            .query_row(
                "SELECT id FROM contacts WHERE name = ?1 AND email IS ?2",
                rusqlite::params![name, email],
                |row| row.get(0),
            )
            .ok();

        if let Some(id) = existing {
            // Update the timestamp
            self.conn.execute(
                "UPDATE contacts SET updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )?;
            return Ok(id);
        }

        // Insert new contact
        self.conn.execute(
            "INSERT INTO contacts (name, email, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![name, email, now, now],
        )?;

        Ok(self.conn.last_insert_rowid())
    }
}

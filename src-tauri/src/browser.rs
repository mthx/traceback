use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BrowserVisit {
    pub url: String,
    pub title: Option<String>,
    pub visit_date: i64, // Unix timestamp in microseconds
    pub visit_count: i32,
}

/// Auto-detect Zen browser profile path
pub fn auto_detect_zen_profile() -> Result<Option<String>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let profiles_dir = PathBuf::from(home).join("Library/Application Support/zen/Profiles");

    if !profiles_dir.exists() {
        return Ok(None);
    }

    let entries = std::fs::read_dir(&profiles_dir)
        .map_err(|e| format!("Failed to read profiles directory: {}", e))?;

    // Collect all profiles that contain "default"
    let mut default_profiles = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        if let Some(name) = entry.file_name().to_str() {
            let name_lower = name.to_lowercase();
            if name_lower.contains("default") {
                default_profiles.push((name.to_string(), entry.path()));
            }
        }
    }

    // Prefer profiles with "release" in the name, then fall back to any default
    for (name, path) in &default_profiles {
        if name.to_lowercase().contains("release") {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }

    // If no release profile, return the first default profile
    if let Some((_, path)) = default_profiles.first() {
        return Ok(Some(path.to_string_lossy().to_string()));
    }

    Ok(None)
}

/// Get browser visits between specific timestamps (in seconds)
pub fn get_browser_visits_range(
    profile_path: &str,
    start_timestamp: i64,
    end_timestamp: i64,
) -> Result<Vec<BrowserVisit>, String> {
    let profile_path = PathBuf::from(profile_path);
    let places_path = profile_path.join("places.sqlite");

    if std::env::var("TRACEBACK_DEBUG").is_ok() {
        eprintln!("[Browser:DEBUG] Reading from: {}", places_path.display());
    }

    // Read directly from the places.sqlite file
    // SQLite can read from locked files in read-only mode
    query_visits(&places_path, start_timestamp, end_timestamp)
}

fn query_visits(
    db_path: &Path,
    start_timestamp: i64,
    end_timestamp: i64,
) -> Result<Vec<BrowserVisit>, String> {
    let debug = std::env::var("TRACEBACK_DEBUG").is_ok();

    if debug {
        eprintln!("[Browser:DEBUG] Opening database at: {}", db_path.display());
    }

    // Open in read-only mode with immutable flag
    // This allows reading even when Firefox/Zen has the file locked
    let db_uri = format!("file:{}?mode=ro&immutable=1", db_path.display());

    if debug {
        eprintln!("[Browser:DEBUG] Using URI: {}", db_uri);
    }

    let conn = Connection::open(&db_uri)
        .map_err(|e| format!("Failed to open places database: {}", e))?;

    // Verify this is a Firefox/Zen database
    if debug {
        eprintln!("[Browser:DEBUG] Checking database schema...");
    }

    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get(0))
                .map(|rows| rows.filter_map(Result::ok).collect())
        })
        .unwrap_or_default();

    if debug {
        eprintln!("[Browser:DEBUG] Found tables: {:?}", tables);
    }

    if !tables.contains(&"moz_places".to_string()) {
        return Err("Database does not contain moz_places table. This may not be a Firefox/Zen places.sqlite file.".to_string());
    }

    // Convert to microseconds for Firefox
    let start_micros = start_timestamp * 1_000_000;
    let end_micros = end_timestamp * 1_000_000;

    if debug {
        eprintln!("[Browser:DEBUG] Querying visits between {} and {} (microseconds)", start_micros, end_micros);
    }

    let mut stmt = conn.prepare(
        "SELECT
            moz_places.url,
            moz_places.title,
            moz_historyvisits.visit_date,
            moz_places.visit_count
         FROM moz_places
         INNER JOIN moz_historyvisits ON moz_places.id = moz_historyvisits.place_id
         WHERE moz_historyvisits.visit_date >= ?1
           AND moz_historyvisits.visit_date <= ?2
           -- Browser internal pages
           AND moz_places.url NOT LIKE 'chrome://%'
           AND moz_places.url NOT LIKE 'about:%'
           AND moz_places.url NOT LIKE 'moz-extension://%'
           -- Localhost and local development
           AND moz_places.url NOT LIKE 'http://localhost%'
           AND moz_places.url NOT LIKE 'https://localhost%'
           AND moz_places.url NOT LIKE 'http://127.0.0.1%'
           AND moz_places.url NOT LIKE 'https://127.0.0.1%'
           AND moz_places.url NOT LIKE '%.local/%'
           -- Authentication & OAuth flows
           AND moz_places.url NOT LIKE '%/auth/%'
           AND moz_places.url NOT LIKE '%/oauth/%'
           AND moz_places.url NOT LIKE '%/login%'
           AND moz_places.url NOT LIKE '%/signin%'
           AND moz_places.url NOT LIKE '%/sso/%'
           AND moz_places.url NOT LIKE '%/saml/%'
           AND moz_places.url NOT LIKE '%/authorize%'
           AND moz_places.url NOT LIKE '%/callback%'
           -- Tokens and credentials in URL params
           AND moz_places.url NOT LIKE '%access_token=%'
           AND moz_places.url NOT LIKE '%id_token=%'
           AND moz_places.url NOT LIKE '%refresh_token=%'
           AND moz_places.url NOT LIKE '%api_key=%'
           AND moz_places.url NOT LIKE '%apikey=%'
           AND moz_places.url NOT LIKE '%secret=%'
           AND moz_places.url NOT LIKE '%password=%'
           AND moz_places.url NOT LIKE '%session_id=%'
           -- Password & security pages
           AND moz_places.url NOT LIKE '%/password/%'
           AND moz_places.url NOT LIKE '%/security/%'
           AND moz_places.url NOT LIKE '%/2fa/%'
           AND moz_places.url NOT LIKE '%/mfa/%'
           -- Payment & checkout
           AND moz_places.url NOT LIKE '%/checkout%'
           AND moz_places.url NOT LIKE '%/payment%'
           AND moz_places.url NOT LIKE '%/billing%'
           -- Admin panels
           AND moz_places.url NOT LIKE '%/admin/%'
           AND moz_places.url NOT LIKE '%/wp-admin/%'
           -- Email clients (specific message URLs)
           AND moz_places.url NOT LIKE '%mail.google.com/mail/u/%/#%'
           AND moz_places.url NOT LIKE '%outlook.live.com/mail/%/inbox/id/%'
         ORDER BY moz_historyvisits.visit_date DESC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

    let visits = stmt
        .query_map(rusqlite::params![start_micros, end_micros], |row| {
            Ok(BrowserVisit {
                url: row.get(0)?,
                title: row.get(1)?,
                visit_date: row.get(2)?,
                visit_count: row.get(3)?,
            })
        })
        .map_err(|e| format!("Query failed: {}", e))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;

    Ok(visits)
}

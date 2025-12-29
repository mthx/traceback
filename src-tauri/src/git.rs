use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitRepository {
    pub repository_id: String,
    pub repository_name: String,
    pub local_path: PathBuf,
    pub repository_path: Option<String>, // Canonical org/repo path (e.g., "facebook/react")
    pub origin_url: Option<String>,      // Full remote origin URL
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitActivity {
    pub repository_id: String,
    pub repository_name: String,
    pub activity_type: GitActivityType,
    pub timestamp: String,
    pub ref_name: Option<String>,
    pub commit_hash: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GitActivityType {
    Commit,
    Checkout,
    Merge,
    Rebase,
    Pull,
    Push,
    Stash,
    Reset,
    CherryPick,
}

impl GitActivityType {
    fn from_reflog_message(message: &str) -> Option<Self> {
        if message.starts_with("commit") {
            Some(GitActivityType::Commit)
        } else if message.starts_with("checkout") {
            Some(GitActivityType::Checkout)
        } else if message.starts_with("merge") {
            Some(GitActivityType::Merge)
        } else if message.starts_with("rebase") {
            Some(GitActivityType::Rebase)
        } else if message.starts_with("pull") {
            Some(GitActivityType::Pull)
        } else if message.starts_with("reset") {
            Some(GitActivityType::Reset)
        } else if message.starts_with("cherry-pick") {
            Some(GitActivityType::CherryPick)
        } else if message.contains("stash") {
            Some(GitActivityType::Stash)
        } else {
            None
        }
    }
}

/// Discover git repositories in a directory tree up to max_depth
pub fn discover_repositories(
    root_path: &Path,
    max_depth: usize,
) -> Result<Vec<GitRepository>, String> {
    let mut repositories = Vec::new();
    walk_directory(root_path, 0, max_depth, &mut repositories)?;
    Ok(repositories)
}

fn walk_directory(
    path: &Path,
    current_depth: usize,
    max_depth: usize,
    repositories: &mut Vec<GitRepository>,
) -> Result<(), String> {
    if current_depth > max_depth {
        return Ok(());
    }

    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[Git] Failed to read directory {}: {}", path.display(), e);
            return Ok(()); // Continue even if we can't read this directory
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // Skip entries we can't read
        };

        let entry_path = entry.path();

        // Check if this is a .git directory
        if entry_path.is_dir() && entry_path.file_name().and_then(|n| n.to_str()) == Some(".git") {
            if let Some(parent) = entry_path.parent() {
                match identify_repository(parent) {
                    Ok(repo) => {
                        repositories.push(repo);
                    }
                    Err(e) => {
                        eprintln!(
                            "[Git] Failed to identify repository at {}: {}",
                            parent.display(),
                            e
                        );
                    }
                }
            }
            continue; // Don't recurse into .git directories
        }

        // Recurse into subdirectories (but skip hidden directories except .git)
        if entry_path.is_dir() {
            let dir_name = entry_path.file_name().and_then(|n| n.to_str());
            if let Some(name) = dir_name {
                // Skip hidden directories, node_modules, build artifacts, etc.
                if !name.starts_with('.')
                    && name != "node_modules"
                    && name != "target"
                    && name != "dist"
                    && name != "build"
                    && name != "vendor"
                    && name != ".git"
                    && name != ".npm"
                    && name != ".cache"
                {
                    let _ = walk_directory(&entry_path, current_depth + 1, max_depth, repositories);
                }
            }
        }
    }

    Ok(())
}

/// Parse repository path from origin URL
/// Examples:
/// - https://github.com/facebook/react.git → facebook/react
/// - git@github.com:facebook/react.git → facebook/react
/// - https://gitlab.com/gitlab-org/gitlab-foss.git → gitlab-org/gitlab-foss
/// - https://bitbucket.org/atlassian/jira.git → atlassian/jira
fn parse_repository_path(origin_url: &str) -> Option<String> {
    // Handle SSH format: git@host:path/to/repo.git
    if origin_url.starts_with("git@") {
        if let Some(colon_idx) = origin_url.find(':') {
            let path = &origin_url[colon_idx + 1..];
            let cleaned = path.trim_end_matches(".git");
            return Some(cleaned.to_string());
        }
    }

    // Handle HTTPS format: https://host/path/to/repo.git
    if origin_url.starts_with("http://") || origin_url.starts_with("https://") {
        // Find the host/path separator
        if let Some(protocol_end) = origin_url.find("://") {
            let after_protocol = &origin_url[protocol_end + 3..];

            // Find the first slash (end of host)
            if let Some(first_slash) = after_protocol.find('/') {
                let path = &after_protocol[first_slash + 1..];
                let cleaned = path.trim_end_matches(".git");
                return Some(cleaned.to_string());
            }
        }
    }

    None
}

/// Identify a git repository using hash of all initial commits
fn identify_repository(repo_path: &Path) -> Result<GitRepository, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // Get origin URL if available
    let origin_url = get_remote_origin(&repo).ok();

    // Parse repository path from origin URL
    let repository_path = origin_url
        .as_ref()
        .and_then(|url| parse_repository_path(url));

    // Generate repository ID
    let repository_id = match &origin_url {
        Some(url) => {
            let hash = format!("{:x}", md5::compute(url.as_bytes()));
            hash
        }
        None => {
            // Fallback: Hash of absolute path
            let canonical_path =
                std::fs::canonicalize(repo_path).unwrap_or_else(|_| repo_path.to_path_buf());
            let path_str = canonical_path.to_string_lossy();
            let hash = format!("{:x}", md5::compute(path_str.as_bytes()));
            format!("local-{}", hash)
        }
    };

    let repository_name = repo_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(GitRepository {
        repository_id,
        repository_name,
        local_path: repo_path.to_path_buf(),
        repository_path,
        origin_url,
    })
}

fn get_remote_origin(repo: &Repository) -> Result<String, String> {
    let remote = repo
        .find_remote("origin")
        .map_err(|e| format!("Failed to find remote origin: {}", e))?;

    let url = remote
        .url()
        .ok_or_else(|| "Remote origin has no URL".to_string())?;

    Ok(url.to_string())
}

/// Get git activities from a repository since a given date
pub fn get_repository_activities(
    repo_info: &GitRepository,
    since_date: Option<&str>,
) -> Result<Vec<GitActivity>, String> {
    let repo = Repository::open(&repo_info.local_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let mut activities = Vec::new();

    // Parse since_date if provided
    let since_timestamp = if let Some(date_str) = since_date {
        chrono::DateTime::parse_from_rfc3339(date_str)
            .map(|dt| dt.timestamp())
            .ok()
    } else {
        None
    };

    // Walk through all reflogs
    let reflog_refs = vec!["HEAD", "refs/heads/*", "refs/remotes/*"];

    for ref_pattern in reflog_refs {
        if walk_reflog(
            &repo,
            ref_pattern,
            since_timestamp,
            &mut activities,
            repo_info,
        )
        .is_err()
        {
            // Skip refs that don't exist or can't be read
            continue;
        }
    }

    Ok(activities)
}

fn walk_reflog(
    repo: &Repository,
    ref_name: &str,
    since_timestamp: Option<i64>,
    activities: &mut Vec<GitActivity>,
    repo_info: &GitRepository,
) -> Result<(), String> {
    // Handle glob patterns
    if ref_name.contains('*') {
        let references = repo
            .references()
            .map_err(|e| format!("Failed to get references: {}", e))?;

        for reference in references {
            let reference = reference.map_err(|e| format!("Failed to get reference: {}", e))?;
            if let Some(name) = reference.name() {
                if matches_pattern(name, ref_name) {
                    let _ = walk_single_reflog(repo, name, since_timestamp, activities, repo_info);
                }
            }
        }
    } else {
        walk_single_reflog(repo, ref_name, since_timestamp, activities, repo_info)?;
    }

    Ok(())
}

fn matches_pattern(name: &str, pattern: &str) -> bool {
    let pattern_parts: Vec<&str> = pattern.split('*').collect();
    if pattern_parts.len() == 2 {
        name.starts_with(pattern_parts[0]) && name.ends_with(pattern_parts[1])
    } else {
        name == pattern
    }
}

fn walk_single_reflog(
    repo: &Repository,
    ref_name: &str,
    since_timestamp: Option<i64>,
    activities: &mut Vec<GitActivity>,
    repo_info: &GitRepository,
) -> Result<(), String> {
    let reflog = repo
        .reflog(ref_name)
        .map_err(|e| format!("Failed to read reflog for {}: {}", ref_name, e))?;

    for entry in reflog.iter() {
        let timestamp = entry.committer().when().seconds();

        // Skip entries before the cutoff
        if let Some(since) = since_timestamp {
            if timestamp < since {
                continue;
            }
        }

        let message = entry.message().unwrap_or("");

        // Determine activity type from message
        let activity_type = match GitActivityType::from_reflog_message(message) {
            Some(t) => t,
            None => continue, // Skip unknown activity types
        };

        // Skip fetch/clone events (we care about pull, not fetch)
        if message.contains("fetch") || message.contains("clone") {
            continue;
        }

        // Extract ref name and commit info
        let ref_name_extracted = extract_ref_name(message, &activity_type);
        let commit_hash = Some(entry.id_new().to_string());

        // Get commit message if available
        let commit_message = if let Ok(commit) = repo.find_commit(entry.id_new()) {
            commit.message().unwrap_or("").to_string()
        } else {
            String::new()
        };

        // Create activity record
        let activity = GitActivity {
            repository_id: repo_info.repository_id.clone(),
            repository_name: repo_info.repository_name.clone(),
            activity_type,
            timestamp: chrono::DateTime::from_timestamp(timestamp, 0)
                .unwrap_or_default()
                .to_rfc3339(),
            ref_name: ref_name_extracted,
            commit_hash,
            message: format_activity_message(message, &commit_message),
        };

        activities.push(activity);
    }

    Ok(())
}

fn extract_ref_name(message: &str, activity_type: &GitActivityType) -> Option<String> {
    match activity_type {
        GitActivityType::Checkout => {
            // "checkout: moving from main to feature-branch"
            if let Some(to_idx) = message.find(" to ") {
                let ref_name = &message[to_idx + 4..];
                Some(ref_name.to_string())
            } else {
                None
            }
        }
        GitActivityType::Commit => {
            None // Will be set separately if needed
        }
        GitActivityType::Merge => {
            // "merge feature-branch: Merge branch 'feature-branch'"
            message
                .split_whitespace()
                .nth(1)
                .map(|s| s.trim_end_matches(':').to_string())
        }
        GitActivityType::Rebase => {
            // "rebase (start): checkout main"
            message.split_whitespace().nth(1).map(|s| s.to_string())
        }
        _ => None,
    }
}

fn format_activity_message(reflog_message: &str, commit_message: &str) -> String {
    // For commits, use just the commit message (no prefix needed)
    if reflog_message.starts_with("commit") && !commit_message.is_empty() {
        return commit_message
            .lines()
            .next()
            .unwrap_or(commit_message)
            .to_string();
    }

    // For checkouts, extract branch names: "checkout: moving from X to Y" -> "Switched to Y (from X)"
    if reflog_message.starts_with("checkout: moving from ") {
        if let Some(to_idx) = reflog_message.find(" to ") {
            let from_branch = &reflog_message[22..to_idx]; // after "checkout: moving from "
            let to_branch = &reflog_message[to_idx + 4..];
            return format!("Switched to {} (from {})", to_branch, from_branch);
        }
    }

    // For merge operations: "merge branch-name: Merge branch 'branch-name'" -> "Merged branch-name"
    if reflog_message.starts_with("merge ") {
        if let Some(colon_idx) = reflog_message.find(':') {
            let branch = &reflog_message[6..colon_idx].trim();
            return format!("Merged {}", branch);
        }
    }

    // For reset operations: "reset: moving to HEAD" -> "Reset to HEAD"
    if let Some(target) = reflog_message.strip_prefix("reset: moving to ") {
        return format!("Reset to {}", target);
    }

    // For pull operations: "pull: Fast-forward" -> "Pulled (fast-forward)"
    if reflog_message.starts_with("pull") {
        if reflog_message.contains("Fast-forward") {
            return "Pulled (fast-forward)".to_string();
        }
        return "Pulled".to_string();
    }

    // For rebase operations
    if reflog_message.starts_with("rebase") {
        if reflog_message.contains("(start)") {
            return "Rebase started".to_string();
        } else if reflog_message.contains("(finish)") {
            return "Rebase finished".to_string();
        }
        return "Rebase".to_string();
    }

    // Fallback: use the reflog message as-is
    reflog_message.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_activity_type_from_reflog() {
        assert_eq!(
            GitActivityType::from_reflog_message("commit: added feature"),
            Some(GitActivityType::Commit)
        );
        assert_eq!(
            GitActivityType::from_reflog_message("checkout: moving from main to feature"),
            Some(GitActivityType::Checkout)
        );
        assert_eq!(
            GitActivityType::from_reflog_message("merge feature: Merge branch"),
            Some(GitActivityType::Merge)
        );
    }

    #[test]
    fn test_extract_ref_name() {
        let ref_name = extract_ref_name(
            "checkout: moving from main to feature-branch",
            &GitActivityType::Checkout,
        );
        assert_eq!(ref_name, Some("feature-branch".to_string()));
    }

    #[test]
    fn test_parse_repository_path_github_https() {
        assert_eq!(
            parse_repository_path("https://github.com/facebook/react.git"),
            Some("facebook/react".to_string())
        );
        assert_eq!(
            parse_repository_path("https://github.com/facebook/react"),
            Some("facebook/react".to_string())
        );
    }

    #[test]
    fn test_parse_repository_path_github_ssh() {
        assert_eq!(
            parse_repository_path("git@github.com:facebook/react.git"),
            Some("facebook/react".to_string())
        );
        assert_eq!(
            parse_repository_path("git@github.com:facebook/react"),
            Some("facebook/react".to_string())
        );
    }

    #[test]
    fn test_parse_repository_path_gitlab() {
        assert_eq!(
            parse_repository_path("https://gitlab.com/gitlab-org/gitlab-foss.git"),
            Some("gitlab-org/gitlab-foss".to_string())
        );
        assert_eq!(
            parse_repository_path("git@gitlab.com:gitlab-org/gitlab.git"),
            Some("gitlab-org/gitlab".to_string())
        );
    }

    #[test]
    fn test_parse_repository_path_gitlab_subgroups() {
        assert_eq!(
            parse_repository_path("https://gitlab.com/group/subgroup/project.git"),
            Some("group/subgroup/project".to_string())
        );
    }

    #[test]
    fn test_parse_repository_path_bitbucket() {
        assert_eq!(
            parse_repository_path("https://bitbucket.org/atlassian/jira.git"),
            Some("atlassian/jira".to_string())
        );
        assert_eq!(
            parse_repository_path("git@bitbucket.org:atlassian/jira.git"),
            Some("atlassian/jira".to_string())
        );
    }

    #[test]
    fn test_parse_repository_path_invalid() {
        assert_eq!(parse_repository_path("not-a-url"), None);
        assert_eq!(parse_repository_path(""), None);
    }
}

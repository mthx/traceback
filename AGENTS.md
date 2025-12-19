# CLAUDE.md

Traceback is a macOS desktop app for syncing calendar events, git activity, and browser history into a local SQLite database with project tagging.

It's still at an early stage, so we're still open to changing APIs without regard to backwards compatibility. The database schema is also up for reconsideration. Focus on the best and clearest approach rather than living within the existing design.

## Tech Stack

- **Backend**: Rust + Tauri 2.0
- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS v4.
  - Generate new shadcn components as needed. This requires disabling the Claude sandbox.
  - Consider carefully whether to modify shadcn components. If the goal can be
    acheived in the consuming code in a reasonable way then start with that.
- **Database**: SQLite
- **Platform**: macOS only (EventKit framework)

## Development

```bash
npm run tauri dev          # Dev server (Rust + Vite on port 1420).
npm run tauri build        # Production build
npm run format             # Format all code
```

If the dev server is already running or you get a port conflict then it's likely because the user is alread running it.
Try tailing logs/dev-server.log to view the output.

## Database

**Database location**: `~/Library/Application Support/net.hillsdon.matt.traceback/traceback.db`

You can use sqlite3 or write scripts to inspect the database to confirm assumptions about its structure and content.

## macOS Calendar Permissions

- Permission requests must happen on main thread (user action like "Sync Now" button)
- Uses `objc2-event-kit` with required features: `EKEventStore`, `EKEvent`, `EKCalendarItem`, `EKTypes`, `block2`

## Architecture

### Backend (`src-tauri/src/`)

- `lib.rs` - Tauri commands, app state (Arc<Mutex<Database>>)
- `calendar.rs` - macOS EventKit integration
- `db.rs` - SQLite operations
- `sync.rs` - Sync business logic
- `git.rs` - Git repository discovery
- `browser.rs` - Browser history parsing

### Frontend (`src/`)

- `app/app.tsx` - Main router + sidebar layout
- `app/calendar.tsx` - Calendar view
- `app/events.tsx` - Events list
- `app/projects.tsx` - Project detail + rules
- `app/settings.tsx` - Configuration
- `hooks/useAutoSync.ts` - Auto-sync polling

### Database Schema

- `events` - All event types (calendar, git, browser)
- `projects` - Project definitions
- `event_projects` - One-to-many: events → project
- `project_rules` - Auto-tagging rules
- `settings` - Key-value config

## Sync Architecture

Starting point is `sync_all_sources`.

Each source has dedicated sync function: `sync_calendar_source`, `sync_git_source`, `sync_browser_source`.

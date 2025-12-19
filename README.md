# Traceback

A macOS desktop app for understanding how I spend my working time by scraping browser history, git reflog, and calendar events.

**This is not intended to be useful to anyone other than me.**

There's a lot of AI generated code here and I'm taking full advantage to write something weirdly specific to my workflow.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run tauri dev

# Build for production
npm run tauri build
```

## Development

### Tech Stack

- **Backend**: Rust with Tauri 2.0
- **Frontend**: React + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS v4
- **Database**: SQLite
- **Platform**: macOS only (uses EventKit framework for calendar)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

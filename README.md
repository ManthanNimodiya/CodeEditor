# CodeEditor

A lightweight, fast desktop code editor built with [Tauri](https://tauri.app), React, and Monaco — designed to feel like a native app while running on web tech.

![App icon](src-tauri/icons/128x128.png)

---

## Features

- **Monaco Editor** — the same editor engine that powers VS Code, with the Default Dark+ theme and full syntax highlighting
- **Integrated terminal** — real PTY-backed shell (zsh/bash), multiple tabs, Cmd+Click to open URLs
- **Multi-project tabs** — open several folders at once, switch between them instantly
- **File tree** — browse, create, rename, and delete files and folders; live refresh
- **Docx support** — open and edit `.docx` Word documents directly
- **Welcome pane** — quick-access run commands for common project types (npm, Python, Go, Rust, Docker, etc.)
- **Persistent state** — open projects and active files are remembered across restarts

---

## Stack

| Layer | Technology |
|-------|-----------|
| Shell / packaging | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| Editor | [Monaco Editor](https://microsoft.github.io/monaco-editor/) |
| Terminal | [xterm.js v6](https://xtermjs.org) + FitAddon + WebLinksAddon |
| PTY backend | [`portable_pty`](https://docs.rs/portable-pty) Rust crate |

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 18+
- macOS (primary target; Linux/Windows may work with minor tweaks)

### Development

```bash
npm install
npm run tauri dev
```

The dev server starts on `localhost:1420` and Tauri opens a native window automatically.

### Production build

```bash
npm run tauri build
```

The `.app` bundle lands in `src-tauri/target/release/bundle/macos/`.

To install it:

```bash
cp -R src-tauri/target/release/bundle/macos/code-editor.app /Applications/
```

---

## Project Structure

```
code-editor/
├── src/                    # React frontend
│   ├── App.css             # Global theme (Cursor-style dark palette)
│   ├── components/
│   │   ├── Workspace.tsx   # Root layout — toolbar, project tabs, panels
│   │   ├── EditorPane.tsx  # Monaco editor wrapper
│   │   ├── TerminalPane.tsx# xterm.js terminal
│   │   ├── WelcomePane.tsx # Landing screen with run commands
│   │   └── DocxEditor.tsx  # Word document editor
│   └── lib/
│       └── pty.ts          # Tauri IPC wrappers for PTY commands
└── src-tauri/
    ├── src/
    │   ├── main.rs         # Tauri app entry point
    │   └── pty.rs          # PTY spawn / write / resize / kill commands
    └── icons/              # App icons (all sizes + .icns + .ico)
```

---

## Theme

The editor uses a custom Cursor-inspired dark palette:

| Token | Value | Use |
|-------|-------|-----|
| `--bg-0` | `#141414` | Sidebar, terminal background |
| `--bg-3` | `#1e1e1e` | Editor body |
| `--accent` | `#007acc` | VS Code blue — active tabs, focus borders |
| `--accent-2` | `#4ec9b0` | Teal — file tree directories |

Monaco syntax colors follow the VS Code Default Dark+ spec (no purple tint).

---

## License

MIT

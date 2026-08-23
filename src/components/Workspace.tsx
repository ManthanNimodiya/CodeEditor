import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, watch, type WatchEvent } from "@tauri-apps/plugin-fs";
import FileTree from "./FileTree";
import EditorPane from "./EditorPane";
import TerminalPane from "./TerminalPane";
import GeminiPanel from "./GeminiPanel";
import WelcomePane from "./WelcomePane";

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

interface TerminalTab {
  id: string;
  name: string;
}

interface Project {
  id: string;
  root: string;
  name: string;
  files: OpenFile[];
  activeFile: string | null;
  terminals: TerminalTab[];
  activeTerminal: string | null;
}

interface SavedProject {
  root: string;
  openFilePaths: string[];
  activeFilePath: string | null;
  terminalNames: string[];
  activeTerminalIndex: number;
}

interface SavedState {
  projects: SavedProject[];
  activeProjectRoot: string | null;
  showTerminals: boolean;
  showGemini: boolean;
  sidebarWidth: number;
  terminalHeight: number;
}

const PERSIST_KEY = "code-editor-state";

function basename(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/").pop() ?? trimmed;
}

const NOISE_PATH_SEGMENTS = ["/.git/", "/node_modules/", "/target/", "/dist/", "/build/", "/.next/"];

function isNoisePath(path: string): boolean {
  return NOISE_PATH_SEGMENTS.some((segment) => path.includes(segment));
}

function isDocx(path: string): boolean {
  return path.toLowerCase().endsWith(".docx");
}

function createProject(root: string): Project {
  const terminalId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    root,
    name: basename(root),
    files: [],
    activeFile: null,
    terminals: [{ id: terminalId, name: "Terminal 1" }],
    activeTerminal: terminalId,
  };
}

function useDrag(onMove: (deltaX: number, deltaY: number) => void) {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current.x;
      const dy = e.clientY - last.current.y;
      last.current = { x: e.clientX, y: e.clientY };
      onMove(dx, dy);
    },
    [onMove],
  );

  const stop = useCallback(() => {
    dragging.current = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stop);
  }, [onMouseMove]);

  const start = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      last.current = { x: e.clientX, y: e.clientY };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", stop);
    },
    [onMouseMove, stop],
  );

  return start;
}

export default function Workspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showTerminals, setShowTerminals] = useState(true);
  const [showGemini, setShowGemini] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [geminiWidth, setGeminiWidth] = useState(340);
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [initialized, setInitialized] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Sidebar is on the RIGHT — drag handle is to its left; pull left (negative dx) = wider
  const sidebarDrag = useDrag((dx) => setSidebarWidth((w) => Math.min(Math.max(w - dx, 140), 480)));
  const terminalDrag = useDrag((_dx, dy) =>
    setTerminalHeight((h) => Math.min(Math.max(h - dy, 100), 600)),
  );
  // Gemini panel is on the LEFT — drag handle is to its right; pull right (positive dx) = wider
  const geminiDrag = useDrag((dx) =>
    setGeminiWidth((w) => Math.min(Math.max(w + dx, 240), 600)),
  );

  function updateProject(id: string, updater: (p: Project) => Project) {
    setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  // Restore on mount
  useEffect(() => {
    async function init() {
      let restoredProjects: Project[] = [];
      let savedActiveRoot: string | null = null;

      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        try {
          const saved: SavedState = JSON.parse(raw);
          setShowTerminals(saved.showTerminals ?? true);
          setShowGemini(saved.showGemini ?? false);
          setSidebarWidth(saved.sidebarWidth ?? 240);
          setTerminalHeight(saved.terminalHeight ?? 220);
          savedActiveRoot = saved.activeProjectRoot;

          for (const sp of saved.projects) {
            const files: OpenFile[] = [];
            for (const filePath of sp.openFilePaths) {
              if (isDocx(filePath)) {
                files.push({ path: filePath, name: basename(filePath), content: "", dirty: false });
              } else {
                try {
                  const content = await readTextFile(filePath);
                  files.push({ path: filePath, name: basename(filePath), content, dirty: false });
                } catch {
                  // File no longer exists
                }
              }
            }
            const terminals = sp.terminalNames.map((name) => ({ id: crypto.randomUUID(), name }));
            const activeTerminal =
              terminals[sp.activeTerminalIndex]?.id ?? terminals[0]?.id ?? null;
            restoredProjects.push({
              id: crypto.randomUUID(),
              root: sp.root,
              name: basename(sp.root),
              files,
              activeFile: files.find((f) => f.path === sp.activeFilePath)?.path ?? files[0]?.path ?? null,
              terminals,
              activeTerminal,
            });
          }
        } catch {
          restoredProjects = [];
        }
      }

      // Handle CLI launch path and open-path events
      const [launchPath, pendingPath] = await Promise.all([
        invoke<string | null>("get_launch_path"),
        invoke<string | null>("take_pending_open_path"),
      ]);

      for (const path of [launchPath, pendingPath]) {
        if (path && !restoredProjects.some((p) => p.root === path)) {
          restoredProjects.push(createProject(path));
          savedActiveRoot = path;
        }
      }

      if (restoredProjects.length > 0) {
        setProjects(restoredProjects);
        const active =
          restoredProjects.find((p) => p.root === savedActiveRoot) ??
          restoredProjects[restoredProjects.length - 1];
        setActiveProjectId(active.id);
      }

      setInitialized(true);
    }

    init();

    const unlisten = listen<string>("open-path", (event) => openFolderAsProject(event.payload));
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save whenever state changes (after initialization)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!initialized) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const state: SavedState = {
        projects: projects.map((p) => ({
          root: p.root,
          openFilePaths: p.files.map((f) => f.path),
          activeFilePath: p.activeFile,
          terminalNames: p.terminals.map((t) => t.name),
          activeTerminalIndex: Math.max(
            0,
            p.terminals.findIndex((t) => t.id === p.activeTerminal),
          ),
        })),
        activeProjectRoot: projects.find((p) => p.id === activeProjectId)?.root ?? null,
        showTerminals,
        showGemini,
        sidebarWidth,
        terminalHeight,
      };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
    }, 600);
  }, [projects, activeProjectId, showTerminals, showGemini, sidebarWidth, terminalHeight, initialized]);

  // ── Project management ───────────────────────────────────────────────────────

  function openFolderAsProject(dir: string) {
    setProjects((prev) => {
      const existing = prev.find((p) => p.root === dir);
      if (existing) {
        setActiveProjectId(existing.id);
        return prev;
      }
      const project = createProject(dir);
      setActiveProjectId(project.id);
      return [...prev, project];
    });
  }

  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  async function handleWatchEvent(projectId: string, event: WatchEvent) {
    for (const path of event.paths) {
      if (isNoisePath(path)) continue;
      if (isDocx(path)) continue;
      const project = projectsRef.current.find((p) => p.id === projectId);
      if (!project) return;
      const openFile = project.files.find((f) => f.path === path);
      let content: string;
      try {
        content = await readTextFile(path);
      } catch {
        continue;
      }
      if (openFile) {
        if (openFile.content === content) continue;
        if (openFile.dirty) {
          const shouldReload = await confirmDialog(
            `"${openFile.name}" changed on disk. Reload and discard your local changes?`,
            { title: "File changed externally", kind: "warning" },
          );
          if (!shouldReload) continue;
        }
        updateProject(projectId, (p) => ({
          ...p,
          files: p.files.map((f) => (f.path === path ? { ...f, content, dirty: false } : f)),
        }));
      } else {
        updateProject(projectId, (p) => {
          if (p.files.some((f) => f.path === path)) return p;
          return {
            ...p,
            files: [...p.files, { path, name: basename(path), content, dirty: false }],
            activeFile: path,
          };
        });
      }
    }
  }

  const projectWatchKey = projects.map((p) => `${p.id}:${p.root}`).join(",");
  useEffect(() => {
    const unwatchPromises = projects.map((p) =>
      watch(p.root, (event) => handleWatchEvent(p.id, event), { recursive: true, delayMs: 300 }),
    );
    return () => {
      unwatchPromises.forEach((u) => u.then((f) => f()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectWatchKey]);

  async function openFolder() {
    const dir = await openDialog({ directory: true, multiple: false });
    if (typeof dir === "string") openFolderAsProject(dir);
  }

  async function closeProject(id: string) {
    const project = projects.find((p) => p.id === id);
    if (project?.files.some((f) => f.dirty)) {
      const shouldClose = await confirmDialog(
        `"${project.name}" has unsaved changes. Close anyway?`,
        { title: "Unsaved changes", kind: "warning" },
      );
      if (!shouldClose) return;
    }
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setActiveProjectId((current) => (current === id ? next[next.length - 1]?.id ?? null : current));
      return next;
    });
  }

  async function openFileFromPath(path: string) {
    if (!activeProject) return;
    const projectId = activeProject.id;
    if (activeProject.files.some((f) => f.path === path)) {
      updateProject(projectId, (p) => ({ ...p, activeFile: path }));
      return;
    }
    // .docx files are read by DocxEditor itself — don't try readTextFile on binary
    const content = isDocx(path) ? "" : await readTextFile(path);
    updateProject(projectId, (p) => ({
      ...p,
      files: [...p.files, { path, name: basename(path), content, dirty: false }],
      activeFile: path,
    }));
  }

  function updateContent(projectId: string, path: string, value: string) {
    updateProject(projectId, (p) => ({
      ...p,
      files: p.files.map((f) => (f.path === path ? { ...f, content: value, dirty: true } : f)),
    }));
  }

  function setActiveFile(projectId: string, path: string) {
    updateProject(projectId, (p) => ({ ...p, activeFile: path }));
  }

  async function closeFile(projectId: string, path: string) {
    const project = projects.find((p) => p.id === projectId);
    const file = project?.files.find((f) => f.path === path);
    if (file?.dirty) {
      const shouldClose = await confirmDialog(`"${file.name}" has unsaved changes. Close anyway?`, {
        title: "Unsaved changes",
        kind: "warning",
      });
      if (!shouldClose) return;
    }
    updateProject(projectId, (p) => {
      const files = p.files.filter((f) => f.path !== path);
      const activeFile =
        p.activeFile === path ? files[files.length - 1]?.path ?? null : p.activeFile;
      return { ...p, files, activeFile };
    });
  }

  async function saveActiveFile() {
    if (!activeProject) return;
    const file = activeProject.files.find((f) => f.path === activeProject.activeFile);
    if (!file || isDocx(file.path)) return; // docx saves handled by DocxEditor
    await writeTextFile(file.path, file.content);
    updateProject(activeProject.id, (p) => ({
      ...p,
      files: p.files.map((f) => (f.path === file.path ? { ...f, dirty: false } : f)),
    }));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  useEffect(() => {
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  // ── Terminal management ──────────────────────────────────────────────────────

  function addTerminal(projectId: string) {
    const id = crypto.randomUUID();
    updateProject(projectId, (p) => ({
      ...p,
      terminals: [...p.terminals, { id, name: `Terminal ${p.terminals.length + 1}` }],
      activeTerminal: id,
    }));
    setShowTerminals(true);
  }

  function setActiveTerminal(projectId: string, id: string) {
    updateProject(projectId, (p) => ({ ...p, activeTerminal: id }));
  }

  function renameTerminal(projectId: string, id: string, name: string) {
    updateProject(projectId, (p) => ({
      ...p,
      terminals: p.terminals.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
  }

  function closeTerminal(projectId: string, id: string) {
    updateProject(projectId, (p) => {
      const terminals = p.terminals.filter((t) => t.id !== id);
      const activeTerminal =
        p.activeTerminal === id ? terminals[terminals.length - 1]?.id ?? null : p.activeTerminal;
      return { ...p, terminals, activeTerminal };
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="workspace">
      <div className="toolbar">
        <button onClick={() => setShowTerminals((v) => !v)}>
          {showTerminals ? "Hide Terminal" : "Show Terminal"}
        </button>
        <button
          onClick={() => setShowGemini((v) => !v)}
          className={showGemini ? "toolbar-btn-active" : ""}
        >
          {showGemini ? "Hide Gemini" : "Gemini ✦"}
        </button>
        <span className="toolbar-path">{activeProject?.root ?? "No project opened"}</span>
      </div>

      <div className="project-tab-bar">
        {projects.map((p) => (
          <div
            key={p.id}
            className={`project-tab ${p.id === activeProjectId ? "active" : ""}`}
            onClick={() => setActiveProjectId(p.id)}
          >
            {p.name}
            <span
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeProject(p.id);
              }}
            >
              ×
            </span>
          </div>
        ))}
        <div className="project-tab project-tab-add" onClick={openFolder}>
          + Project
        </div>
      </div>

      <div className="workspace-body">
        {showGemini && (
          <>
            <div className="gemini-pane-wrapper" style={{ width: geminiWidth }}>
              <GeminiPanel />
            </div>
            <div className="divider-vertical" onMouseDown={geminiDrag} />
          </>
        )}

        <div className="main-area">
          {activeProject ? (
            <>
              <div className="tab-bar">
                {activeProject.files.map((f) => (
                  <div
                    key={f.path}
                    className={`tab ${f.path === activeProject.activeFile ? "active" : ""}`}
                    onClick={() => setActiveFile(activeProject.id, f.path)}
                  >
                    {f.name}
                    {f.dirty ? " ●" : ""}
                    <span
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeFile(activeProject.id, f.path);
                      }}
                    >
                      ×
                    </span>
                  </div>
                ))}
              </div>
              <div className="editor-area">
                {activeProject.files.length === 0 && <WelcomePane />}
                {activeProject.files.map((f) => (
                  <EditorPane
                    key={f.path}
                    path={f.path}
                    content={f.content}
                    visible={f.path === activeProject.activeFile}
                    onChange={(path, value) => updateContent(activeProject.id, path, value)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="editor-area">
              <WelcomePane />
            </div>
          )}

          <div
            className="divider-horizontal"
            style={{ display: showTerminals ? "block" : "none" }}
            onMouseDown={terminalDrag}
          />
          <div
            className="terminal-panel"
            style={{ height: terminalHeight, display: showTerminals ? "flex" : "none" }}
          >
            <div className="tab-bar">
              {activeProject?.terminals.map((t) => (
                <div
                  key={t.id}
                  className={`tab ${t.id === activeProject.activeTerminal ? "active" : ""}`}
                  onClick={() => setActiveTerminal(activeProject.id, t.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingTerminalId(t.id);
                    setRenameDraft(t.name);
                  }}
                >
                  {renamingTerminalId === t.id ? (
                    <input
                      className="tab-rename-input"
                      autoFocus
                      value={renameDraft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => {
                        renameTerminal(activeProject.id, t.id, renameDraft.trim() || t.name);
                        setRenamingTerminalId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          renameTerminal(activeProject.id, t.id, renameDraft.trim() || t.name);
                          setRenamingTerminalId(null);
                        } else if (e.key === "Escape") {
                          setRenamingTerminalId(null);
                        }
                      }}
                    />
                  ) : (
                    t.name
                  )}
                  <span
                    className="tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTerminal(activeProject.id, t.id);
                    }}
                  >
                    ×
                  </span>
                </div>
              ))}
              {activeProject && (
                <div className="tab tab-add" onClick={() => addTerminal(activeProject.id)}>
                  +
                </div>
              )}
            </div>
            <div className="terminal-host">
              {projects.flatMap((p) =>
                p.terminals.map((t) => (
                  <TerminalPane
                    key={t.id}
                    id={t.id}
                    cwd={p.root}
                    visible={p.id === activeProjectId && t.id === p.activeTerminal}
                  />
                )),
              )}
            </div>
          </div>
        </div>

        {activeProject && (
          <>
            <div className="divider-vertical" onMouseDown={sidebarDrag} />
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <FileTree
                root={activeProject.root}
                onOpenFile={openFileFromPath}
                onOpenAsProject={openFolderAsProject}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, watch, type WatchEvent } from "@tauri-apps/plugin-fs";
import ActivityBar from "./ActivityBar";
import FileTree from "./FileTree";
import EditorPane from "./EditorPane";
import TerminalGrid, { type TerminalTabItem } from "./TerminalGrid";
import StatusBar from "./StatusBar";

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
  showExplorer: boolean;
  sidebarWidth: number;
  activityBarWidth: number;
  terminalHeight: number;
}

const PERSIST_KEY = "codeditor-state";

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

function createProject(root: string, defaultName?: string): Project {
  const terminalId = crypto.randomUUID();
  const name = defaultName || basename(root);
  return {
    id: crypto.randomUUID(),
    root,
    name,
    files: [],
    activeFile: null,
    terminals: [{ id: terminalId, name: `${name} (Terminal)` }],
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
    [onMove]
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
    [onMouseMove, stop]
  );

  return start;
}

export default function Workspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showTerminals, setShowTerminals] = useState(true);
  const [showExplorer, setShowExplorer] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [activityBarWidth, setActivityBarWidth] = useState(52);
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [initialized, setInitialized] = useState(false);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Sidebar drag with snap-to-close when dragged to the end (< 60px)
  const sidebarDrag = useDrag((dx) => {
    setSidebarWidth((w) => {
      const next = w + dx;
      if (next < 60) {
        setShowExplorer(false);
        return 220;
      }
      return Math.min(Math.max(next, 120), 550);
    });
  });

  // Activity bar drag to resize
  const activityBarDrag = useDrag((dx) => {
    setActivityBarWidth((w) => {
      const next = w + dx;
      if (next < 65) return 52;
      return Math.min(Math.max(next, 52), 320);
    });
  });

  // Full-height capable terminal drag
  const terminalDrag = useDrag((_dx, dy) =>
    setTerminalHeight((h) =>
      Math.min(Math.max(h - dy, 60), Math.max(window.innerHeight - 50, 100))
    )
  );

  function updateProject(id: string, updater: (p: Project) => Project) {
    setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  }

  // ── Persistence & Initialization ──────────────────────────────────────────

  useEffect(() => {
    async function init() {
      let restoredProjects: Project[] = [];
      let savedActiveRoot: string | null = null;

      const raw = localStorage.getItem(PERSIST_KEY) || localStorage.getItem("code-editor-state");
      if (raw) {
        try {
          const saved: SavedState = JSON.parse(raw);
          setShowTerminals(saved.showTerminals ?? true);
          setShowExplorer(saved.showExplorer ?? true);
          setSidebarWidth(saved.sidebarWidth ?? 250);
          setActivityBarWidth(saved.activityBarWidth ?? 52);
          setTerminalHeight(saved.terminalHeight ?? 280);
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
                  // File removed from disk
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
              activeFile:
                files.find((f) => f.path === sp.activeFilePath)?.path ?? files[0]?.path ?? null,
              terminals,
              activeTerminal,
            });
          }
        } catch {
          restoredProjects = [];
        }
      }

      // Handle CLI launch path and pending open-path events
      const [launchPath, pendingPath] = await Promise.all([
        invoke<string | null>("get_launch_path").catch(() => null),
        invoke<string | null>("take_pending_open_path").catch(() => null),
      ]);

      for (const path of [launchPath, pendingPath]) {
        if (path && !restoredProjects.some((p) => p.root === path)) {
          restoredProjects.push(createProject(path));
          savedActiveRoot = path;
        }
      }

      if (restoredProjects.length === 0) {
        const defaultRoot = "/Users/manthannimodiya/Coding/Projects/code-editor";
        restoredProjects = [createProject(defaultRoot, "Workspace")];
      }

      setProjects(restoredProjects);
      const active =
        restoredProjects.find((p) => p.root === savedActiveRoot) ?? restoredProjects[0];
      setActiveProjectId(active?.id ?? null);
      setInitialized(true);
    }

    init();

    const unlisten = listen<string>("open-path", (event) => openFolderAsProject(event.payload));
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-save
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
            p.terminals.findIndex((t) => t.id === p.activeTerminal)
          ),
        })),
        activeProjectRoot: projects.find((p) => p.id === activeProjectId)?.root ?? null,
        showTerminals,
        showExplorer,
        sidebarWidth,
        activityBarWidth,
        terminalHeight,
      };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
    }, 600);
  }, [
    projects,
    activeProjectId,
    showTerminals,
    showExplorer,
    sidebarWidth,
    activityBarWidth,
    terminalHeight,
    initialized,
  ]);

  // ── Project & File Management ─────────────────────────────────────────────

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
            { title: "File changed externally", kind: "warning" }
          );
          if (!shouldReload) continue;
        }
        updateProject(projectId, (p) => ({
          ...p,
          files: p.files.map((f) => (f.path === path ? { ...f, content, dirty: false } : f)),
        }));
      }
    }
  }

  const projectWatchKey = projects.map((p) => `${p.id}:${p.root}`).join(",");
  useEffect(() => {
    const unwatchPromises = projects.map((p) =>
      watch(p.root, (event) => handleWatchEvent(p.id, event), { recursive: true, delayMs: 300 })
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
        { title: "Unsaved changes", kind: "warning" }
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
    if (!file || isDocx(file.path)) return;
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

  // ── Terminal Management & Reordering ─────────────────────────────────────

  function addTerminal(projectId: string) {
    const id = crypto.randomUUID();
    const proj = projects.find((p) => p.id === projectId);
    const num = (proj?.terminals.length ?? 0) + 1;
    const termName = `${proj?.name ?? "Terminal"} (Session ${num})`;

    updateProject(projectId, (p) => ({
      ...p,
      terminals: [...p.terminals, { id, name: termName }],
      activeTerminal: id,
    }));
    setShowTerminals(true);
  }

  function setActiveTerminal(id: string) {
    const proj = projects.find((p) => p.terminals.some((t) => t.id === id));
    if (proj) {
      updateProject(proj.id, (p) => ({ ...p, activeTerminal: id }));
    }
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

  function handleReorderTerminals(reordered: TerminalTabItem[]) {
    setProjects((prev) => {
      return prev.map((p) => {
        const projectTerminals = reordered
          .filter((item) => item.projectId === p.id)
          .map((item) => ({ id: item.id, name: item.name }));
        return {
          ...p,
          terminals: projectTerminals.length > 0 ? projectTerminals : p.terminals,
        };
      });
    });
  }

  const allTerminals: TerminalTabItem[] = projects.flatMap((p) =>
    p.terminals.map((t) => ({
      id: t.id,
      name: t.name,
      projectId: p.id,
      projectName: p.name,
      projectRoot: p.root,
    }))
  );

  const activeTerminalId =
    activeProject?.activeTerminal ?? allTerminals[0]?.id ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="workspace">
      <div className="workspace-body">
        {/* Far-Left Activity Bar Rail */}
        <ActivityBar
          projects={projects.map((p) => ({ id: p.id, name: p.name, root: p.root }))}
          activeProjectId={activeProjectId}
          onSelectProject={(id) => setActiveProjectId(id)}
          onAddProject={openFolder}
          showExplorer={showExplorer}
          onToggleExplorer={() => setShowExplorer((v) => !v)}
          width={activityBarWidth}
          onResizeWidth={setActivityBarWidth}
        />

        {activityBarWidth > 52 && (
          <div className="divider-vertical" onMouseDown={activityBarDrag} />
        )}

        {/* Left File Explorer Sidebar */}
        {showExplorer && activeProject && (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <FileTree
                root={activeProject.root}
                activeFilePath={activeProject.activeFile}
                onOpenFile={openFileFromPath}
                onOpenAsProject={openFolderAsProject}
              />
            </div>
            <div className="divider-vertical" onMouseDown={sidebarDrag} />
          </>
        )}

        {/* Closed Sidebar Re-open handle */}
        {!showExplorer && activeProject && (
          <div
            className="sidebar-closed-indicator"
            title="Open Explorer"
            onClick={() => setShowExplorer(true)}
          >
            <span>&gt;</span>
          </div>
        )}

        {/* Center Main Stage */}
        <div className="main-area">
          {/* Top Tabs & Breadcrumbs Bar */}
          <div className="top-nav-bar">
            {/* Project Quick Tabs */}
            <div className="project-breadcrumbs">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`project-tab-pill ${p.id === activeProjectId ? "active" : ""}`}
                  onClick={() => setActiveProjectId(p.id)}
                >
                  <span className="pill-prompt">&gt;_</span>
                  <span className="pill-name">{p.name}</span>
                  {projects.length > 1 && (
                    <span
                      className="pill-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeProject(p.id);
                      }}
                    >
                      &times;
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Active Open File Tabs */}
            {activeProject && activeProject.files.length > 0 && (
              <div className="file-tabs-strip">
                {activeProject.files.map((f) => (
                  <div
                    key={f.path}
                    className={`tab ${f.path === activeProject.activeFile ? "active" : ""}`}
                    onClick={() => setActiveFile(activeProject.id, f.path)}
                  >
                    <span className="tab-name">{f.name}</span>
                    {f.dirty && <span className="tab-dirty-dot">&#9679;</span>}
                    <span
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeFile(activeProject.id, f.path);
                      }}
                    >
                      &times;
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="top-nav-actions">
              <button
                className="top-nav-btn"
                title={showTerminals ? "Hide Terminal Panel" : "Show Terminal Panel"}
                onClick={() => setShowTerminals((v) => !v)}
              >
                {showTerminals ? "Hide Terminal" : "Show Terminal"}
              </button>
            </div>
          </div>

          {/* Editor Stage */}
          <div className="stage-content">
            {!activeProject || activeProject.files.length === 0 ? (
              <div className="empty-editor-state">
                <div className="empty-editor-content">
                  <span className="empty-editor-title">CodEditor</span>
                  <span className="empty-editor-hint">
                    Select a file from the explorer or create a new one to begin editing
                  </span>
                </div>
              </div>
            ) : (
              <div className="editor-area">
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
            )}
          </div>

          {/* Bottom Multi-Terminal Grid Panel (Can resize all the way to the top) */}
          {showTerminals && (
            <>
              <div className="divider-horizontal" onMouseDown={terminalDrag} />
              <div className="bottom-terminals-wrapper" style={{ height: terminalHeight }}>
                <TerminalGrid
                  terminals={allTerminals}
                  activeTerminalId={activeTerminalId}
                  onSelectTerminal={setActiveTerminal}
                  onAddTerminal={addTerminal}
                  onCloseTerminal={closeTerminal}
                  onRenameTerminal={renameTerminal}
                  onReorderTerminals={handleReorderTerminals}
                  activeProjectId={activeProjectId}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        activeFilePath={activeProject?.activeFile ?? null}
        fileCount={activeProject?.files.length ?? 0}
      />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog, confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import FileTree from "./FileTree";
import EditorPane from "./EditorPane";
import TerminalPane from "./TerminalPane";

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

function basename(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/").pop() ?? trimmed;
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
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  const sidebarDrag = useDrag((dx) => setSidebarWidth((w) => Math.min(Math.max(w + dx, 140), 480)));
  const terminalDrag = useDrag((_dx, dy) => setTerminalHeight((h) => Math.min(Math.max(h - dy, 100), 600)));

  function updateProject(id: string, updater: (p: Project) => Project) {
    setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  }

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

  useEffect(() => {
    invoke<string | null>("get_launch_path").then((path) => {
      if (path) openFolderAsProject(path);
    });
    invoke<string | null>("take_pending_open_path").then((path) => {
      if (path) openFolderAsProject(path);
    });
    const unlisten = listen<string>("open-path", (event) => openFolderAsProject(event.payload));
    return () => {
      unlisten.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openFolder() {
    const dir = await openDialog({ directory: true, multiple: false });
    if (typeof dir === "string") openFolderAsProject(dir);
  }

  async function closeProject(id: string) {
    const project = projects.find((p) => p.id === id);
    if (project?.files.some((f) => f.dirty)) {
      const shouldClose = await confirmDialog(`"${project.name}" has unsaved changes. Close anyway?`, {
        title: "Unsaved changes",
        kind: "warning",
      });
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
    const content = await readTextFile(path);
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
      const activeFile = p.activeFile === path ? files[files.length - 1]?.path ?? null : p.activeFile;
      return { ...p, files, activeFile };
    });
  }

  async function saveActiveFile() {
    if (!activeProject) return;
    const file = activeProject.files.find((f) => f.path === activeProject.activeFile);
    if (!file) return;
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

  return (
    <div className="workspace">
      <div className="toolbar">
        <button onClick={() => setShowTerminals((v) => !v)}>
          {showTerminals ? "Hide Terminal" : "Show Terminal"}
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
            <span className="project-tab-icon">📁</span> {p.name}
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
        {activeProject && (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <FileTree
                root={activeProject.root}
                onOpenFile={openFileFromPath}
                onOpenAsProject={openFolderAsProject}
              />
            </div>
            <div className="divider-vertical" onMouseDown={sidebarDrag} />
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
                {activeProject.files.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-watermark">राधावल्लभ श्री हरिवंश</div>
                    <div className="empty-state-hint">Open a file to start editing</div>
                  </div>
                )}
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
            <div className="empty-state">
              <div className="empty-state-watermark">राधावल्लभ श्री हरिवंश</div>
              <div className="empty-state-hint">Open a project folder to get started</div>
            </div>
          )}

          <div className="divider-horizontal" style={{ display: showTerminals ? "block" : "none" }} onMouseDown={terminalDrag} />
          <div className="terminal-panel" style={{ height: terminalHeight, display: showTerminals ? "flex" : "none" }}>
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
      </div>
    </div>
  );
}

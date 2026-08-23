import { useEffect, useRef, useState } from "react";
import { mkdir, readDir, watch, writeFile } from "@tauri-apps/plugin-fs";

interface FileTreeProps {
  root: string;
  onOpenFile: (path: string) => void;
  onOpenAsProject: (path: string) => void;
}

interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface ContextMenu {
  x: number;
  y: number;
  path: string;
}

interface NewItem {
  parentDir: string;
  type: "file" | "folder";
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

async function listEntries(dir: string): Promise<Entry[]> {
  const raw = await readDir(dir);
  return raw
    .filter((e) => e.name)
    .map((e) => ({ name: e.name!, path: joinPath(dir, e.name!), isDirectory: !!e.isDirectory }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function DirNode({
  path,
  name,
  depth,
  version,
  onOpenFile,
  onContextMenu,
}: {
  path: string;
  name: string;
  depth: number;
  version: number;
  onOpenFile: (p: string) => void;
  onContextMenu: (path: string, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!expanded) return;
    listEntries(path)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [expanded, version, path]);

  async function toggle() {
    if (!expanded && entries === null) {
      try {
        setEntries(await listEntries(path));
      } catch {
        setEntries([]);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div>
      <div
        className="file-tree-row file-tree-dir"
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={toggle}
        onContextMenu={(e) => onContextMenu(path, e)}
      >
        <span className="file-tree-caret">{expanded ? "▾" : "▸"}</span>
        {name}
      </div>
      {expanded &&
        entries?.map((e) =>
          e.isDirectory ? (
            <DirNode
              key={e.path}
              path={e.path}
              name={e.name}
              depth={depth + 1}
              version={version}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
            />
          ) : (
            <div
              key={e.path}
              className="file-tree-row file-tree-file"
              style={{ paddingLeft: (depth + 1) * 14 + 8 }}
              onClick={() => onOpenFile(e.path)}
            >
              {e.name}
            </div>
          ),
        )}
    </div>
  );
}

export default function FileTree({ root, onOpenFile, onOpenAsProject }: FileTreeProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [version, setVersion] = useState(0);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listEntries(root)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [root, version]);

  useEffect(() => {
    const unwatch = watch(root, () => setVersion((v) => v + 1), {
      recursive: true,
      delayMs: 400,
    });
    return () => {
      unwatch.then((f) => f());
    };
  }, [root]);

  useEffect(() => {
    if (newItem) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [newItem]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [menu]);

  function startCreate(parentDir: string, type: "file" | "folder") {
    setMenu(null);
    setNewItem({ parentDir, type });
    setNewName("");
  }

  async function confirmCreate() {
    if (!newItem || !newName.trim()) {
      setNewItem(null);
      setNewName("");
      return;
    }
    const fullPath = joinPath(newItem.parentDir, newName.trim());
    try {
      if (newItem.type === "folder") {
        await mkdir(fullPath);
      } else {
        await writeFile(fullPath, new Uint8Array());
        onOpenFile(fullPath);
      }
    } catch {}
    setNewItem(null);
    setNewName("");
  }

  function requestMenu(path: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, path });
  }

  return (
    <div className="file-tree-wrapper">
      <div className="file-tree-header">
        <span className="file-tree-title">Explorer</span>
        <div className="file-tree-actions">
          <button
            className="file-tree-action-btn"
            title="New File"
            onClick={() => startCreate(root, "file")}
          >
            +File
          </button>
          <button
            className="file-tree-action-btn"
            title="New Folder"
            onClick={() => startCreate(root, "folder")}
          >
            +Folder
          </button>
        </div>
      </div>

      {newItem && (
        <div className="file-tree-new-item">
          <span>{newItem.type === "folder" ? "dir" : "file"}</span>
          <input
            ref={inputRef}
            className="file-tree-new-input"
            value={newName}
            placeholder={newItem.type === "folder" ? "folder-name" : "file.txt"}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCreate();
              if (e.key === "Escape") { setNewItem(null); setNewName(""); }
            }}
            onBlur={() => { setNewItem(null); setNewName(""); }}
          />
        </div>
      )}

      <div className="file-tree">
        {entries?.map((e) =>
          e.isDirectory ? (
            <DirNode
              key={e.path}
              path={e.path}
              name={e.name}
              depth={0}
              version={version}
              onOpenFile={onOpenFile}
              onContextMenu={requestMenu}
            />
          ) : (
            <div
              key={e.path}
              className="file-tree-row file-tree-file"
              style={{ paddingLeft: 8 }}
              onClick={() => onOpenFile(e.path)}
            >
              {e.name}
            </div>
          ),
        )}
      </div>

      {menu && (
        <div className="context-menu" style={{ top: menu.y, left: menu.x }}>
          <div className="context-menu-item" onClick={() => startCreate(menu.path, "file")}>
            New File Here
          </div>
          <div className="context-menu-item" onClick={() => startCreate(menu.path, "folder")}>
            New Folder Here
          </div>
          <div className="context-menu-sep" />
          <div
            className="context-menu-item"
            onClick={() => {
              onOpenAsProject(menu.path);
              setMenu(null);
            }}
          >
            Open as Project
          </div>
        </div>
      )}
    </div>
  );
}

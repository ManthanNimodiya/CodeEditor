import { useEffect, useState } from "react";
import { readDir } from "@tauri-apps/plugin-fs";

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

interface ContextMenuState {
  x: number;
  y: number;
  path: string;
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

async function listEntries(dir: string): Promise<Entry[]> {
  const raw = await readDir(dir);
  return raw
    .map((e) => ({ name: e.name, path: joinPath(dir, e.name), isDirectory: e.isDirectory }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function DirNode({
  path,
  name,
  depth,
  onOpenFile,
  onContextMenu,
}: {
  path: string;
  name: string;
  depth: number;
  onOpenFile: (p: string) => void;
  onContextMenu: (path: string, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);

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
        className="file-tree-row"
        style={{ paddingLeft: depth * 14 }}
        onClick={toggle}
        onContextMenu={(e) => onContextMenu(path, e)}
      >
        <span className="file-tree-caret">{expanded ? "▾" : "▸"}</span> {name}
      </div>
      {expanded && entries?.map((e) =>
        e.isDirectory ? (
          <DirNode
            key={e.path}
            path={e.path}
            name={e.name}
            depth={depth + 1}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        ) : (
          <div
            key={e.path}
            className="file-tree-row"
            style={{ paddingLeft: (depth + 1) * 14 }}
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
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    listEntries(root).then(setEntries).catch(() => setEntries([]));
  }, [root]);

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

  function requestMenu(path: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, path });
  }

  return (
    <div className="file-tree">
      {entries?.map((e) =>
        e.isDirectory ? (
          <DirNode
            key={e.path}
            path={e.path}
            name={e.name}
            depth={0}
            onOpenFile={onOpenFile}
            onContextMenu={requestMenu}
          />
        ) : (
          <div key={e.path} className="file-tree-row" onClick={() => onOpenFile(e.path)}>
            {e.name}
          </div>
        ),
      )}
      {menu && (
        <div className="context-menu" style={{ top: menu.y, left: menu.x }}>
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

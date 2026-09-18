export function FileIcon({ name, isDir, expanded }: { name: string; isDir: boolean; expanded?: boolean }) {
  if (isDir) {
    return (
      <svg className="tree-icon icon-folder" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {expanded ? (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="rgba(56, 189, 248, 0.15)" stroke="#38bdf8" />
        ) : (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="rgba(148, 163, 184, 0.1)" stroke="#94a3b8" />
        )}
      </svg>
    );
  }

  const lower = name.toLowerCase();
  const ext = lower.split(".").pop() ?? "";

  if (lower === "go.mod" || lower === "go.sum" || ext === "go") {
    return <span className="file-badge badge-go">GO</span>;
  }
  if (ext === "rs") {
    return <span className="file-badge badge-rust">RS</span>;
  }
  if (ext === "ts" || ext === "tsx") {
    return <span className="file-badge badge-ts">TS</span>;
  }
  if (ext === "js" || ext === "jsx" || ext === "mjs") {
    return <span className="file-badge badge-js">JS</span>;
  }
  if (ext === "json" || ext === "toml" || ext === "yaml" || ext === "yml") {
    return <span className="file-badge badge-config">CFG</span>;
  }
  if (lower === "dockerfile" || ext === "dockerignore") {
    return <span className="file-badge badge-docker">DOCKER</span>;
  }
  if (lower === "makefile") {
    return <span className="file-badge badge-make">MAKE</span>;
  }
  if (ext === "md" || lower.startsWith("readme")) {
    return <span className="file-badge badge-md">MD</span>;
  }
  if (ext === "docx") {
    return <span className="file-badge badge-docx">DOC</span>;
  }
  if (lower.startsWith(".git")) {
    return <span className="file-badge badge-git">GIT</span>;
  }

  return (
    <svg className="tree-icon icon-generic" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#64748b" />
      <polyline points="14 2 14 8 20 8" stroke="#64748b" />
    </svg>
  );
}

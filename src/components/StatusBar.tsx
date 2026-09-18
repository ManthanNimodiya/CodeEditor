interface StatusBarProps {
  activeFilePath: string | null;
  fileCount: number;
}

function detectLanguage(filePath: string | null): string {
  if (!filePath) return "Plain Text";
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    go: "Go",
    rs: "Rust",
    ts: "TypeScript",
    tsx: "TypeScript (React)",
    js: "JavaScript",
    jsx: "JavaScript (React)",
    py: "Python",
    json: "JSON",
    toml: "TOML",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    html: "HTML",
    css: "CSS",
    sql: "SQL",
    sh: "Shell Script",
    docx: "Word Document",
  };
  return map[ext] || (ext ? ext.toUpperCase() : "Plain Text");
}

export default function StatusBar({ activeFilePath, fileCount }: StatusBarProps) {
  const language = detectLanguage(activeFilePath);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item">UTF-8</div>
      </div>

      <div className="status-bar-right">
        <div className="status-item">{language}</div>
        <div className="status-item">
          {fileCount} {fileCount === 1 ? "file open" : "files open"}
        </div>
      </div>
    </div>
  );
}

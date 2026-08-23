import Editor from "@monaco-editor/react";
import DocxEditor from "./DocxEditor";

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  rs: "rust",
  py: "python",
  go: "go",
  md: "markdown",
  css: "css",
  html: "html",
  toml: "toml",
  yaml: "yaml",
  yml: "yaml",
};

function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

interface EditorPaneProps {
  path: string;
  content: string;
  visible: boolean;
  onChange: (path: string, value: string) => void;
}

export default function EditorPane({ path, content, visible, onChange }: EditorPaneProps) {
  if (path.toLowerCase().endsWith(".docx")) {
    return <DocxEditor path={path} visible={visible} />;
  }

  return (
    <div style={{ width: "100%", height: "100%", display: visible ? "block" : "none" }}>
      <Editor
        path={path}
        language={languageForPath(path)}
        value={content}
        theme="vs-dark"
        onChange={(value) => onChange(path, value ?? "")}
        options={{ minimap: { enabled: true }, fontSize: 13 }}
      />
    </div>
  );
}

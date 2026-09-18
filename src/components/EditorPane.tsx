import Editor, { type BeforeMount } from "@monaco-editor/react";
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
  sh: "shell",
  bash: "shell",
  sql: "sql",
  swift: "swift",
  kt: "kotlin",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  rb: "ruby",
  php: "php",
};

function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("deep-black", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7280", fontStyle: "italic" },
      { token: "keyword", foreground: "38bdf8" },
      { token: "keyword.control", foreground: "38bdf8" },
      { token: "storage", foreground: "38bdf8" },
      { token: "string", foreground: "fde047" },
      { token: "string.escape", foreground: "f59e0b" },
      { token: "number", foreground: "34d399" },
      { token: "constant", foreground: "34d399" },
      { token: "type", foreground: "2dd4bf" },
      { token: "class", foreground: "2dd4bf" },
      { token: "function", foreground: "67e8f9" },
      { token: "identifier", foreground: "e2e8f0" },
      { token: "variable", foreground: "93c5fd" },
      { token: "variable.language", foreground: "38bdf8" },
      { token: "operator", foreground: "cbd5e1" },
      { token: "punctuation", foreground: "94a3b8" },
      { token: "regexp", foreground: "f87171" },
      { token: "tag", foreground: "38bdf8" },
      { token: "attribute.name", foreground: "93c5fd" },
      { token: "attribute.value", foreground: "fde047" },
    ],
    colors: {
      "editor.background": "#050508",
      "editor.foreground": "#e2e8f0",
      "editorLineNumber.foreground": "#334155",
      "editorLineNumber.activeForeground": "#94a3b8",
      "editor.lineHighlightBackground": "#0e0e14",
      "editorCursor.foreground": "#38bdf8",
      "editor.selectionBackground": "#1e3a5f",
      "editor.inactiveSelectionBackground": "#172554",
      "editorWidget.background": "#0b0b10",
      "editorWidget.border": "#1e293b",
      "editorSuggestWidget.background": "#0b0b10",
      "editorSuggestWidget.border": "#1e293b",
      "editorSuggestWidget.selectedBackground": "#0369a1",
      "input.background": "#050508",
      "input.border": "#1e293b",
      "focusBorder": "#0284c7",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#33415544",
      "scrollbarSlider.hoverBackground": "#47556988",
      "minimap.background": "#050508",
    },
  });
};

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
        theme="deep-black"
        beforeMount={defineTheme}
        onChange={(value) => onChange(path, value ?? "")}
        options={{
          minimap: { enabled: true },
          fontSize: 13,
          lineHeight: 21,
          formatOnPaste: true,
          formatOnType: false,
          smoothScrolling: true,
          cursorSmoothCaretAnimation: "on",
          padding: { top: 8 },
          renderLineHighlight: "gutter",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true },
          fontLigatures: true,
        }}
      />
    </div>
  );
}

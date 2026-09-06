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
  monaco.editor.defineTheme("pure-black", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment",           foreground: "6a9955", fontStyle: "italic" },
      { token: "keyword",           foreground: "569cd6" },
      { token: "keyword.control",   foreground: "569cd6" },
      { token: "storage",           foreground: "569cd6" },
      { token: "string",            foreground: "ce9178" },
      { token: "string.escape",     foreground: "d7ba7d" },
      { token: "number",            foreground: "b5cea8" },
      { token: "constant",          foreground: "b5cea8" },
      { token: "type",              foreground: "4ec9b0" },
      { token: "class",             foreground: "4ec9b0" },
      { token: "function",          foreground: "dcdcaa" },
      { token: "identifier",        foreground: "cccccc" },
      { token: "variable",          foreground: "9cdcfe" },
      { token: "variable.language", foreground: "569cd6" },
      { token: "operator",          foreground: "cccccc" },
      { token: "punctuation",       foreground: "cccccc" },
      { token: "regexp",            foreground: "d16969" },
      { token: "tag",               foreground: "569cd6" },
      { token: "attribute.name",    foreground: "9cdcfe" },
      { token: "attribute.value",   foreground: "ce9178" },
    ],
    colors: {
      "editor.background":               "#1e1e1e",
      "editor.foreground":               "#cccccc",
      "editorLineNumber.foreground":     "#3c3c3c",
      "editorLineNumber.activeForeground": "#858585",
      "editor.lineHighlightBackground":  "#282828",
      "editorCursor.foreground":         "#aeafad",
      "editor.selectionBackground":      "#264f78",
      "editor.inactiveSelectionBackground": "#3a3d41",
      "editorWidget.background":         "#1c1c1c",
      "editorWidget.border":             "#333333",
      "editorSuggestWidget.background":  "#1c1c1c",
      "editorSuggestWidget.border":      "#333333",
      "editorSuggestWidget.selectedBackground": "#04395e",
      "input.background":                "#1a1a1a",
      "input.border":                    "#333333",
      "focusBorder":                     "#007acc",
      "scrollbar.shadow":                "#00000000",
      "scrollbarSlider.background":      "#42424266",
      "scrollbarSlider.hoverBackground": "#68686888",
      "minimap.background":              "#1a1a1a",
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
        theme="pure-black"
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
